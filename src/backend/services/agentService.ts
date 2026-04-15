import { audioService } from './audioService.js';
import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse } from './aiService.js';
import { redisService } from './redisService.js';
import { format, addMinutes, parseISO, isValid, isWithinInterval } from 'date-fns';
import { googleCalendarService } from './googleCalendarService.js';

/**
 * AgentService - Unifies the AI Intelligence and Automation logic.
 */
export class AgentService {
  async processIncoming(userId: string, incomingData: { 
    from: string, 
    body: string, 
    contactName: string, 
    messageId: string,
    displayPhone?: string,
    skipPersist?: boolean,
    isAudioRequest?: boolean
  }): Promise<{ text: string; audioBuffer?: Buffer } | string | null> {
    const { from, body, contactName, messageId, displayPhone, skipPersist = false, isAudioRequest = false } = incomingData;

    try {
      let dbUserId = userId;

      console.log(`[AgentService] 🚀 PROCESS INCOMING -> Using ID: ${userId}, Msg: "${body.substring(0, 30)}..."`);

      // 1. Thread and Status Management
      console.log('--- [DEBUG-AGENT] PROCESS_INCOMING START - VERSAO NOVA 2:00h ---');
      const cleanNumber = from.split('@')[0].replace(/\D/g, ''); 
      const threadId = `${userId}_${cleanNumber}`;
      
      let threadData: any = null;
      try {
        const { data } = await supabase.from('threads').select('*').eq('id', threadId).maybeSingle();
        threadData = data;
      } catch (err) {
        console.warn(`[AgentService] Thread check failed.`);
      }

      const currentStatus = threadData?.status || 'ia';

      // ================= HUMAN HAND-OFF CHECK =================
      const handoffKeywords = ['atendente', 'humano', 'falar com alguém', 'pessoa', 'suporte humano', 'quero falar com um atendente'];
      const needsHandoff = handoffKeywords.some(kw => body.toLowerCase().includes(kw));

      if (currentStatus === 'human' || needsHandoff) {
        if (needsHandoff && currentStatus !== 'human') {
          console.log(`[AgentService] Switching thread ${threadId} to HUMAN mode.`);
          await supabase.from('threads').update({ status: 'human' }).eq('id', threadId);
          
          if (!skipPersist) {
            await this.persistMessage(threadId, dbUserId, body, 'inbound', messageId, contactName, from, displayPhone);
          }
          
          const handoffMsg = "Entendido. Vou encerrar meu atendimento por aqui e um de nossos atendentes entrará em contato com você o mais breve possível. Até logo!";
          await this.persistMessage(threadId, dbUserId, handoffMsg, 'outbound', 'handoff-' + Date.now(), 'IA', 'system', '');

          try {
            const { data: prof } = await supabase.from('profiles').select('notification_phone').eq('id', dbUserId).single();
            if (prof?.notification_phone) {
              const { whatsappService } = await import('./whatsappService.js');
              await whatsappService.sendMessage(dbUserId, prof.notification_phone, 
                `⚠️ *ATENÇÃO: TRANSBORDO HUMANO*\n\nO cliente *${contactName}* (${displayPhone}) solicitou falar com um atendente.\n\nA IA encerrou o atendimento.`);
            }
          } catch (notifErr) {}

          return { text: handoffMsg };
        }

        if (!skipPersist) {
          await this.persistMessage(threadId, dbUserId, body, 'inbound', messageId, contactName, from, displayPhone);
        }
        return null;
      }

      // 2. Load Agent Config 
      let agentData: any = null;
      let activeProfessionals: any[] = [];

      const [{ data: agentRes, error: agentError }, { data: profsRes }] = await Promise.all([
        supabase.from('agents').select('*').eq('user_id', dbUserId).eq('status_ativo', true).limit(1).maybeSingle(),
        supabase.from('professionals').select('*').eq('user_id', dbUserId).eq('is_active', true)
      ]);
      
      if (agentError || !agentRes) {
        agentData = {
          nome: 'Natan', 
          prompt_base: 'Você é um assistente prestativo focado em atendimento ao cliente no WhatsApp.',
          voice_mode: 'disabled',
          voice_id: 'alloy'
        };
      } else {
        agentData = agentRes;
      }
      activeProfessionals = profsRes || [];

      // 3. Persistent History - Limit to last 10 messages to avoid AI confusion
      let history = await redisService.getHistory(threadId, 10);
      if (history.length === 0) {
        history = await this.getHistoryFromSupabase(threadId, 10);
      }

      // 4. Save Inbound Message
      if (!skipPersist) {
        await this.persistMessage(threadId, dbUserId, body, 'inbound', messageId, contactName, from, displayPhone);
        await redisService.pushMessage(threadId, 'user', body);
      }

      // 5. AI Loop (Process Tools)
      const systemPrompt = this.buildSystemPrompt(agentData, threadData, activeProfessionals);
      const now = new Date();
      const dateContext = `\n[CONTEXTO TEMPORAL]\nHOJE: ${format(now, 'dd/MM/yyyy')}\nDATA ATUAL: ${format(now, 'yyyy-MM-dd')}\n`;
      const fullPrompt = systemPrompt + dateContext;
      const tools = this.getSchedulingTools();

      let currentMessages: any[] = [
        ...history
          .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: body }
      ];

      let finalUsage = null;

      while (true) {
        console.log(`[AgentService] 🤖 IA está pensando... (Thread: ${threadId})`);
        const response = await generateAIResponse(fullPrompt, currentMessages, tools);
        
        if (!response || (!response.text && (!response.toolCalls || response.toolCalls.length === 0))) {
          console.warn(`[AgentService] ⚠️ Resposta da IA vazia na thread: ${threadId}. Encerrando loop.`);
          break;
        }

        console.log(`[AgentService] ✨ IA respondeu! (Thread: ${threadId})`);

        if (response.usage) {
          finalUsage = response.usage;
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          toolCalledInThisTurn = true;
          currentMessages.push({ role: 'assistant', content: response.text || '', tool_calls: response.toolCalls });

          for (const toolCall of response.toolCalls) {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            console.log(`[AgentService] 🛠️ TOOL CALL: ${functionName}`, args);
            
            let toolResult;

            if (functionName === 'check_availability') {
              toolResult = await this.handleCheckAvailability(dbUserId, args.date, agentData, activeProfessionals, args.professional_name);
            } else if (functionName === 'book_appointment') {
              toolResult = await this.handleBookAppointment(dbUserId, threadId, contactName, args, agentData, activeProfessionals);
              if (toolResult.success && args.clientName) {
                await supabase.from('threads').update({ lead_name: args.clientName }).eq('id', threadId);
              }
            }

            console.log(`[AgentService] ✅ TOOL RESULT: ${functionName}`, toolResult);

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify(toolResult)
            });
          }
        } else {
          console.log(`[AgentService] ✨ AI RESPONSE GENERATED: "${response.text?.substring(0, 50)}..."`);
          aiFinalText = response.text;
          break;
        }
      }

      if (!aiFinalText && !toolCalledInThisTurn) {
        aiFinalText = "Hm, tive um pequeno problema técnico aqui. Poderia repetir o que você disse? Vou adorar te ajudar!";
      }

      // 8. Handle Voice
      let voiceBuffer: Buffer | undefined;
      const voiceMode = agentData.voice_mode || 'disabled';
      const shouldGenerateVoice = (voiceMode === 'always') || (voiceMode === 'audio_only' && isAudioRequest);

      if (aiFinalText && shouldGenerateVoice) {
        try {
          voiceBuffer = await audioService.generateSpeech(aiFinalText, agentData.voice_id || 'alloy');
        } catch (vErr) {}
      }

      if (aiFinalText) {
        const aiMsgId = `ai-${Date.now()}`;
        await this.persistMessage(threadId, dbUserId, aiFinalText, 'outbound', aiMsgId, contactName, from, displayPhone, agentData?.nome, finalUsage);
        await redisService.pushMessage(threadId, 'assistant', aiFinalText);
        return { text: aiFinalText, audioBuffer: voiceBuffer };
      }
      return null;
    } catch (error) {
      console.error('[AgentService] Fatal error:', error);
      throw error;
    }
  }

  public async persistMessage(
    threadId: string, 
    userId: string, 
    text: string, 
    direction: 'inbound' | 'outbound', 
    messageId: string, 
    contactName?: string,
    remoteJid?: string,
    displayPhone?: string,
    agentName?: string,
    usage?: any
  ) {
    const timestamp = Date.now();
    
    // 1. Thread UPSERT FIRST
    try {
      const cleanPhone = (displayPhone || threadId.split('_')[1] || '').replace(/\D/g, '');
      const threadData: any = {
        id: threadId,
        user_id: userId,
        last_message: text.substring(0, 1000),
        last_message_time: new Date(timestamp).toISOString(),
        status: direction === 'outbound' ? 'ia' : 'ia', 
        contact_name: contactName || 'Cliente',
        remote_jid: remoteJid || `${cleanPhone}@c.us`,
        display_phone: cleanPhone,
        agent_name: agentName || 'Sofia'
      };
      
      const { error: tErr } = await supabase.from('threads').upsert(threadData);
      
      if (tErr) {
        console.warn('[AgentService] Initial thread upsert failed, retrying minimal set...', tErr.message);
        // Minimal fallback to ensure persistence
        const { error: fErr } = await supabase.from('threads').upsert({
          id: threadId,
          user_id: userId,
          last_message: text.substring(0, 1000),
          last_message_time: new Date(timestamp).toISOString(),
          remote_jid: threadData.remote_jid
        });
        if (fErr) console.error('[DEBUG-THREADS-FATAL] FAILED EVEN MINIMAL UPSERT:', fErr);
      }
    } catch (err) {
      console.error('[AgentService] Thread sync error:', err);
    }

    // 2. Message Second
    try {
       const messageData: any = {
        user_id: userId,
        thread_id: threadId,
        text: text,
        direction: direction,
        timestamp: timestamp
      };

      if (usage) {
        messageData.tokens_prompt = usage.prompt_tokens || 0;
        messageData.tokens_completion = usage.completion_tokens || 0;
        messageData.cost_brl = usage.cost_brl || 0;
      }

       const { error: mErr } = await supabase.from('messages').insert(messageData);
      
      if (mErr) {
        console.warn('[AgentService] ⚠️ Falha na persistência completa da mensagem. Provável script SQL não executado.', mErr.message);
        
        // --- FALLBACK: Try minimal insert without finance columns ---
        if (usage) {
          console.log('[AgentService] 🔄 Tentando persistência minimalista (sem dados financeiros)...');
          const { error: fErr } = await supabase.from('messages').insert({
            user_id: userId,
            thread_id: threadId,
            text: text,
            direction: direction,
            timestamp: timestamp
          });
          if (fErr) console.error('[AgentService] ❌ Falha crítica: Nem a persistência mínima funcionou:', fErr);
          else console.log('[AgentService] ✅ Mensagem salva com sucesso usando fallback.');
        } else {
           console.error('[AgentService] ❌ Erro de persistência (sem uso de IA):', mErr);
        }
      }
    } catch (mErr) {
       console.error('[AgentService] Message insert exception:', mErr);
    }

    // 3. Update Contact
    try {
      const cleanPhone = (displayPhone || threadId.split('_')[1]).replace(/\D/g, '');
      await this.upsertContact(userId, cleanPhone, contactName, text, direction === 'inbound');
    } catch (dbErr) {}
  }

  private async upsertContact(userId: string, phoneNumber: string, contactName: string | undefined, lastMessage: string, incrementCount: boolean = true) {
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const contactId = `${userId}_${cleanPhone}`;
      const { data: existing } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle();

      const contactData: any = {
        ultima_mensagem: lastMessage,
        ultima_interacao: new Date().toISOString(),
      };

      if (!existing) {
        const { error: insErr } = await supabase.from('contacts').insert({
          id: contactId,
          user_id: userId,
          nome: contactName || cleanPhone,
          telefone: cleanPhone,
          status_funil: 'Lead',
          source: 'whatsapp',
          ...contactData,
          primeiro_contato: new Date().toISOString(),
          data_criacao: new Date().toISOString(),
          total_mensagens: 1
        });
        if (insErr) console.error('[DEBUG-CONTACTS] ERRO AO INSERIR CONTATO:', JSON.stringify(insErr, null, 2));
      } else {
        if (contactName) contactData.nome = contactName;
        if (incrementCount) contactData.total_mensagens = (existing.total_mensagens || 0) + 1;
        const { error: updErr } = await supabase.from('contacts').update(contactData).eq('id', contactId);
        if (updErr) console.error('[DEBUG-CONTACTS] ERRO AO ATUALIZAR CONTATO:', JSON.stringify(updErr, null, 2));
      }
    } catch (error) {
      console.error('[AgentService] Contact error:', error);
    }
  }

  private buildSystemPrompt(agentData: any, threadData: any, professionals: any[]) {
    const leadName = threadData?.lead_name || null;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const dayStr = now.toLocaleDateString('pt-BR', { weekday: 'long' });

    return `Você é assistente virtual da ${agentData.company_name || 'Nossa Empresa'}. 
OBJETIVO: Atendimento consultivo e agendamento.
NOME DO CLIENTE: ${leadName || 'Pergunte o nome se ainda não souber'}.

CONTEXTO TEMPORAL:
- Hoje é ${dayStr}, dia ${dateStr}.
- Horário Atual: ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

REGRAS DE AGENDAMENTO:
1. Se o cliente falar uma data (ex: "dia 15", "amanhã"), use a ferramenta 'check_availability'.
2. Se o horário estiver vago, sugira o agendamento. Se estiver ocupado, sugira outro.
3. Não invente horários.

PROMPT BASE:
${agentData.prompt_base || 'Seja prestativo e profissional.'}`;
  }

  private getSchedulingTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'Consulta horários disponíveis para uma data (ex: 2026-04-15).',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Data YYYY-MM-DD' },
              professional_name: { type: 'string' }
            },
            required: ['date']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'book_appointment',
          description: 'Realiza o agendamento de uma consulta.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              time: { type: 'string' },
              clientName: { type: 'string' },
              professional_name: { type: 'string' }
            },
            required: ['date', 'time', 'clientName']
          }
        }
      }
    ];
  }

  private async handleCheckAvailability(userId: string, targetDate: string, agentData: any, professionals: any[], profName?: string) {
    try {
      // 1. Get all standard slots
      let allSlots = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
      
      // 2. Fetch existing appointments for this user and date
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('time')
        .eq('user_id', userId)
        .eq('data', targetDate)
        .neq('status', 'cancelled');

      // 3. Filter out busy slots
      if (existingAppts && existingAppts.length > 0) {
        const busyTimes = existingAppts.map(a => {
          // Ensure time format matches (HH:mm)
          return a.time.substring(0, 5);
        });
        allSlots = allSlots.filter(slot => !busyTimes.includes(slot));
      }

      return { 
        slots: allSlots, 
        date: targetDate,
        total_available: allSlots.length
      }; 
    } catch (e) {
      console.error('[AgentService] Check availability error:', e);
      return { slots: ['09:00', '14:00', '16:00'], date: targetDate, is_fallback: true };
    }
  }

  private async handleBookAppointment(userId: string, threadId: string, contactName: string, args: any, agentData: any, professionals: any[]) {
    try {
      const { data: newDoc, error } = await supabase.from('appointments').insert({
        user_id: userId,
        data: args.date,
        time: args.time,
        client_name: args.clientName,
        client_phone: threadId.split('_')[1],
        status: 'confirmed'
      }).select().single();
      if (error) throw error;
      return { success: true, id: newDoc.id };
    } catch (e) { return { success: false }; }
  }

  private async getHistoryFromSupabase(threadId: string, limit: number) {
    const { data } = await supabase.from('messages').select('text, direction').eq('thread_id', threadId).order('timestamp', { ascending: false }).limit(limit);
    return (data || []).reverse().map(d => ({
      role: d.direction === 'inbound' ? 'user' : 'assistant',
      content: d.text
    }));
  }
  public async syncContactsFromThreads(userId: string) {
     console.log(`[AgentService] 🔄 Syncing contacts for userId: ${userId}`);
     try {
       const { data: threads, error: tErr } = await supabase
         .from('threads')
         .select('*')
         .eq('user_id', userId);
       
       if (tErr) throw tErr;
       if (!threads || threads.length === 0) return { success: true, synced: 0 };

       let synced = 0;
       for (const thread of threads) {
         const cleanPhone = (thread.display_phone || thread.remote_jid?.split('@')[0] || '').replace(/\D/g, '');
         if (!cleanPhone) continue;

         const contactId = `${userId}_${cleanPhone}`;
         const { data: existing } = await supabase.from('contacts').select('id').eq('id', contactId).maybeSingle();

         if (!existing) {
           await this.upsertContact(userId, cleanPhone, thread.contact_name, thread.last_message || '', false);
           synced++;
         }
       }
       return { success: true, synced };
     } catch (err: any) {
       console.error('[AgentService] Sync error:', err);
       throw err;
     }
  }
}

export const agentService = new AgentService();
