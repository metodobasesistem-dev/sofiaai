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

      // [CRITICAL-HOSTINGER] Resolve UUID if userId project name or email is passed instead of UUID
      if (userId.includes('@')) {
        console.log(`[AgentService] 🔍 Detected email-based userId: ${userId}. Resolving real UUID...`);
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', userId)
          .maybeSingle();
        
        if (prof?.id) {
          dbUserId = prof.id;
          console.log(`[AgentService] ✅ Resolved email ${userId} to UUID: ${dbUserId}`);
        } else {
          console.warn(`[AgentService] ⚠️ Could not resolve UUID for email ${userId}. Profile error:`, profErr?.message);
        }
      }

      console.log(`[AgentService] 🚀 PROCESS INCOMING -> Using DB ID: ${dbUserId}, Msg: "${body.substring(0, 30)}..."`);

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
      
      if (agentError) {
        console.error('[AgentService] ❌ Error fetching agent from Supabase:', agentError);
        return null;
      }

      if (!agentRes) {
        console.log(`[AgentService] 🛑 No ACTIVE agent found for user ${dbUserId} (Original: ${userId}). AI response skipped.`);
        // [DEBUG] Let's list ANY agent to see if it exists but is inactive
        const { data: anyAgent } = await supabase.from('agents').select('nome, status_ativo').eq('user_id', dbUserId).limit(1).maybeSingle();
        if (anyAgent) {
          console.log(`[AgentService] Found agent "${anyAgent.nome}" but status_ativo is ${anyAgent.status_ativo}`);
        } else {
          console.log(`[AgentService] No agents AT ALL found for user ${dbUserId}`);
        }
        return null;
      }

      agentData = agentRes;
      console.log(`[AgentService] 🧠 Agent found: "${agentData.nome}". Proceeding with AI loop.`);
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
      let aiFinalText: string | null = null;
      let toolCalledInThisTurn = false;

      while (true) {
        console.log(`[AgentService] 🤖 IA está pensando... (Thread: ${threadId})`);
        const response = await generateAIResponse(fullPrompt, currentMessages, tools, 'auto', dbUserId);
        
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
        return { text: aiFinalText, audioBuffer: voiceBuffer, voiceMode, aiMsgId };
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
    usage?: any,
    audioUrl?: string
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
         id: messageId, // Agora incluímos o ID original do WhatsApp
         user_id: userId,
         thread_id: threadId,
         text: text,
         direction: direction,
         timestamp: timestamp,
         audio_url: audioUrl,
         created_at: new Date(timestamp).toISOString() // Força consistência temporal
       };
 
       if (usage) {
         messageData.tokens_prompt = usage.prompt_tokens || 0;
         messageData.tokens_completion = usage.completion_tokens || 0;
         messageData.cost_brl = usage.cost_brl || 0;
       }
 
        // Usamos upsert com onConflict: 'id' para evitar duplicatas de polling/webhook
        const { error: mErr } = await supabase.from('messages').upsert(messageData, { onConflict: 'id' });
       
       if (mErr) {
         console.warn('[AgentService] ⚠️ Falha na persistência idempotente. Tentando sem campos financeiros...', mErr.message);
         
         // --- FALLBACK: Try minimal upsert ---
         const { error: fErr } = await supabase.from('messages').upsert({
           id: messageId,
           user_id: userId,
           thread_id: threadId,
           text: text,
           direction: direction,
           timestamp: timestamp
         }, { onConflict: 'id' });
         
         if (fErr) console.error('[AgentService] ❌ Falha crítica de persistência:', fErr);
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

    // 1. Process Knowledge Base
    let kbOutput = '';
    if (agentData.knowledge_base && Array.isArray(agentData.knowledge_base)) {
      kbOutput = agentData.knowledge_base.map((item: any) => {
        if (item.type === 'qa') return `P: ${item.question}\nR: ${item.answer}`;
        return `[UNIDADE DE CONHECIMENTO: ${item.title}]\n${item.content}`;
      }).join('\n\n');
    }

    // 2. Process Professionals Info
    let profsInfo = '';
    if (professionals && professionals.length > 0) {
      profsInfo = professionals.map(p => {
        return `- ${p.name}: ${p.specialties}. ${p.bio || ''}`;
      }).join('\n');
    }

    return `Você é assistente virtual da ${agentData.company_name || 'Nossa Empresa'}. 
OBJETIVO: Atendimento consultivo e agendamento.
NOME DO CLIENTE: ${leadName || 'Pergunte o nome se ainda não souber'}.

CONTEXTO TEMPORAL:
- Hoje é ${dayStr}, dia ${dateStr}.
- Horário Atual: ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

SOBRE A EMPRESA:
${agentData.company_description || ''}

PRODUTOS E SERVIÇOS:
${agentData.company_products || ''}

PERGUNTAS FREQUENTES (FAQ):
${agentData.company_faq || ''}

NOSSA EQUIPE:
${profsInfo || 'Consulte os horários disponíveis se necessário.'}

BASE DE CONHECIMENTO ADICIONAL:
${kbOutput || 'Use as informações acima para guiar o cliente.'}

LINKS E CONTATOS:
${agentData.company_links || ''}

REGRAS DE AGENDAMENTO (OBRIGATÓRIAS):
1. Antes de informar disponibilidade, você DEVE SEMPRE chamar a ferramenta 'check_availability' para a data solicitada. Nunca invente que um horário está livre.
2. Para realizar/confirmar o agendamento no sistema, você DEVE obrigatoriamente chamar a ferramenta 'book_appointment'. 
3. Somente confirme o agendamento para o cliente APÓS a ferramenta 'book_appointment' retornar sucesso.
4. Formatos obrigatórios para ferramentas: Data (YYYY-MM-DD) e Horário (HH:mm). Hoje é ${dateStr}.

PROMPT BASE (CUSTOMIZADO PELO USUÁRIO):
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

  private async asyncFilter(arr: any[], predicate: any) {
    const results = await Promise.all(arr.map(predicate));
    return arr.filter((_v, index) => results[index]);
  }

  private async handleCheckAvailability(userId: string, targetDate: string, agentData: any, professionals: any[], profName?: string) {
    try {
      console.log(`[AgentService] 🔍 Checking REAL availability for ${targetDate} (Professional: ${profName || 'Any'})`);
      
      let selectedProf = profName 
        ? professionals.find(p => p.name.toLowerCase().includes(profName.toLowerCase()))
        : (professionals.length > 0 ? professionals[0] : null);

      // FALLBACK: Agenda Universal
      if (!selectedProf) {
        console.log(`[AgentService] ℹ️ No specific professional found. Using Universal Agenda for ${userId}`);
        selectedProf = {
          id: null, // Deixamos null para buscar disponibilidade universal
          name: agentData.company_name || 'Agenda Principal',
          google_calendar_id: null
        };
      }

      // 1. Fetch Availability Config for this prof
      const { data: availData } = await supabase
        .from('availability')
        .select('config')
        .eq('user_id', userId)
        .eq('professional_id', selectedProf.id)
        .maybeSingle();

      const config = availData?.config || { weekly: [], specificDates: [] };
      const duration = agentData.appointment_duration || 30;

      // 2. Determine base slots for this specific date
      const specific = config.specificDates?.find((sd: any) => sd.date === targetDate);
      let baseSlotsConfigs = [];

      if (specific) {
        console.log(`[AgentService] 📌 Exception date found for ${targetDate}`);
        baseSlotsConfigs = specific.slots || [];
      } else {
        const daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const dayName = daysOfWeek[new Date(`${targetDate}T12:00:00`).getDay()];
        const weekly = config.weekly?.find((w: any) => w.day === dayName);
        
        if (weekly?.active) {
          baseSlotsConfigs = weekly.slots || [];
        }
      }

      // EMERGENCY FALLBACK: Se não houver nenhum horário configurado, assume 09:00-12:00 e 13:00-18:00
      if (baseSlotsConfigs.length === 0) {
        console.log(`[AgentService] 🛠️ No availability config found for ${selectedProf.name}. Using emergency default slots (09-18h).`);
        baseSlotsConfigs = [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '18:00' }
        ];
      }

      // 3. Generate time slots based on duration
      let allSlots: string[] = [];
      baseSlotsConfigs.forEach((range: any) => {
        let current = this.timeToMinutes(range.start);
        const end = this.timeToMinutes(range.end);
        while (current + duration <= end) {
          allSlots.push(this.minutesToTime(current));
          current += duration;
        }
      });

      if (allSlots.length === 0) {
        return { slots: [], date: targetDate, professional: selectedProf.name, message: 'Sem horários disponíveis.' };
      }

      // 4. Google Calendar Busy (Resiliente)
      let busyTimesFromGoogle: string[] = [];
      if (selectedProf.google_calendar_id) {
        try {
          const googleBusy = await googleCalendarService.getBusySlots(userId, selectedProf.google_calendar_id, targetDate);
          googleBusy.forEach((b: any) => {
            const start = new Date(b.start).getTime();
            const end = new Date(b.end).getTime();
            allSlots.forEach(slot => {
              const slotTime = new Date(`${targetDate}T${slot}:00`).getTime();
              if (slotTime >= start && slotTime < end) busyTimesFromGoogle.push(slot);
            });
          });
        } catch (gErr) {
          console.warn(`[AgentService] ⚠️ Google Calendar fetch failed for ${selectedProf.name}. Continuing with local agenda only.`);
        }
      }

      // 5. DB Appointments
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('time')
        .eq('user_id', userId)
        .eq('professional_id', selectedProf.id)
        .eq('data', targetDate)
        .neq('status', 'cancelled');

      const busyTimesFromDB = (existingAppts || []).map(a => a.time.substring(0, 5));

      // 6. Final Filter
      const totalBusy = Array.from(new Set([...busyTimesFromGoogle, ...busyTimesFromDB]));
      const availableSlots = allSlots.filter(slot => !totalBusy.includes(slot));

      return { slots: availableSlots, date: targetDate, professional: selectedProf.name, total_available: availableSlots.length }; 
    } catch (e: any) {
      console.error('[AgentService] Check availability error:', e);
      return { slots: [], date: targetDate, error: e.message };
    }
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private async handleBookAppointment(userId: string, threadId: string, contactName: string, args: any, agentData: any, professionals: any[]) {
    try {
      console.log(`[AgentService] 📝 Booking appointment for ${args.clientName} on ${args.date} at ${args.time}`);
      
      let selectedProf = args.professional_name 
        ? professionals.find(p => p.name.toLowerCase().includes(args.professional_name.toLowerCase()))
        : (professionals.length > 0 ? professionals[0] : null);

      let isUniversal = false;
      if (!selectedProf) {
        isUniversal = true;
        selectedProf = {
          id: null, // Deixamos null para evitar erro de chave estrangeira
          name: agentData.company_name || 'Agenda Principal'
        };
      }

      // 1. Create in Google Calendar if integrated
      let googleEventId = null;
      if (selectedProf?.google_calendar_id) {
        try {
          const start = new Date(`${args.date}T${args.time}:00`);
          const end = new Date(start.getTime() + (agentData.appointment_duration || 30) * 60000);
          
          const event = await googleCalendarService.createEvent(userId, selectedProf.google_calendar_id, {
            summary: `📅 Agendamento: ${args.clientName} (${agentData.nome})`,
            description: `Agendamento realizado via WhatsApp AI.\nCliente: ${contactName}\nProtocolo: ${threadId}`,
            start: start.toISOString(),
            end: end.toISOString()
          });
          googleEventId = event.id;
        } catch (gErr) {
          console.error('[AgentService] Failed to create Google Event:', gErr);
        }
      }

      // 2. Save in Local DB
      const { data: newDoc, error } = await supabase.from('appointments').insert({
        user_id: userId,
        data: args.date,
        time: args.time,
        client_name: args.clientName,
        client_phone: threadId.split('_')[1],
        status: 'confirmed',
        professional_id: selectedProf?.id,
        professional_name: selectedProf?.name,
        google_event_id: googleEventId,
        agent_id: agentData.id,
        summary: `Agendado com ${selectedProf?.name || 'IA'}`
      }).select().single();

      if (error) throw error;
      
      return { 
        success: true, 
        id: newDoc.id, 
        professional: selectedProf?.name || null,
        google_synced: !!googleEventId 
      };
    } catch (e) { 
      console.error('[AgentService] Book appointment error:', e);
      return { success: false }; 
    }
  }

  private async getHistoryFromSupabase(threadId: string, limit: number) {
    const { data } = await supabase.from('messages').select('text, direction').eq('thread_id', threadId).order('timestamp', { ascending: false }).limit(limit);
    return (data || []).reverse().map(d => ({
      role: d.direction === 'inbound' ? 'user' : 'assistant',
      content: d.text
    }));
  }
  public async processChatSimulation(userId: string, agentData: any, messages: any[]): Promise<{ text: string; audioBuffer?: Buffer }> {
    try {
      console.log(`[AgentService] 🧪 SIMULATION START for user ${userId}`);
      
      // 1. Fetch real professionals for context
      const { data: professionals } = await supabase
        .from('professionals')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      // 2. Prepare System Prompt
      const systemPrompt = this.buildSystemPrompt(agentData, { lead_name: 'Cliente Teste' }, professionals || []);
      const dateContext = `\n[CONTEXTO TEMPORAL/SIMULAÇÃO]\nHOJE: ${format(new Date(), 'dd/MM/yyyy')}\nDATA ATUAL: ${format(new Date(), 'yyyy-MM-dd')}\n`;
      const fullPrompt = systemPrompt + dateContext;

      // 3. AI Execution Loop
      const tools = this.getSchedulingTools();
      let currentMessages = [...messages];
      let aiFinalText: string | null = null;

      while (true) {
        console.log(`[AgentService] 🤖 Simulation IA is thinking...`);
        const response = await generateAIResponse(fullPrompt, currentMessages, tools, 'auto', userId);
        
        if (!response || (!response.text && (!response.toolCalls || response.toolCalls.length === 0))) break;

        if (response.toolCalls && response.toolCalls.length > 0) {
          currentMessages.push({ role: 'assistant', content: response.text || '', tool_calls: response.toolCalls });

          for (const toolCall of response.toolCalls) {
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            
            let toolResult;
            if (functionName === 'check_availability') {
              toolResult = await this.handleCheckAvailability(userId, args.date, agentData, professionals || [], args.professional_name);
            } else if (functionName === 'book_appointment') {
              // IN SIMULATION: We mock the success but don't persist in DB
              toolResult = { success: true, id: 'sim-appt-' + Date.now(), is_simulation: true };
            }

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify(toolResult)
            });
          }
        } else {
          aiFinalText = response.text;
          break;
        }
      }

      // 4. Handle Voice (Simulation)
      let voiceBuffer: Buffer | undefined;
      if (aiFinalText && agentData.voice_mode !== 'disabled') {
        try {
          voiceBuffer = await audioService.generateSpeech(aiFinalText, agentData.voice_id || 'alloy');
        } catch (vErr) {}
      }

      return { 
        text: aiFinalText || "Desculpe, não consegui processar sua mensagem no simulador.", 
        audioBuffer: voiceBuffer 
      };
    } catch (error) {
      console.error('[AgentService] Simulation error:', error);
      throw error;
    }
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
