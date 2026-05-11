import { audioService } from './audioService.js';
import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse } from './aiService.js';
import { redisService } from './redisService.js';
import { format, addMinutes, parseISO, isValid, isWithinInterval } from 'date-fns';
import { googleCalendarService } from './googleCalendarService.js';
import { EvolutionApiService } from './evolutionApiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { normalizePhone } from '../lib/phoneHelper.js';

/**
 * Retry com backoff exponencial para operações de banco de dados.
 * Protege contra falhas transitórias de rede e sobrecarga do Supabase.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 300): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      // Não retenta em erros de constraint (23505=duplicado, 23503=FK)
      if (err?.code === '23505' || err?.code === '23503') throw err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 300ms, 600ms, 1200ms
        console.warn(`[withRetry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`, err?.message || err);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}



export async function logToDB(userId: string, level: string, module: string, message: string, metadata: any = {}) {
  try {
    await supabase.from('sys_logs').insert({
      user_id: userId,
      level,
      module,
      message,
      metadata,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to log to DB:', e);
  }
}

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
    isAudioRequest?: boolean,
    mediaUrl?: string,
    mediaMimeType?: string
  }): Promise<{ text: string; audioBuffer?: Buffer } | string | null> {
    const { from, body, contactName, messageId, displayPhone, skipPersist = false, isAudioRequest = false, mediaUrl, mediaMimeType } = incomingData;

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
      const cleanNumber = normalizePhone(from);
      const threadId = `${userId}_${cleanNumber}`;

      
      let threadData: any = null;
      try {
        const cleanPhone = normalizePhone(from);
        const contactId = `${userId}_${cleanPhone}`;
        const [{ data: tData }, { data: cData }] = await Promise.all([
          supabase.from('threads').select('*').eq('id', threadId).maybeSingle(),
          supabase.from('contacts').select('ad_tracking').eq('id', contactId).maybeSingle()
        ]);
        threadData = tData ? { ...tData, ad_tracking: cData?.ad_tracking } : null;
      } catch (err) {
        console.warn(`[AgentService] Thread/Contact check failed.`);
      }

      const currentStatus = threadData?.status || 'ia';

      // ================= HUMAN MODE CHECK =================
      if (currentStatus === 'human') {
        if (!skipPersist) {
          await this.persistMessage(threadId, dbUserId, body, 'inbound', messageId, contactName, from, displayPhone);
        }
        return { status: 'human' } as any;
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

      // 2.1 Load Additional Knowledge Blocks
      const { data: knowledgeBlocks } = await supabase
        .from('agent_knowledge')
        .select('*')
        .eq('agent_id', agentData.id)
        .eq('is_active', true);

      // 3. Persistent History - Improved Context (Last 20 messages)
      let history = await redisService.getHistory(threadId, 20);
      if (history.length === 0) {
        history = await this.getHistoryFromSupabase(threadId, 20);
      }

      // 4. Save Inbound Message
      if (!skipPersist) {
        await this.persistMessage(threadId, dbUserId, body, 'inbound', messageId, contactName, from, displayPhone);
        await redisService.pushMessage(threadId, 'user', body);
      }

      // 5. AI Loop (Process Tools)
      const systemPrompt = this.buildSystemPrompt(agentData, threadData, activeProfessionals, knowledgeBlocks || []);
      const now = new Date();
      const dateContext = `\n[CONTEXTO TEMPORAL]\nHOJE: ${format(now, 'dd/MM/yyyy')}\nDATA ATUAL: ${format(now, 'yyyy-MM-dd')}\n`;
      const fullPrompt = systemPrompt + dateContext;
      const tools = this.getAgentTools();


      let currentMessages: any[] = [
        ...history
          .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: body, mediaUrl, mediaMimeType }
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

            if (functionName === 'Agendar') {
              if (args.acao === 'agendar') {
                toolResult = await this.handleBookAppointment(dbUserId, threadId, contactName, args, agentData, activeProfessionals);
                if (toolResult.success && args.clientName) {
                  await supabase.from('threads').update({ lead_name: args.clientName }).eq('id', threadId);
                }
              } else {
                toolResult = await this.handleCheckAvailability(dbUserId, args.date, agentData, activeProfessionals, args.professional_name);
              }
            } else if (functionName === 'servicoTool') {
              toolResult = await this.handleSearchCatalog(dbUserId, args.pergunta || args.query);
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
        if (!skipPersist) {
          await this.persistMessage(threadId, dbUserId, aiFinalText, 'outbound', aiMsgId, contactName, from, displayPhone, agentData?.nome, finalUsage);
          await redisService.pushMessage(threadId, 'assistant', aiFinalText);
        }
        return { text: aiFinalText, audioBuffer: voiceBuffer, voiceMode, aiMsgId };
      }
      return null;
    } catch (error) {
      console.error('[AgentService] Fatal error in processIncoming:', error);
      
      // FALLBACK DE SEGURANÇA: Se tudo falhar, tenta enviar uma mensagem amigável para não deixar o cliente no vácuo
      const fallbackMsg = "Peço desculpas, tive uma pequena instabilidade técnica para processar sua solicitação agora. Poderia repetir por favor? Estarei aqui para te ajudar!";
      return { text: fallbackMsg };
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
    audioUrl?: string,
    messageType: string = 'text',
    mediaUrl?: string,
    mediaMimeType?: string,
    mediaFileName?: string,
    caption?: string,
    isExternal: boolean = false,
    quotedId?: string,
    quotedText?: string,
    contactJid?: string
  ) {
    const timestamp = Date.now();
    console.log(`[AgentService] 💾 Persisting message: ${messageId} | Thread: ${threadId} | Direction: ${direction} | Type: ${messageType}`);
    
      // 1. Thread UPSERT FIRST — com retry automático
    try {
      const cleanPhone = normalizePhone(displayPhone || (threadId.includes('_') ? threadId.split('_')[1] : threadId));
      let [{ data: existingThread }, { data: contact }] = await Promise.all([
        supabase.from('threads').select('contact_name, profile_picture_url, profile_picture_updated_at, unread_count, ticket_status').eq('id', threadId).maybeSingle(),
        supabase.from('contacts').select('nome, status_funil').eq('id', `${userId}_${cleanPhone}`).maybeSingle()
      ]);
      
      // [FIX] Busca aproximada para lidar com o 9º dígito se não encontrar por ID exato
      if (!contact && cleanPhone.startsWith('55')) {
        const last8 = cleanPhone.slice(-8);
        const { data: fuzzyContact } = await supabase
          .from('contacts')
          .select('nome, status_funil')
          .eq('user_id', userId)
          .ilike('telefone', `%${last8}`)
          .maybeSingle();
        contact = fuzzyContact;
      }

      const newUnreadCount = direction === 'inbound' 
        ? (existingThread?.unread_count || 0) + 1 
        : (existingThread?.unread_count || 0);

      // Lógica de Reabertura Automática (Resolvido -> Lead)
      let finalTicketStatus = existingThread?.ticket_status || 'open';
      let finalFunilStatus = contact?.status_funil;

      if (direction === 'inbound' && (finalTicketStatus === 'resolved' || finalFunilStatus === 'Resolvido')) {
        console.log(`[AgentService] 🔄 Reopening resolved thread for ${cleanPhone}. Moving back to Lead.`);
        finalTicketStatus = 'open';
        finalFunilStatus = 'Lead';
        await supabase.from('contacts').update({ status_funil: 'Lead' }).eq('id', `${userId}_${cleanPhone}`);
      }

      const threadData: any = {
        id: threadId,
        user_id: userId,
        last_message: text.substring(0, 1000),
        last_message_time: new Date(timestamp).toISOString(),
        status: 'ia',
        remote_jid: remoteJid || `${cleanPhone}@s.whatsapp.net`,
        display_phone: cleanPhone,
        agent_name: agentName || 'Sofia',
        // [FIX] Prioridade: CRM > Nome já salvo na Thread > PushName do WhatsApp > Número
        // Nunca deixa o número sobrescrever um nome real
        contact_name: (() => {
          const isPhone = (s: string) => !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;
          
          if (contact?.nome && !isPhone(contact.nome)) return contact.nome;
          if (existingThread?.contact_name && !isPhone(existingThread.contact_name)) return existingThread.contact_name;
          if (contactName && !isPhone(contactName)) return contactName;
          return contact?.nome || existingThread?.contact_name || contactName || cleanPhone;
        })(),
        unread_count: newUnreadCount,
        ticket_status: finalTicketStatus,
        updated_at: new Date(timestamp).toISOString()
      };

      // [FOTO] Preserva a foto existente — nunca sobrescreve com null
      if (existingThread?.profile_picture_url) {
        threadData.profile_picture_url = existingThread.profile_picture_url;
        threadData.profile_picture_updated_at = existingThread.profile_picture_updated_at;
      }

      await withRetry(async () => {
        const { error: tErr } = await supabase.from('threads').upsert(threadData);
        if (tErr) throw tErr;
      });

    } catch (err: any) {
      console.error('[AgentService] Thread sync error (all retries exhausted):', err?.message || err);
      // Fallback mínimo para garantir que a thread existe
      try {
        const cleanPhone = normalizePhone(displayPhone || (threadId.includes('_') ? threadId.split('_')[1] : threadId));
        await supabase.from('threads').upsert({
          id: threadId,
          user_id: userId,
          last_message: text.substring(0, 1000),
          last_message_time: new Date(timestamp).toISOString(),
          remote_jid: remoteJid || `${cleanPhone}@s.whatsapp.net`
        });
      } catch (fbErr) {
        console.error('[AgentService] FATAL: Even fallback thread upsert failed:', fbErr);
      }
    }

    // 2. Message Second
    try {
        if (!messageId || messageId === '') {
          console.warn(`[AgentService] ⚠️ Skipping persistence: messageId is empty for thread ${threadId}`);
          return;
        }

        const messageData: any = {
         id: messageId,
         user_id: userId,
         thread_id: threadId,
         text: text,
         direction: direction,
         status: 'sent',        // ← Fase 3: campo status obrigatório
         timestamp: timestamp,
         audio_url: audioUrl || mediaUrl, // Compatibility with audio_url
         message_type: messageType,
         media_url: mediaUrl,
         media_mime_type: mediaMimeType,
         media_filename: mediaFileName,
         caption: caption,
         is_external: isExternal,
         quoted_id: quotedId,
         quoted_text: quotedText,
         whatsapp_id: messageId, // id === whatsapp_id sempre neste sistema
         contact_jid: contactJid,
         created_at: new Date(timestamp).toISOString()
       };
 
       if (usage) {
         messageData.tokens_prompt = usage.prompt_tokens || 0;
         messageData.tokens_completion = usage.completion_tokens || 0;
         messageData.cost_brl = usage.cost_brl || 0;
       }
 
        // Upsert atômico usando whatsapp_id com retry automático
        await withRetry(async () => {
          const { error: mErr } = await supabase
            .from('messages')
            .upsert(messageData, { onConflict: 'whatsapp_id' });
          if (mErr) throw mErr;
        });

    } catch (mErr) {
       console.error('[AgentService] Message insert exception:', mErr);
    }

    // 3. Update Contact
    try {
      const cleanPhone = normalizePhone(displayPhone || (threadId.includes('_') ? threadId.split('_')[1] : threadId) || '');
      if (cleanPhone) {
        await this.upsertContact(userId, cleanPhone, contactName, text, direction === 'inbound');
      }
    } catch (dbErr) {
      console.error('[AgentService] Contact sync error:', dbErr);
    }
  }
  
  public async updateMessageReaction(userId: string, whatsappId: string, reaction: string) {
    try {
      let dbUserId = userId;

      // [CRITICAL-HOSTINGER] Resolve UUID if email is passed
      if (userId.includes('@')) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', userId)
          .maybeSingle();
        if (prof?.id) dbUserId = prof.id;
      }

      console.log(`[AgentService] 😃 Updating reaction for message ${whatsappId}: ${reaction} (User: ${dbUserId})`);
      const { error } = await supabase
        .from('messages')
        .update({ reaction: reaction })
        .eq('whatsapp_id', whatsappId)
        .eq('user_id', dbUserId);
      
      if (error) throw error;
    } catch (err) {
      console.error('[AgentService] Error updating reaction:', err);
    }
  }

  private async upsertContact(userId: string, phoneNumber: string, contactName: string | undefined, lastMessage: string, incrementCount: boolean = true) {
    try {
      const cleanPhone = normalizePhone(phoneNumber);
      const contactId = `${userId}_${cleanPhone}`;

      const { data: existing } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle();

      const contactData: any = {
        id: contactId,
        user_id: userId,
        telefone: cleanPhone,
        ultima_mensagem: lastMessage,
        ultima_interacao: new Date().toISOString(),
      };

      if (!existing) {
        contactData.nome = contactName || cleanPhone || 'Lead WhatsApp';
        contactData.status_funil = 'Lead';
        contactData.source = 'whatsapp';
        contactData.primeiro_contato = new Date().toISOString();
        contactData.data_criacao = new Date().toISOString();
        contactData.total_mensagens = 1;
      } else {
        // Garantir que o nome nunca seja sobrescrevido por um número
        const isPhone = (s: string) => !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;
        
        if (contactName && !isPhone(contactName)) {
           contactData.nome = contactName;
        } else if (!existing.nome || isPhone(existing.nome)) {
           // Se não tem nome ou o nome atual é um telefone, tenta usar o que veio ou fallback
           if (contactName && !isPhone(contactName)) {
             contactData.nome = contactName;
           } else if (!existing.nome) {
             contactData.nome = cleanPhone || 'Lead WhatsApp';
           }
        }

        if (incrementCount) {
          contactData.total_mensagens = (existing.total_mensagens || 0) + 1;
        }
      }

      // [CRITICAL FIX] Garantia final contra erro de NOT NULL na coluna 'nome'
      if (!contactData.nome) {
        contactData.nome = contactName || cleanPhone || 'Lead WhatsApp';
      }

      const { error: upsertErr } = await supabase.from('contacts').upsert(contactData, { onConflict: 'id' });
      if (upsertErr) {
        console.error('[AgentService] ❌ Contact upsert failed:', upsertErr);
      }
    } catch (error) {
      console.error('[AgentService] Contact error:', error);
    }
  }

  private buildSystemPrompt(agentData: any, threadData: any, professionals: any[], additionalKnowledge: any[] = []) {
    const leadName = threadData?.lead_name || null;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const dayStr = now.toLocaleDateString('pt-BR', { weekday: 'long' });
    const trainingMode = agentData.training_mode || 'text';

    // 1. Process Knowledge Base
    let kbOutput = '';
    
    // In AUDIO mode, we ONLY use the audio blocks (additionalKnowledge)
    // In TEXT mode, we use the manual fields and the legacy JSONB KB if present
    
    if (trainingMode === 'audio') {
      if (additionalKnowledge && additionalKnowledge.length > 0) {
        kbOutput = additionalKnowledge
          .filter((item: any) => item.is_active)
          .map((item: any) => {
            return `[CONHECIMENTO DE ÁUDIO: ${item.title || 'Sem título'}]\n${item.content}`;
          }).join('\n\n');
      }
    } else {
      // TEXT MODE: legacy JSONB KB
      if (agentData.knowledge_base && Array.isArray(agentData.knowledge_base)) {
        kbOutput = agentData.knowledge_base.map((item: any) => {
          if (item.type === 'qa') return `P: ${item.question}\nR: ${item.answer}`;
          return `[UNIDADE DE CONHECIMENTO: ${item.title}]\n${item.content}`;
        }).join('\n\n');
      }
    }

    // 2. Process Professionals Info
    let profsInfo = '';
    if (professionals && professionals.length > 0) {
      profsInfo = professionals.map(p => {
        return `- ${p.name}: ${p.specialties}. ${p.bio || ''}`;
      }).join('\n');
    }

    // Build conditional sections for Text Mode
    const aboutCompany = trainingMode === 'text' ? agentData.company_description || '' : 'Consulte a Base de Conhecimento de Áudio abaixo.';
    const productsInfo = trainingMode === 'text' ? agentData.company_products || '' : 'Consulte a Base de Conhecimento de Áudio abaixo.';
    const faqInfo = trainingMode === 'text' ? agentData.company_faq || '' : 'Consulte a Base de Conhecimento de Áudio abaixo.';

    return `Você é assistente virtual da ${agentData.company_name || 'Nossa Empresa'}. 
OBJETIVO: Atendimento consultivo e agendamento.
NOME DO CLIENTE: ${leadName || 'Pergunte o nome se ainda não souber'}.
MODO DE TREINAMENTO ATUAL: ${trainingMode.toUpperCase()}.

${threadData?.ad_tracking ? `ORIGEM DO LEAD (ANÚNCIO):
- Plataforma: ${threadData.ad_tracking.source || 'Meta Ads'}
- Campanha: ${threadData.ad_tracking.headline || 'N/A'}
- Conteúdo: ${threadData.ad_tracking.body || 'N/A'}
DICA: O cliente veio deste anúncio. Você pode usar isso como contexto se ele perguntar algo específico.` : ''}

CONTEXTO TEMPORAL:
- Hoje é ${dayStr}, dia ${dateStr}.
- Horário Atual: ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

SOBRE A EMPRESA:
${aboutCompany}

PRODUTOS E SERVIÇOS:
${productsInfo}

PERGUNTAS FREQUENTES (FAQ):
${faqInfo}

NOSSA EQUIPE:
${profsInfo || 'Consulte os horários disponíveis se necessário.'}

BASE DE CONHECIMENTO (${trainingMode === 'audio' ? 'ÁUDIO' : 'TEXTO'}):
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
      let knowledgeBlocks: any[] = [];
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agentData.id || '');
      
      if (agentData.id && isUuid) {
        const { data } = await supabase
          .from('agent_knowledge')
          .select('*')
          .eq('agent_id', agentData.id)
          .eq('is_active', true);
        knowledgeBlocks = data || [];
      }

      const systemPrompt = this.buildSystemPrompt(agentData, { lead_name: 'Cliente Teste' }, professionals || [], knowledgeBlocks || []);
      const dateContext = `\n[CONTEXTO TEMPORAL/SIMULAÇÃO]\nHOJE: ${format(new Date(), 'dd/MM/yyyy')}\nDATA ATUAL: ${format(new Date(), 'yyyy-MM-dd')}\n`;
      const fullPrompt = systemPrompt + dateContext;

      // 3. AI Execution Loop
      const tools = this.getAgentTools();
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
            if (functionName === 'Agendar') {
              if (args.acao === 'agendar') {
                toolResult = { success: true, id: 'sim-appt-' + Date.now(), is_simulation: true };
              } else {
                toolResult = await this.handleCheckAvailability(userId, args.date, agentData, professionals || [], args.professional_name);
              }
            } else if (functionName === 'servicoTool') {
              toolResult = await this.handleSearchCatalog(userId, args.pergunta || args.query);
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
      console.log(`[AgentService] 🔄 Aggressive sync starting for userId: ${userId}`);
      try {
        const { data: threads, error: tErr } = await supabase
          .from('threads')
          .select('*')
          .eq('user_id', userId);
        
        if (tErr) throw tErr;
        if (!threads || threads.length === 0) {
          console.log('[AgentService] No threads found for this user to sync.');
          return { success: true, synced: 0 };
        }

        console.log(`[AgentService] Found ${threads.length} threads. Analyzing...`);
        let synced = 0;
        let skipped = 0;

        for (const thread of threads) {
          // 1. Ignorar grupos
          if (thread.remote_jid?.endsWith('@g.us')) {
            skipped++;
            continue;
          }

          // 2. Extração robusta do telefone
          let rawPhone = thread.display_phone || thread.remote_jid?.split('@')[0] || '';
          
          // Se ainda vazio, tenta extrair do ID da thread (userId_phone ou apenas phone)
          if (!rawPhone && thread.id) {
            rawPhone = thread.id.includes('_') ? thread.id.split('_')[1] : thread.id;
          }

          const cleanPhone = rawPhone.replace(/\D/g, '');
          if (!cleanPhone || cleanPhone.length < 8) {
            console.log(`[AgentService] ⚠️ Skipping thread ${thread.id}: Invalid phone "${cleanPhone}"`);
            skipped++;
            continue;
          }

          const contactId = `${userId}_${cleanPhone}`;
          const { data: existing } = await supabase.from('contacts').select('id, status_funil').eq('id', contactId).maybeSingle();

          if (!existing) {
            // CRIAR NOVO: Forçar Lead para passar no SQL Check
            await this.upsertContact(userId, cleanPhone, thread.contact_name, thread.last_message || '', false);
            synced++;
          } else {
            // JÁ EXISTE: Verificar se o status_funil é válido para o novo SQL
            const validStatus = ['Lead', 'Qualificado', 'Resolvido'];
            if (!validStatus.includes(existing.status_funil)) {
               console.log(`[AgentService] 🛠️ Fixing invalid status "${existing.status_funil}" for contact ${contactId}`);
               await supabase.from('contacts').update({ status_funil: 'Lead' }).eq('id', contactId);
            }
          }
        }
        
        console.log(`[AgentService] ✅ Sync complete. Synced: ${synced}, Skipped: ${skipped}`);
        return { success: true, synced };
      } catch (err: any) {
        console.error('[AgentService] Sync error:', err);
        throw err;
      }
  }

  private async handleSearchCatalog(userId: string, query: string) {
    try {
      const { data, error } = await supabase
        .from('agent_catalog')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${query}%`);
      
      if (error) throw error;
      if (!data || data.length === 0) return { message: 'Nenhum item encontrado no catálogo com essa busca.' };

      return {
        results: data.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description
        }))
      };
    } catch (err: any) {
      return { error: 'Falha ao buscar catálogo', details: err.message };
    }
  }

  private async handleSendCatalogItem(userId: string, to: string, itemId: string) {
    try {
      const { data: item, error } = await supabase
        .from('agent_catalog')
        .select('*')
        .eq('id', itemId)
        .single();
      
      if (error || !item) return { error: 'Item não encontrado.' };

      const { whatsappService } = await import('./whatsappService.js');
      await whatsappService.sendMedia(userId, to, item.media_url, item.media_type || 'image', item.name);

      return { success: true, message: `O item ${item.name} foi enviado para o cliente.` };
    } catch (err: any) {
      return { error: 'Falha ao enviar item', details: err.message };
    }
  }

  private getAgentTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'servicoTool',
          description: 'Consulta informações sobre serviços, valores, formas de pagamento, dúvidas frequentes e detalhes sobre o atendimento.',
          parameters: {
            type: 'object',
            properties: {
              pergunta: { type: 'string', description: 'A dúvida ou assunto que o cliente deseja saber.' }
            },
            required: ['pergunta']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'Agendar',
          description: 'Ferramenta completa para verificar disponibilidade de horários e realizar agendamentos no calendário.',
          parameters: {
            type: 'object',
            properties: {
              acao: { type: 'string', enum: ['verificar', 'agendar'], description: 'Se deseja apenas ver horários ou se deseja marcar a consulta.' },
              date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
              time: { type: 'string', description: 'Horário no formato HH:mm (ex: 14:30)' },
              clientName: { type: 'string', description: 'Nome completo do paciente (obrigatório para agendar)' },
              professional_name: { type: 'string', description: 'Nome do profissional (opcional)' }
            },
            required: ['acao', 'date']
          }
        }
      }
    ];
  }
  public async updateContactTracking(userId: string, phoneNumber: string, trackingData: any) {
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const contactId = `${userId}_${cleanPhone}`;
      
      console.log(`[AgentService] 🎯 Updating tracking for contact ${contactId}`);
      
      const { error } = await supabase
        .from('contacts')
        .update({ ad_tracking: trackingData })
        .eq('id', contactId);
        
      if (error) throw error;
    } catch (err) {
      console.error('[AgentService] Error updating contact tracking:', err);
    }
  }

  public async syncProfilePicture(userId: string, threadId: string, remoteJid: string, force = false) {
    try {
      const cleanPhone = remoteJid.split('@')[0].replace(/\D/g, '');
      const contactId = `${userId}_${cleanPhone}`;

      if (!force) {
        const { data: existing } = await supabase
          .from('threads')
          .select('profile_picture_url, profile_picture_updated_at')
          .eq('id', threadId)
          .maybeSingle();

        if (existing?.profile_picture_updated_at) {
          const lastUpdate = new Date(existing.profile_picture_updated_at);
          const diffHours = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
          if (diffHours < 24 && existing.profile_picture_url) return;
        }
      }

      const provider = await WhatsAppProviderFactory.getProvider(userId);
      const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      const photoUrl = await provider.fetchProfilePictureUrl(instanceName, remoteJid);

      const updateData = {
        profile_picture_url: photoUrl,
        profile_picture_updated_at: new Date().toISOString(),
        photo_url: photoUrl 
      };

      await Promise.all([
        supabase.from('threads').update(updateData).eq('id', threadId),
        supabase.from('contacts').update(updateData).eq('id', contactId)
      ]);
    } catch (err) {
      console.error('[AgentService] Error syncing profile picture:', err);
    }
  }
}

export const agentService = new AgentService();
