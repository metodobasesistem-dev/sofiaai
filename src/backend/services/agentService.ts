import { audioService } from './audioService.js';
import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse, truncateHistoryByTokens, transcribeAudio } from './aiService.js';
import { redisService } from './redisService.js';
import { format, addMinutes, parseISO, isValid, isWithinInterval } from 'date-fns';
import { googleCalendarService } from './googleCalendarService.js';
import { EvolutionApiService } from './evolutionApiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { normalizePhone } from '../lib/phoneHelper.js';
import { randomUUID } from 'crypto';

/**
 * Normaliza timestamp para ISO string.
 * A Evolution API envia timestamps em Unix SEGUNDOS; Date.now() e outros
 * sources usam MILISSEGUNDOS. Valores < 1e11 são tratados como segundos.
 */
function tsToIso(ts: number): string {
  const ms = ts > 0 && ts < 1e11 ? ts * 1000 : ts;
  return new Date(ms).toISOString();
}

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
    mediaMimeType?: string,
    agentId?: string | null
  }): Promise<{ text: string; audioBuffer?: Buffer; voiceMode?: string; aiMsgId?: string } | string | null> {
    const { from, body, contactName, messageId, displayPhone, skipPersist = false, isAudioRequest = false, mediaUrl, mediaMimeType, agentId } = incomingData;

    const startTime = Date.now();
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
          supabase.from('contacts').select('ad_tracking, status_funil, total_mensagens, primeiro_contato').eq('id', contactId).maybeSingle()
        ]);
        threadData = tData ? {
          ...tData,
          ad_tracking: cData?.ad_tracking,
          contact_status_funil: cData?.status_funil,
          contact_total_msgs: cData?.total_mensagens,
          contact_since: cData?.primeiro_contato
        } : null;
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
      let agentRes: any = null;
      let agentError: any = null;

      if (agentId) {
        // Busca o agente específico da thread
        const { data: specificAgent, error: specificErr } = await supabase
          .from('agents')
          .select('*')
          .eq('id', agentId)
          .eq('user_id', dbUserId)
          .maybeSingle();
          
        if (specificErr) agentError = specificErr;

        if (specificAgent && specificAgent.status_ativo) {
          agentRes = specificAgent;
        } else if (specificAgent && !specificAgent.status_ativo) {
          console.log(`[AgentService] 🔄 Agent in thread (${agentId}) is INACTIVE. Falling back to active default agent...`);
        }
      }

      // Se não havia agentId, ou se o agentId era de um agente inativo, busca o ativo padrão
      if (!agentRes) {
        const { data: activeAgent, error: activeErr } = await supabase
          .from('agents')
          .select('*')
          .eq('user_id', dbUserId)
          .eq('status_ativo', true)
          .limit(1)
          .maybeSingle();
          
        if (activeErr) agentError = activeErr;
        
        if (activeAgent) {
          agentRes = activeAgent;
          
          // Atualiza a thread para refletir o novo agente ativo, caso a thread já tivesse um ID
          if (agentId && agentId !== agentRes.id) {
            console.log(`[AgentService] 📝 Updating thread ${threadId} to new active agent ${agentRes.id}`);
            await supabase.from('threads').update({ agent_id: agentRes.id }).eq('id', threadId);
          }
        }
      }

      const { data: profsRes } = await supabase.from('professionals').select('*').eq('user_id', dbUserId).eq('is_active', true);
      
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
        // Filtrar também pelo dono é defesa em profundidade: nenhum bloco
        // gravado por outro tenant entra no prompt deste agente.
        .eq('user_id', userId)
        .eq('is_active', true);

      // 3. Persistent History — lê as últimas 40 mensagens íntegras, como no fluxo n8n original.
      // Sem auto-summary, sem truncamento por "loop detection" — esses hacks acabavam
      // cortando contexto crítico (data já mencionada, escolha de horário, etc.) e quebravam
      // mais coisas do que arrumavam. O modelo lida bem com 40 msgs e o detectBookingReady
      // abaixo é a camada determinística pra forçar agendamento quando tudo já está dito.
      const HISTORY_LIMIT = 40;
      // Busca Redis e Supabase em paralelo e usa a fonte com mais mensagens.
      // Guarda contra falhas silenciosas de escrita no Redis: se o rpush falha sem
      // propagar erro, Redis fica com histórico incompleto enquanto o Supabase tem tudo.
      const [redisHistory, dbHistory] = await Promise.all([
        redisService.getHistory(threadId, HISTORY_LIMIT),
        this.getHistoryFromSupabase(threadId, HISTORY_LIMIT),
      ]);
      let history = redisHistory.length >= dbHistory.length ? redisHistory : dbHistory;

      // 4. Save Inbound Message
      if (!skipPersist) {
        await this.persistMessage(threadId, dbUserId, body, 'inbound', messageId, contactName, from, displayPhone);
        await redisService.pushMessage(threadId, 'user', body);
      }

      // 4.5 - 3.C: Transcreve áudio ANTES de passar para a IA
      // O modelo de texto não processa áudio diretamente — a transcrição converte para texto.
      let processBody = body;
      let isTranscribedAudio = false;
      if (isAudioRequest && mediaUrl) {
        console.log('[AgentService] 🎙️ Transcrevendo mensagem de áudio...');
        try {
          const audioRes = await fetch(mediaUrl);
          if (audioRes.ok) {
            const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
            const transcription = await transcribeAudio(audioBuffer, 'audio.ogg', dbUserId);
            if (transcription && transcription.trim()) {
              processBody = transcription;
              isTranscribedAudio = true;
              console.log(`[AgentService] 🎙️ Áudio transcrito: "${transcription.substring(0, 80)}..."`);
            }
          }
        } catch (audioErr) {
          console.warn('[AgentService] Transcrição de áudio falhou, usando body original:', audioErr);
        }
      }

      // Usa SEMPRE o modelo configurado pelo tenant. Não troca por gpt-4o-mini em
      // mensagens curtas — esse hack degradava o fluxo de agendamento multi-turno
      // porque o mini perde contexto e fica caducando ("qual dia?" depois de receber "dia 29").
      // O n8n original usa um único modelo (gpt-4.1-mini) o tempo todo e funciona bem.
      const modelOverride: string | undefined = undefined;

      // 5. AI Loop (Process Tools)
      const systemPrompt = this.buildSystemPrompt(agentData, threadData, activeProfessionals, knowledgeBlocks || []);
      const now = new Date();

      // CALENDÁRIO DE REFERÊNCIA (próximos 10 dias) — inspirado no node proximos_dias do n8n.
      // Remove a necessidade do LLM fazer math de datas e resolve casos como "dia 28" / "amanhã".
      const calendarContext = `\n[CALENDÁRIO DE REFERÊNCIA]\n${this.buildDateContext()}\n\nQUANDO o cliente disser "dia X", "amanhã", "depois de amanhã" ou "sexta", use a tabela acima para descobrir o ISO YYYY-MM-DD e passe esse valor para a tool Agendar.\n`;

      const dateContext = `\n[CONTEXTO TEMPORAL]\nHOJE: ${format(now, 'dd/MM/yyyy')}\nDATA ATUAL: ${format(now, 'yyyy-MM-dd')}\n`;

      // Arquitetura n8n: SEM detecção determinística, SEM diretivas obrigatórias.
      // O modelo (gpt-4.1-mini recomendado) lê as 40 msgs íntegras e segue o prompt + tools.
      // As camadas determinísticas anteriores acabavam confundindo mais que ajudando.
      const fullPrompt = systemPrompt + calendarContext + dateContext;
      const tools = this.getAgentTools();

      // Filtra e formata histórico — passa as 40 msgs íntegras pro modelo.
      const filteredHistory = history
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));

      // Aplica limite duro de tokens (8k) — preserva sempre as mais recentes em caso de explosão.
      const truncatedHistory = truncateHistoryByTokens(filteredHistory, 8000);

      let currentMessages: any[] = [
        ...truncatedHistory,
        {
          role: 'user',
          content: processBody,
          // Não passa mediaUrl para áudio transcrito — o modelo já recebeu o texto
          mediaUrl: isTranscribedAudio ? undefined : mediaUrl,
          mediaMimeType: isTranscribedAudio ? undefined : mediaMimeType
        }
      ];

      let finalUsage = null;
      let aiFinalText: string | null = null;
      let toolCalledInThisTurn = false;
      let transferredToHuman = false;
      let modelUsed: string | null = null;
      const toolsUsed: string[] = [];
      const MAX_TOOL_ITERATIONS = 5;
      let iterationCount = 0;

      while (!aiFinalText && iterationCount < MAX_TOOL_ITERATIONS) {
        iterationCount++;
        console.log(`[AgentService] 🤖 IA está pensando... (Thread: ${threadId}, Iter: ${iterationCount}/${MAX_TOOL_ITERATIONS})`);
        // Usa mini model para mensagens simples; após tool call, já não importa (toolCalledInThisTurn=true = iteração de resposta)
        const modelForThisCall = toolCalledInThisTurn ? undefined : modelOverride;
        // tool_choice='auto' — deixa o modelo decidir quando chamar tools, como no n8n.
        const response = await generateAIResponse(fullPrompt, currentMessages, tools, 'auto', dbUserId, modelForThisCall);
        
        if (!response || (!response.text && (!response.toolCalls || response.toolCalls.length === 0))) {
          console.warn(`[AgentService] ⚠️ Resposta da IA vazia na thread: ${threadId}. Encerrando loop.`);
          break;
        }

        console.log(`[AgentService] ✨ IA respondeu! (Thread: ${threadId})`);

        if (response.usage) {
          finalUsage = response.usage;
        }
        if (response.providerUsed) {
          modelUsed = response.providerUsed;
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          toolCalledInThisTurn = true;
          currentMessages.push({ role: 'assistant', content: response.text || '', tool_calls: response.toolCalls });

          for (const toolCall of response.toolCalls) {
            const functionName = toolCall.function.name;
            if (!toolsUsed.includes(functionName)) toolsUsed.push(functionName);
            let args: any = {};
            try {
              args = JSON.parse(toolCall.function.arguments || '{}');
            } catch (pErr) {
              console.error(`[AgentService] ❌ JSON Parse Error em tool ${functionName}:`, toolCall.function.arguments?.substring(0, 200));
              // Devolve um erro estruturado pra IA reformular a chamada
              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: functionName,
                content: JSON.stringify({ error: 'Argumentos da tool em formato JSON inválido. Tente novamente com JSON correto.' })
              });
              continue;
            }
            console.log(`[AgentService] 🛠️ TOOL CALL: ${functionName}`, args);

            let toolResult;
            try {
              if (functionName === 'Agendar') {
                // ─────────────────────────────────────────────────────────
                // NOVA ARQUITETURA: Agendar agora DELEGA ao SUB-AGENTE
                // dedicado. O sub-agente tem prompt focado + tools especializadas
                // (verificar_disponibilidade, confirmar_agendamento, cancelar_agendamento).
                // Inspirado no fluxo n8n de referência.
                // ─────────────────────────────────────────────────────────

                // Backward compat: se modelo passou intent (formato novo), usa direto.
                // Se passou no formato antigo (acao + date + time + clientName), constrói
                // o intent a partir desses params.
                let intent: string;
                if (args.intent) {
                  intent = args.intent;
                } else {
                  const parts: string[] = [];
                  if (args.acao === 'agendar') parts.push('Cliente quer CONFIRMAR o agendamento.');
                  else if (args.acao === 'cancelar') parts.push('Cliente quer CANCELAR agendamento.');
                  else if (args.acao === 'verificar') parts.push('Cliente quer VERIFICAR disponibilidade.');
                  else parts.push('Cliente fez um pedido relacionado a agendamento.');
                  if (args.date) parts.push(`Data: ${args.date}.`);
                  if (args.time) parts.push(`Horário: ${args.time}.`);
                  if (args.clientName) parts.push(`Nome do cliente: ${args.clientName}.`);
                  if (args.professional_name) parts.push(`Profissional: ${args.professional_name}.`);
                  if (args.tipo) parts.push(`Modalidade: ${args.tipo}.`);
                  parts.push(`Mensagem atual do cliente: "${processBody}".`);
                  intent = parts.join(' ');
                }

                // Hint: dados que vieram diretamente da tool call do agente principal.
                const subHint = (args.acao === 'agendar' && args.date && args.time && args.clientName) ? {
                  date: args.date, time: args.time, clientName: args.clientName, tipo: args.tipo
                } : null;

                const subResult = await this.processSchedulingSubAgent(
                  intent,
                  dbUserId,
                  threadId,
                  contactName,
                  agentData,
                  activeProfessionals,
                  [...history, { role: 'user' as const, content: processBody }],
                  subHint
                );

                // O texto do sub-agente VIRA a resposta final ao cliente.
                // Pulamos o resto do loop principal — Sofia não precisa rephrase.
                toolResult = { success: true, message: subResult.text, booked: subResult.bookingOccurred };
                aiFinalText = subResult.text;
                if (subResult.bookingOccurred) {
                  if (!toolsUsed.includes('Agendar')) toolsUsed.push('Agendar');
                }
              } else if (functionName === 'servicoTool') {
                toolResult = await this.handleSearchCatalog(dbUserId, args.pergunta || args.query);
              } else if (functionName === 'consultarEcommerce') {
                toolResult = await this.handleEcommerceSearch(dbUserId, agentData, args.query || args.pergunta);
              } else if (functionName === 'transfer_to_human') {
                // 3.E: IA decidiu transferir — atualiza thread e sinaliza o flag
                await supabase.from('threads').update({ status: 'human' }).eq('id', threadId);
                transferredToHuman = true;
                console.log(`[AgentService] 🤝 Transferência para humano: ${threadId}. Motivo: ${args.reason}`);
                toolResult = { success: true, message: 'Transferência realizada. Aguardando mensagem de despedida da IA.' };
              } else {
                toolResult = { error: `Tool "${functionName}" não reconhecida` };
              }
            } catch (toolErr: any) {
              console.error(`[AgentService] ❌ Tool ${functionName} falhou:`, toolErr?.message || toolErr);
              toolResult = { error: toolErr?.message || 'Erro interno ao executar a tool' };
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

      if (!aiFinalText && iterationCount >= MAX_TOOL_ITERATIONS) {
        console.warn(`[AgentService] ⚠️ Limite de iterações de tool atingido (${MAX_TOOL_ITERATIONS}) na thread ${threadId}`);
        aiFinalText = "Estou processando várias informações ao mesmo tempo. Pode reformular sua pergunta de forma mais específica?";
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
        // ──────────────────────────────────────────────────────────────
        // GUARD FINAL: re-checa estado da thread imediatamente antes de
        // enviar. Fecha a janela de corrida onde o operador assume durante
        // o processamento da IA (que pode levar segundos com tools).
        // EXCEÇÃO: se foi a própria IA que chamou transfer_to_human,
        // deixamos a mensagem de despedida ser enviada antes de parar.
        // ──────────────────────────────────────────────────────────────
        if (!transferredToHuman) {
          try {
            const { data: latestThread } = await supabase
              .from('threads')
              .select('status')
              .eq('id', threadId)
              .maybeSingle();
            if (latestThread?.status === 'human') {
              console.log(`[AgentService] 🛑 Thread ${threadId} virou 'human' durante o processamento. Descartando resposta da IA.`);
              return { status: 'human' } as any;
            }
          } catch (lockErr) {
            console.warn('[AgentService] Falha ao revalidar status da thread, prosseguindo:', lockErr);
          }
        }

        const aiMsgId = `ai-${Date.now()}`;
        if (!skipPersist) {
          await this.persistMessage(threadId, dbUserId, aiFinalText, 'outbound', aiMsgId, contactName, from, displayPhone, agentData?.nome, finalUsage);
          await redisService.pushMessage(threadId, 'assistant', aiFinalText);
        }

        // 4.B: Log fire-and-forget — não bloqueia a resposta
        const outcome = transferredToHuman ? 'transferred' : 'responded';
        void supabase.from('ai_interaction_logs').insert({
          user_id: dbUserId, thread_id: threadId, agent_id: agentData?.id || null,
          duration_ms: Date.now() - startTime, model_used: modelUsed,
          tokens_in: finalUsage?.prompt_tokens || 0, tokens_out: finalUsage?.completion_tokens || 0,
          cost_brl: finalUsage?.cost_brl || 0,
          tool_calls_count: toolsUsed.length, tool_names: toolsUsed, outcome
        });

        return { text: aiFinalText, audioBuffer: voiceBuffer, voiceMode, aiMsgId };
      }

      // Chegou aqui sem resposta (fallback de iteração ou sem toolCall)
      void supabase.from('ai_interaction_logs').insert({
        user_id: dbUserId, thread_id: threadId, agent_id: agentData?.id || null,
        duration_ms: Date.now() - startTime, model_used: modelUsed,
        tokens_in: finalUsage?.prompt_tokens || 0, tokens_out: finalUsage?.completion_tokens || 0,
        cost_brl: finalUsage?.cost_brl || 0,
        tool_calls_count: toolsUsed.length, tool_names: toolsUsed, outcome: 'fallback'
      });

      return null;
    } catch (error) {
      console.error('[AgentService] Fatal error in processIncoming:', error);

      // Log de erro — também fire-and-forget
      void supabase.from('ai_interaction_logs').insert({
        user_id: userId, thread_id: `${userId}_unknown`,
        duration_ms: Date.now() - startTime, model_used: null,
        tokens_in: 0, tokens_out: 0, cost_brl: 0,
        tool_calls_count: 0, tool_names: [], outcome: 'error',
        error_message: String((error as any)?.message || error).substring(0, 500)
      });

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
    if (!messageId || messageId === '') {
      console.warn(`[AgentService] ⚠️ Skipping persistence: messageId is empty for thread ${threadId}`);
      return;
    }

    const timestamp = Date.now();
    console.log(`[AgentService] 💾 Persisting message: ${messageId} | Thread: ${threadId} | Direction: ${direction} | Type: ${messageType}`);

    const cleanPhone = normalizePhone(
      displayPhone || (threadId.includes('_') ? threadId.split('_').slice(1).join('_') : threadId)
    );

    // ── FASE 1: Busca estado existente (thread + contato) em paralelo ──
    let existingThread: any = null;
    let existingContact: any = null;

    try {
      const [{ data: tData }, { data: cData }] = await Promise.all([
        supabase
          .from('threads')
          .select('contact_name, profile_picture_url, profile_picture_updated_at, unread_count, ticket_status')
          .eq('id', threadId)
          .maybeSingle(),
        supabase
          .from('contacts')
          .select('nome, status_funil, total_mensagens, primeiro_contato, data_criacao')
          .eq('id', `${userId}_${cleanPhone}`)
          .maybeSingle()
      ]);
      existingThread = tData;
      existingContact = cData;

      // [FIX] Busca aproximada para o 9º dígito brasileiro
      if (!existingContact && cleanPhone.startsWith('55')) {
        const last8 = cleanPhone.slice(-8);
        const { data: fuzzyContact } = await supabase
          .from('contacts')
          .select('nome, status_funil, total_mensagens, primeiro_contato, data_criacao')
          .eq('user_id', userId)
          .ilike('telefone', `%${last8}`)
          .maybeSingle();
        existingContact = fuzzyContact;
      }
    } catch (fetchErr) {
      console.warn('[AgentService] Pre-fetch failed, proceeding with defaults:', fetchErr);
    }

    // ── FASE 2: Lógica de negócio (pura, sem I/O) ──
    const isPhoneOnly = (s: string) => !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;

    // Resolução de nome: CRM > thread existente > PushName > telefone
    const resolvedContactName = (() => {
      if (existingContact?.nome && !isPhoneOnly(existingContact.nome)) return existingContact.nome;
      if (existingThread?.contact_name && !isPhoneOnly(existingThread.contact_name)) return existingThread.contact_name;
      if (contactName && !isPhoneOnly(contactName)) return contactName;
      return existingContact?.nome || existingThread?.contact_name || contactName || cleanPhone;
    })();

    const newUnreadCount = direction === 'inbound'
      ? (existingThread?.unread_count || 0) + 1
      : (existingThread?.unread_count || 0);

    const currentTicketStatus = existingThread?.ticket_status || 'open';
    const currentFunilStatus  = existingContact?.status_funil || 'Lead';
    const reopenTicket = direction === 'inbound' &&
      (currentTicketStatus === 'resolved' || currentFunilStatus === 'Resolvido');
    const finalTicketStatus = reopenTicket ? 'open' : currentTicketStatus;

    if (reopenTicket) {
      console.log(`[AgentService] 🔄 Ticket reabertura automática para ${cleanPhone} (Resolvido → Lead)`);
    }

    // ── FASE 3: Montagem dos payloads para a RPC ──
    const messagePayload = {
      // PK própria por linha. Usar o id do WhatsApp aqui colide entre tenants:
      // quando os dois lados da conversa são clientes do sistema, a mesma
      // mensagem precisa existir duas vezes — uma por tenant — e a PK global
      // barrava a segunda com 23505, fazendo o tenant perder a mensagem.
      // A idempotência real vem do UNIQUE (whatsapp_id, user_id).
      id:                  randomUUID(),
      user_id:             userId,
      thread_id:           threadId,
      text:                text,
      direction:           direction,
      status:              'sent',
      timestamp:           timestamp,
      audio_url:           audioUrl || mediaUrl || null,
      message_type:        messageType,
      media_url:           mediaUrl           || null,
      media_mime_type:     mediaMimeType      || null,
      media_filename:      mediaFileName      || null,
      caption:             caption            || null,
      is_external:         isExternal,
      quoted_id:           quotedId           || null,
      quoted_text:         quotedText         || null,
      whatsapp_id:         messageId,
      contact_jid:         contactJid         || null,
      is_ai:               false,
      tokens_prompt:       usage?.prompt_tokens     || 0,
      tokens_completion:   usage?.completion_tokens || 0,
      cost_brl:            usage?.cost_brl          || 0,
      created_at:          tsToIso(timestamp)
    };

    const threadPayload = {
      id:                         threadId,
      user_id:                    userId,
      remote_jid:                 remoteJid || `${cleanPhone}@s.whatsapp.net`,
      display_phone:              cleanPhone,
      contact_name:               resolvedContactName,
      last_message:               text.substring(0, 1000),
      last_message_time:          tsToIso(timestamp),
      status:                     'ia',
      unread_count:               newUnreadCount,
      ticket_status:              finalTicketStatus,
      agent_name:                 agentName || 'Sofia',
      updated_at:                 tsToIso(timestamp),
      // Preserva foto existente — nunca sobrescreve com null
      profile_picture_url:        existingThread?.profile_picture_url        || null,
      profile_picture_updated_at: existingThread?.profile_picture_updated_at || null,
      // Janela de 24h Meta: atualizado atomicamente no RPC para mensagens inbound.
      // Para mensagens outbound o campo fica ausente (null no JSONB) e o RPC
      // preserva o valor existente via COALESCE.
      // first_inbound_at: o RPC só grava se ainda estiver NULL — é o marco de
      // "o lead falou pela primeira vez", gatilho da notificação de Novo Lead.
      ...(direction === 'inbound'
        ? { last_inbound_at: tsToIso(timestamp), first_inbound_at: tsToIso(timestamp) }
        : {})
    };

    const contactPayload = {
      id:              `${userId}_${cleanPhone}`,
      user_id:         userId,
      telefone:        cleanPhone,
      nome:            resolvedContactName,
      status_funil:    existingContact?.status_funil || 'Lead',
      source:          'whatsapp',
      ultima_mensagem: text.substring(0, 500),
      ultima_interacao:tsToIso(timestamp),
      // Para novos contatos: usa NOW() via COALESCE na SQL se não passado
      primeiro_contato:existingContact?.primeiro_contato || tsToIso(timestamp),
      data_criacao:    existingContact?.data_criacao     || tsToIso(timestamp),
      total_mensagens: existingContact?.total_mensagens  || 0,
      // Flags de controle para a RPC
      increment_count: direction === 'inbound',
      reopen_ticket:   reopenTicket
    };

    // ── FASE 4: Escrita atômica via RPC (tudo ou nada) ──
    try {
      await withRetry(async () => {
        const { data: result, error } = await supabase.rpc('upsert_inbound_message', {
          p_message: messagePayload,
          p_thread:  threadPayload,
          p_contact: contactPayload
        });

        if (error) throw error; // erro de rede/HTTP → retry

        // Erro SQL retornado como dado (SQLSTATE no campo 'code')
        if (result && result.success === false) {
          const sqlErr = Object.assign(
            new Error(`[RPC] upsert_inbound_message: ${result.error}`),
            { code: result.code }
          );
          throw sqlErr; // constraint 23505 → withRetry não retenta
        }
      });

      console.log(`[AgentService] ✅ Escrita atômica concluída: ${messageId}`);
    } catch (err: any) {
      // Chave duplicada = a mensagem JÁ está persistida, que é justamente o
      // estado desejado. Isso acontece quando o webhook é reentregue ou quando
      // duas entregas simultâneas correm (a trava do Redis falha aberta se o
      // Redis estiver instável). O ON CONFLICT da RPC mira em
      // (whatsapp_id, user_id) e não cobre a PK 'id', então a duplicata chega
      // aqui como erro — mas não há nada a corrigir nem a retentar.
      if (err?.code === '23505' || /duplicate key value/i.test(err?.message || '')) {
        console.log(`[AgentService] 🛡️ Mensagem ${messageId} já persistida (entrega duplicada). Ignorando.`);
        return;
      }

      console.error(
        `[AgentService] ❌ FALHA NA ESCRITA ATÔMICA — msgId: ${messageId} | thread: ${threadId} | err:`,
        err?.message || err
      );
      // Todas as 3 operações falharam juntas: nenhum estado parcial foi criado.
      // O chamador pode decidir se retenta no nível superior.
      throw err;
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
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const trainingMode = agentData.training_mode || 'text';

    // ── Knowledge Base ──────────────────────────────────────────────
    let kbOutput = '';
    if (trainingMode === 'audio') {
      if (additionalKnowledge && additionalKnowledge.length > 0) {
        kbOutput = additionalKnowledge
          .filter((item: any) => item.is_active)
          .map((item: any) => `[${item.title || 'Conhecimento'}]\n${item.content}`).join('\n\n');
      }
    } else if (agentData.knowledge_base && Array.isArray(agentData.knowledge_base)) {
      kbOutput = agentData.knowledge_base.map((item: any) => {
        if (item.type === 'qa') return `P: ${item.question}\nR: ${item.answer}`;
        return `[${item.title}]\n${item.content}`;
      }).join('\n\n');
    }

    const profsInfo = (professionals && professionals.length > 0)
      ? professionals.map(p => `- ${p.name}: ${p.specialties}. ${p.bio || ''}`).join('\n')
      : '';

    const aboutCompany = trainingMode === 'text' ? (agentData.company_description || '') : '';
    const productsInfo = trainingMode === 'text' ? (agentData.company_products || '') : '';
    const faqInfo = trainingMode === 'text' ? (agentData.company_faq || '') : '';

    // ── Tom de voz por agente ───────────────────────────────────────
    const toneMap: Record<string, string> = {
      formal: 'Tom FORMAL: você fala de "senhor(a)", evita gírias, usa frases bem construídas. Direto e profissional.',
      casual: 'Tom CASUAL: você fala como amigo, usa "você", contrações naturais ("tá", "pra"), próximo sem ser invasivo.',
      tecnico: 'Tom TÉCNICO: você é preciso e objetivo, usa termos da área quando útil, sem firulas. Foco no conteúdo.',
      amigavel: 'Tom AMIGÁVEL: você é caloroso, demonstra interesse genuíno, valida o que o cliente sente, mas sem exagero.',
      consultivo: 'Tom CONSULTIVO: você faz perguntas estratégicas, entende a dor primeiro, depois recomenda. Não vende, orienta.',
    };
    const toneInstruction = agentData.tone_of_voice && toneMap[agentData.tone_of_voice]
      ? toneMap[agentData.tone_of_voice]
      : 'Tom NEUTRO: profissional e prestativo, sem extremos de formalidade.';

    const forbiddenBlock = (agentData.forbidden_topics && String(agentData.forbidden_topics).trim())
      ? `\n## ASSUNTOS PROIBIDOS\nNUNCA opine, recomende ou se aprofunde nos temas abaixo. Se o cliente insistir, diga educadamente que esse assunto foge do seu escopo e ofereça ajuda no que você sabe fazer:\n${agentData.forbidden_topics}\n`
      : '';

    const customExamples = (agentData.conversation_examples && String(agentData.conversation_examples).trim())
      ? `\n## EXEMPLOS DE DIÁLOGO (siga este TOM e ESTILO)\n${agentData.conversation_examples}\n`
      : `\n## EXEMPLOS DE DIÁLOGO (siga este TOM e ESTILO)
Cliente: Oi, tudo bem?
Você: Oi! Tudo ótimo por aqui 😊 Como posso te ajudar hoje?

Cliente: Quanto custa o serviço X?
Você: Boa pergunta! O valor varia conforme o que você precisa. Me conta um pouco mais sobre o que você tá buscando que eu te passo o melhor cenário?

Cliente: Vocês têm horário amanhã às 14h?
[Você chama a tool de disponibilidade ANTES de responder]
Você: Deixa eu confirmar pra você... [após a tool] Sim! 14h está disponível. Posso reservar pra você?

Cliente: [pergunta técnica que exige um especialista]
Você: Sobre isso especificamente eu não tenho como te orientar — é assunto para um profissional. Mas se quiser, posso agendar uma avaliação com nosso especialista. Topa?
`;

    // 3.B: Dados ricos do contato para personalizar a abordagem
    const clientInfoParts: string[] = [];
    if (threadData?.contact_status_funil) clientInfoParts.push(`Estágio no funil: ${threadData.contact_status_funil}`);
    if (threadData?.contact_total_msgs) clientInfoParts.push(`Mensagens trocadas: ${threadData.contact_total_msgs}`);
    if (threadData?.contact_since) {
      const since = new Date(threadData.contact_since);
      if (!isNaN(since.getTime())) clientInfoParts.push(`Cliente desde: ${since.toLocaleDateString('pt-BR')}`);
    }
    const clientInfoBlock = clientInfoParts.length > 0
      ? `- Dados do contato: ${clientInfoParts.join(' | ')}\n`
      : '';

    return `Dia e hora atual: ${dayStr}, ${dateStr}, ${timeStr}.

# IDENTIDADE
Você é o atendente da empresa ${agentData.company_name || 'Nossa Empresa'}.
Fale como uma pessoa real conversando pelo WhatsApp. Nunca diga que é IA, robô ou assistente virtual.
${agentData.prompt_base ? `\nMissão definida pelo dono da empresa:\n${agentData.prompt_base}\n` : ''}
${leadName ? `O cliente se chama ${leadName}. Use o nome com naturalidade, sem repetir toda hora.` : 'Você ainda não sabe o nome do cliente — pergunte na primeira oportunidade natural.'}

# TOM DE VOZ
${toneInstruction}
Responda em português brasileiro, em até 3 frases curtas. Sem markdown (sem **negrito**, _itálico_, # títulos ou listas com -). No máximo 1 emoji por resposta.
${forbiddenBlock}
# REGRAS DE ATENDIMENTO
- Use a memória da conversa. Nunca pergunte algo que o cliente já respondeu nesta conversa — releia o histórico antes de cada resposta.
- Nunca invente preço, prazo, disponibilidade ou política. Se não souber, diga "deixa eu confirmar com o time e já te respondo" e marque pra handover humano.
- Para falar com humano (cliente pediu, está irritado, ou após 3 tentativas sem resolver) chame a tool transfer_to_human.

# FLUXO DE AGENDAMENTO (use a tool Agendar)
Etapa 1 — Verificar disponibilidade
  → Chame Agendar(acao='verificar', date='YYYY-MM-DD') para um dia específico.
  → NUNCA invente horários. Sempre consulte a tool antes.
Etapa 2 — Apresentar horários
  → Use APENAS os horários do campo 'suggested_slots' do retorno (3 a 4 no máximo).
  → NUNCA liste o campo 'slots' completo — fica enorme.
  → Se 'slots' estiver vazio, avise e peça outra data.
Etapa 3 — Confirmar agendamento
  → Quando você já tiver data + horário + nome do cliente, chame Agendar(acao='agendar', date='YYYY-MM-DD', time='HH:mm', clientName='nome').
  → Se faltar só o nome, pergunte SÓ o nome — não pergunte de novo a data ou o horário que o cliente já disse.
  → Se Agendar retornar success=false, leia 'reason' e diga ao cliente de forma natural.

REGRA CRÍTICA: Tudo que o cliente já disse nesta conversa CONTA. Se ele disse "dia 29 às 10hs" lá atrás e agora você acabou de receber o nome dele, agende AGORA. Não pergunte "qual dia?" de novo — você já sabe.

# CONTEXTO DO CLIENTE
${clientInfoBlock}${threadData?.ad_tracking ? `- Origem do lead: anúncio "${threadData.ad_tracking.source || 'Meta Ads'}" / "${threadData.ad_tracking.headline || 'N/A'}".\n` : ''}
# CONHECIMENTO DA EMPRESA
${aboutCompany ? `## Sobre a empresa\n${aboutCompany}\n` : ''}
${productsInfo ? `## Produtos e serviços\n${productsInfo}\n` : ''}
${faqInfo ? `## Perguntas frequentes\n${faqInfo}\n` : ''}
${profsInfo ? `## Equipe disponível\n${profsInfo}\n` : ''}
${kbOutput ? `## Base de conhecimento adicional\n${kbOutput}\n` : ''}
${agentData.company_links ? `## Links úteis\n${agentData.company_links}\n` : ''}
${customExamples}`;
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

      // Sugere no máximo 4 slots distribuídos (manhã/meio-dia/tarde/final) para não poluir a mensagem.
      // Lista completa permanece em 'slots' para validação interna.
      const suggestedSlots = this.pickSuggestedSlots(availableSlots, 4);
      const slotsStr = suggestedSlots.length > 0
        ? suggestedSlots.join(', ')
        : 'nenhum horário disponível';

      return {
        slots: availableSlots,
        suggested_slots: suggestedSlots,
        slots_text: slotsStr,
        date: targetDate,
        professional: selectedProf.name,
        total_available: availableSlots.length,
        message: availableSlots.length > 0
          ? `APRESENTE ao cliente APENAS estes ${suggestedSlots.length} horários distribuídos ao longo do dia (não liste a agenda inteira): ${slotsStr}. Total real disponível: ${availableSlots.length}. Se o cliente pedir outros horários ou disser que nenhum serve, ofereça mais opções da lista completa.`
          : `Não há horários disponíveis em ${targetDate} com ${selectedProf.name}. Sugira outra data.`
      };
    } catch (e: any) {
      console.error('[AgentService] Check availability error:', e);
      return { slots: [], date: targetDate, error: e.message, message: 'Erro ao consultar a agenda. Tente novamente.' };
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

  /**
   * Escolhe até `max` horários distribuídos uniformemente ao longo da lista,
   * sempre incluindo o primeiro e o último para dar variedade de manhã/tarde.
   * Evita poluir o WhatsApp com lista enorme.
   */
  private pickSuggestedSlots(slots: string[], max: number = 4): string[] {
    if (slots.length <= max) return slots;
    const picked: string[] = [];
    const step = (slots.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) {
      const idx = Math.round(i * step);
      const slot = slots[idx];
      if (slot && !picked.includes(slot)) picked.push(slot);
    }
    return picked;
  }

  /**
   * Normaliza múltiplos formatos de horário para HH:mm.
   * Suporta: "11h", "11hs", "11:30", "9h30", "11", "11:00"
   */
  private normalizeTimeInput(time: string): string {
    if (!time) return time;
    const t = time.trim().toLowerCase();
    // "9h30" | "11h30" → "09:30" | "11:30"
    const hm = t.match(/^(\d{1,2})h(\d{2})$/);
    if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`;
    // "11h" | "11hs" | "9h" | "9hs" → "11:00" | "09:00"
    const hOnly = t.match(/^(\d{1,2})h(?:s)?$/);
    if (hOnly) return `${hOnly[1].padStart(2, '0')}:00`;
    // "11" (só dígitos) → "11:00"
    const numOnly = t.match(/^(\d{1,2})$/);
    if (numOnly) return `${numOnly[1].padStart(2, '0')}:00`;
    // "11:30" já está no formato correto
    return time;
  }

  /**
   * Gera contexto de calendário com os próximos 10 dias em PT-BR.
   * Inspirado no node `proximos_dias` do fluxo n8n de referência.
   * Remove a necessidade do LLM fazer matemática de datas.
   */
  private buildDateContext(): string {
    const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const lines: string[] = [];
    lines.push(`Hoje é ${days[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}.`);
    for (let i = 1; i <= 10; i++) {
      const f = new Date(now);
      f.setDate(now.getDate() + i);
      const dateStr = `${pad(f.getDate())}/${pad(f.getMonth() + 1)}/${f.getFullYear()}`;
      const isoStr = `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
      const dayName = days[f.getDay()];
      let label: string;
      if (i === 1) label = `Amanhã é ${dayName}, ${dateStr} (ISO: ${isoStr})`;
      else if (i === 2) label = `Depois de amanhã é ${dayName}, ${dateStr} (ISO: ${isoStr})`;
      else label = `${dayName} dia ${dateStr} (ISO: ${isoStr})`;
      lines.push(label);
    }
    return lines.join('\n');
  }

  /**
   * @deprecated Removido — confiamos no modelo + memória de 40 msgs + tools como o fluxo n8n original.
   * Mantido temporariamente como _detectBookingReady_unused (não é referenciado em lugar nenhum)
   * para preservar o histórico git se precisarmos voltar atrás.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _detectBookingReady_unused(
    history: Array<{ role: string; content: string }>,
    currentUserMsg: string,
    leadName: string | null
  ): { date: string; time: string; clientName: string } | null {
    // Combina histórico recente + mensagem atual (janela ampliada para cobrir
    // fluxos mais longos onde a data foi mencionada várias trocas atrás).
    const recent = [...history.slice(-20), { role: 'user', content: currentUserMsg }];
    const lowerCurrent = (currentUserMsg || '').toLowerCase().trim();

    // ── 1) SINAIS DE CONFIRMAÇÃO ────────────────────────────────────────
    const confirmSignals = [
      'pode agendar', 'pode marcar', 'pode confirmar', 'pode reservar',
      'sim agenda', 'sim pode', 'sim agende', 'sim confirma',
      'confirmo', 'confirma sim', 'confirmado', 'agende', 'agenda sim',
      'marca aí', 'marca ai', 'marca pra mim', 'pode marca',
      'fechado', 'fechou', 'beleza', 'perfeito', 'isso mesmo',
      'pode ser', 'tá ótimo', 'ta otimo', 'tudo certo', 'tá bom', 'ta bom',
      'ok pode', 'agendar sim', 'confirma', 'agende sim'
    ];
    // Verifica nas 3 últimas mensagens do usuário (tolerância a split)
    const lastUserMsgs = recent.filter(m => m.role === 'user').slice(-3);
    const recentUserText = lastUserMsgs.map(m => (m.content || '').toLowerCase()).join(' || ');
    let hasExplicitConfirm = confirmSignals.some(s => recentUserText.includes(s));

    // BLOCO recente do assistente: agrupa TODAS as mensagens consecutivas do assistant
    // posteriores ao último user. Necessário porque a IA frequentemente quebra a resposta
    // em duas msgs ("horários: 09:00, 11:00..." + "Qual deles te atende?") e olhar só a
    // ÚLTIMA perderia a lista de horários.
    const assistantBlock: string[] = [];
    for (let i = recent.length - 1; i >= 0; i--) {
      const m = recent[i];
      if (m.role === 'user' && i < recent.length - 1) break; // parou no user anterior à mensagem atual
      if (m.role === 'assistant') assistantBlock.unshift((m.content || '').toLowerCase());
    }
    const lastAssistant = assistantBlock.join(' ');

    // CONFIRMAÇÃO IMPLÍCITA #1: assistente pediu nome para confirmar, usuário forneceu
    const askedToConfirm =
      (lastAssistant.includes('confirmar') || lastAssistant.includes('confirmação') ||
       lastAssistant.includes('agendar') || lastAssistant.includes('agendamento')) &&
      (lastAssistant.includes('nome') || lastAssistant.includes('seu nome'));
    const looksLikeJustAName = !!lowerCurrent.match(/^[a-zà-úA-ZÀ-Ú\s]{2,40}$/) && lowerCurrent.split(/\s+/).length <= 4;
    const hasImplicitConfirm = askedToConfirm && looksLikeJustAName;

    // CONFIRMAÇÃO IMPLÍCITA #2: assistente listou horários disponíveis e cliente escolheu um deles.
    // Ex: IA diz "horários: 09:00, 13:00, 15:00" → cliente diz "quero as 15hrs" → é seleção, conta como confirmação.
    // Procura uma lista de horários (3+) no bloco recente do assistente (pode estar dividido em várias msgs).
    const slotListPattern = /\b\d{1,2}:\d{2}\b/g;
    const listedSlots: string[] = lastAssistant.match(slotListPattern) || [];
    // Extrai horário escolhido pelo cliente (HH:MM, NNh, NNhrs, "às NN")
    let pickedSlot: string | null = null;
    const pickColon = lowerCurrent.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (pickColon) pickedSlot = `${pickColon[1].padStart(2, '0')}:${pickColon[2]}`;
    if (!pickedSlot) {
      const pickH = lowerCurrent.match(/\b(\d{1,2})\s*h(?:rs?|oras?)?\b/i);
      if (pickH) pickedSlot = `${pickH[1].padStart(2, '0')}:00`;
    }
    if (!pickedSlot) {
      const pickAs = lowerCurrent.match(/\b[àa]s?\s+(\d{1,2})\b/i);
      if (pickAs) pickedSlot = `${pickAs[1].padStart(2, '0')}:00`;
    }
    const pickedFromList = !!(pickedSlot && listedSlots.length >= 3 && listedSlots.includes(pickedSlot));
    if (pickedFromList) {
      console.log(`[AgentService] 🎯 Slot picked from listed options: ${pickedSlot} ∈ [${listedSlots.join(', ')}]`);
    }

    if (!hasExplicitConfirm && !hasImplicitConfirm && !pickedFromList) return null;

    // ── 2) DATA ──────────────────────────────────────────────────────────
    let date: string | null = null;
    const today = new Date();
    const yearStr = String(today.getFullYear());
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = today.getDate();

    // Varre histórico mais recente primeiro
    const reverseRecent = [...recent].reverse();
    for (const msg of reverseRecent) {
      if (date) break;
      const text = msg.content || '';
      const lower = text.toLowerCase();

      // ISO YYYY-MM-DD
      const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
      if (iso) { date = `${iso[1]}-${iso[2]}-${iso[3]}`; continue; }

      // DD/MM ou DD/MM/YYYY
      const br = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
      if (br) {
        const dd = br[1].padStart(2, '0');
        const mm = br[2].padStart(2, '0');
        const yyyy = br[3] || yearStr;
        date = `${yyyy}-${mm}-${dd}`;
        continue;
      }

      // "amanhã"
      if (lower.includes('amanhã') || lower.includes('amanha')) {
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        continue;
      }

      // "hoje"
      if (lower.includes(' hoje') || lower.startsWith('hoje')) {
        date = `${yearStr}-${monthStr}-${String(dayStr).padStart(2, '0')}`;
        continue;
      }

      // "dia N" (assume mês atual; se já passou, vai pro próximo mês)
      const dia = text.match(/\bdia\s+(\d{1,2})\b/i);
      if (dia) {
        const dd = parseInt(dia[1], 10);
        let mm = today.getMonth() + 1;
        let yy = today.getFullYear();
        if (dd < dayStr) { // dia já passou neste mês → próximo mês
          mm++;
          if (mm > 12) { mm = 1; yy++; }
        }
        date = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        continue;
      }
    }
    if (!date) return null;

    // ── 3) HORÁRIO ───────────────────────────────────────────────────────
    let time: string | null = null;
    for (const msg of reverseRecent) {
      if (time) break;
      const text = msg.content || '';

      // HH:MM
      const colon = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (colon) { time = `${colon[1].padStart(2, '0')}:${colon[2]}`; continue; }

      // NHhMM ou NHh
      const hForm = text.match(/\b(\d{1,2})h(?:s|oras)?(?:\s*(\d{2}))?\b/i);
      if (hForm) {
        const hh = hForm[1].padStart(2, '0');
        const mm = hForm[2] || '00';
        time = `${hh}:${mm}`;
        continue;
      }

      // "às NN" (acompanhado de h opcional)
      const as = text.match(/\b[àa]s?\s+(\d{1,2})(?:h(?:oras)?)?\b/i);
      if (as) { time = `${as[1].padStart(2, '0')}:00`; }
    }
    if (!time) return null;

    // ── 4) NOME DO CLIENTE ──────────────────────────────────────────────
    let clientName: string | null = null;
    const userMsgs = recent.filter(m => m.role === 'user');
    for (const msg of [...userMsgs].reverse()) {  // do mais recente para o mais antigo
      if (clientName) break;
      const text = (msg.content || '').trim();

      // "meu nome é X" / "me chamo X" / "chamo-me X"
      const meuNome = text.match(/(?:meu nome [eé]|me chamo|chamo-me)\s+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,40}?)(?:[.,!?\n]|$)/i);
      if (meuNome) { clientName = meuNome[1].trim(); continue; }

      // "sou X" / "eu sou X"
      const sou = text.match(/\b(?:eu\s+)?sou\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,3})/);
      if (sou) { clientName = sou[1].trim(); continue; }

      // "Natan Vilela. Pode agendar" / "Natan Vilela, pode confirmar"
      const beforeConfirm = text.match(/^([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de\s+|da\s+|do\s+|dos\s+|das\s+)?[A-ZÀ-Ú][a-zà-ú]+){0,3})\s*[.,]\s*(?:pode|agend|confir|marca|fechad)/i);
      if (beforeConfirm) { clientName = beforeConfirm[1].trim(); continue; }

      // Mensagem que é APENAS um nome (ex: usuário responde "Natan Vilela" depois da pergunta do nome)
      if (askedToConfirm) {
        const onlyName = text.match(/^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,3})\.?$/);
        if (onlyName) { clientName = onlyName[1].trim(); continue; }
      }
    }
    if (!clientName) {
      // Resiliência / Fallback: Se não detectamos o nome nas mensagens do 'user',
      // mas o bot perguntou pelo nome (askedToConfirm === true), varre as mensagens
      // recentes independentemente de role para encontrar um padrão de nome.
      // Isso protege contra inversão de papéis (role reversal) em chats próprios de teste.
      for (const msg of [...recent].reverse()) {
        if (clientName) break;
        const text = (msg.content || '').trim();

        // Evita casar a própria pergunta do bot
        if (text.includes('qual é o seu nome') || text.includes('qual o seu nome') || text.includes('nome, por favor')) {
          continue;
        }

        const meuNome = text.match(/meu nome [eé]\s+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,40}?)(?:[.,!?\n]|$)/);
        if (meuNome) { clientName = meuNome[1].trim(); continue; }

        const sou = text.match(/\bsou\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,3})/);
        if (sou) { clientName = sou[1].trim(); continue; }

        const beforeConfirm = text.match(/^([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de\s+|da\s+|do\s+|dos\s+|das\s+)?[A-ZÀ-Ú][a-zà-ú]+){0,3})\s*[.,]\s*(?:pode|agend|confir|marca|fechad)/i);
        if (beforeConfirm) { clientName = beforeConfirm[1].trim(); continue; }

        if (askedToConfirm) {
          const onlyName = text.match(/^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,3})\.?$/);
          if (onlyName) { clientName = onlyName[1].trim(); continue; }
        }
      }
    }

    if (!clientName) clientName = leadName;
    // Se ainda não temos nome, retorna mesmo assim com clientName vazio.
    // O bookingDirective abaixo vai instruir a IA a perguntar APENAS o nome (não a data/horário de novo).
    return { date, time, clientName: clientName || '' };
  }

  /**
   * Cancela o agendamento confirmado mais recente do contato.
   * Soft-delete: atualiza status → 'cancelled' no banco E remove o evento do
   * Google Calendar do profissional (se houver). Falha do Google é tolerada
   * — não bloqueia o cancelamento no banco.
   */
  private async handleCancelAppointment(userId: string, threadId: string, _args: any) {
    try {
      const clientPhone = threadId.split('_')[1];
      const contactId = `${userId}_${clientPhone}`;
      console.log(`[AgentService] 🚫 Cancelling appointment for contact ${contactId}`);

      // Busca agendamento confirmado mais recente — prefere contact_id (mais confiável),
      // com fallback para client_phone para registros legados sem contact_id preenchido.
      const { data: appt } = await supabase
        .from('appointments')
        .select('id, data, time, professional_id, professional_name, google_event_id')
        .eq('user_id', userId)
        .or(`contact_id.eq.${contactId},client_phone.eq.${clientPhone}`)
        .eq('status', 'confirmed')
        .order('data', { ascending: false })
        .order('time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!appt) {
        return { success: false, reason: 'Nenhum agendamento confirmado encontrado para este contato.' };
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appt.id);

      if (error) {
        console.error('[AgentService] Cancel appointment error:', error);
        return { success: false, reason: error.message };
      }

      console.log(`[AgentService] ✅ Appointment ${appt.id} cancelled in DB`);

      // Remove o evento do Google Calendar (resiliente — não bloqueia se falhar)
      if (appt.google_event_id && appt.professional_id) {
        try {
          const { data: prof } = await supabase
            .from('professionals')
            .select('google_calendar_id')
            .eq('id', appt.professional_id)
            .maybeSingle();
          if (prof?.google_calendar_id) {
            await googleCalendarService.deleteEvent(userId, prof.google_calendar_id, appt.google_event_id);
            console.log(`[AgentService] ✅ Google Calendar event ${appt.google_event_id} deleted`);
          }
        } catch (gErr: any) {
          console.warn('[AgentService] ⚠️ Failed to delete Google Calendar event (DB cancel succeeded):', gErr?.message || gErr);
        }
      }

      return {
        success: true,
        cancelled_date: appt.data,
        cancelled_time: appt.time,
        professional: appt.professional_name,
        message: `Agendamento de ${appt.data} às ${appt.time} com ${appt.professional_name || 'a equipe'} foi cancelado com sucesso.`
      };
    } catch (e: any) {
      console.error('[AgentService] Cancel appointment error:', e);
      return { success: false, reason: e?.message || 'Erro interno ao cancelar' };
    }
  }

  /**
   * Reagenda o agendamento confirmado mais recente do contato para nova data/horário.
   *
   * Operação ATÔMICA: atualiza o MESMO registro (sem criar duplicata) e sincroniza
   * com Google Calendar (apaga evento antigo, cria novo). Se a atualização do DB
   * falhar, nada é alterado. Se o Google falhar, o DB ainda é atualizado e o
   * agendamento fica válido — apenas o calendário do profissional fica dessincronizado.
   */
  private async handleRescheduleAppointment(
    userId: string,
    threadId: string,
    contactName: string,
    args: any,
    agentData: any,
    professionals: any[]
  ) {
    try {
      const newDate = args.date;
      const newTime = this.normalizeTimeInput(args.time);
      if (!newDate || !newTime) {
        return { success: false, reason: 'Data e horário novos são obrigatórios para reagendar.' };
      }

      const clientPhone = threadId.split('_')[1];
      const contactId = `${userId}_${clientPhone}`;
      console.log(`[AgentService] 🔄 Rescheduling for ${contactId} → ${newDate} ${newTime}`);

      // Busca o agendamento confirmado mais recente
      const { data: appt } = await supabase
        .from('appointments')
        .select('id, data, time, client_name, professional_id, professional_name, google_event_id, agent_id')
        .eq('user_id', userId)
        .or(`contact_id.eq.${contactId},client_phone.eq.${clientPhone}`)
        .eq('status', 'confirmed')
        .order('data', { ascending: false })
        .order('time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!appt) {
        return { success: false, reason: 'Nenhum agendamento confirmado encontrado para reagendar.' };
      }

      // Não muda se for o mesmo horário
      const previousTime = (appt.time || '').substring(0, 5);
      if (appt.data === newDate && previousTime === newTime) {
        return { success: false, reason: 'O novo horário é o mesmo do atual.' };
      }

      // Resolve profissional para acessar Google Calendar
      let selectedProf: any = appt.professional_id
        ? professionals.find(p => p.id === appt.professional_id)
        : null;
      if (!selectedProf && args.professional_name) {
        selectedProf = professionals.find(
          p => p.name.toLowerCase().includes(String(args.professional_name).toLowerCase())
        );
      }

      // Sincroniza Google Calendar (resiliente) — delete antigo + create novo
      let newGoogleEventId = appt.google_event_id;
      if (selectedProf?.google_calendar_id) {
        try {
          if (appt.google_event_id) {
            await googleCalendarService.deleteEvent(userId, selectedProf.google_calendar_id, appt.google_event_id);
          }
          const start = new Date(`${newDate}T${newTime}:00`);
          const end = new Date(start.getTime() + (agentData.appointment_duration || 30) * 60000);
          const event = await googleCalendarService.createEvent(userId, selectedProf.google_calendar_id, {
            summary: `📅 Reagendamento: ${appt.client_name || contactName} (${agentData.nome || agentData.company_name || 'IA'})`,
            description: `Reagendado via WhatsApp AI.\nCliente: ${contactName}\nProtocolo: ${threadId}`,
            start: start.toISOString(),
            end: end.toISOString()
          });
          newGoogleEventId = event.id;
        } catch (gErr) {
          console.warn('[AgentService] ⚠️ Google Calendar reschedule failed (DB update will proceed):', gErr);
        }
      }

      // Atualiza o MESMO registro — mantém histórico ligado a um único agendamento
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          data: newDate,
          time: newTime,
          google_event_id: newGoogleEventId,
          summary: `Reagendado com ${appt.professional_name || selectedProf?.name || 'a equipe'}`
        })
        .eq('id', appt.id);

      if (updateError) {
        console.error('[AgentService] Reschedule UPDATE error:', updateError);
        return { success: false, reason: updateError.message };
      }

      console.log(`[AgentService] ✅ Appointment ${appt.id} rescheduled ${appt.data} ${previousTime} → ${newDate} ${newTime}`);

      return {
        success: true,
        id: appt.id,
        previous_date: appt.data,
        previous_time: previousTime,
        new_date: newDate,
        new_time: newTime,
        professional: appt.professional_name,
        google_synced: !!(selectedProf?.google_calendar_id && newGoogleEventId !== appt.google_event_id),
        message: `Reagendamento confirmado: de ${appt.data} às ${previousTime} para ${newDate} às ${newTime} com ${appt.professional_name || 'a equipe'}.`
      };
    } catch (e: any) {
      console.error('[AgentService] Reschedule error:', e);
      return { success: false, reason: e?.message || 'Erro interno ao reagendar' };
    }
  }

  private async handleBookAppointment(userId: string, threadId: string, contactName: string, args: any, agentData: any, professionals: any[]) {
    try {
      // Normaliza o horário antes de qualquer uso: "11h" → "11:00", "9h30" → "09:30"
      const normalizedTime = this.normalizeTimeInput(args.time);
      console.log(`[AgentService] 📝 Booking appointment for ${args.clientName} on ${args.date} at ${normalizedTime} (raw: ${args.time})`);

      let selectedProf = args.professional_name
        ? professionals.find(p => p.name.toLowerCase().includes(args.professional_name.toLowerCase()))
        : (professionals.length > 0 ? professionals[0] : null);

      if (!selectedProf) {
        selectedProf = {
          id: null, // Deixamos null para evitar erro de chave estrangeira
          name: agentData.company_name || 'Agenda Principal'
        };
      }

      // Resolve contact_id para associar ao agendamento
      const clientPhone = threadId.split('_')[1];
      const contactId = `${userId}_${clientPhone}`;

      // 1. Create in Google Calendar if integrated
      let googleEventId = null;
      if (selectedProf?.google_calendar_id) {
        try {
          const start = new Date(`${args.date}T${normalizedTime}:00`);
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
      // Tenta com todos os campos primeiro; se falhar por coluna inexistente,
      // retenta com o payload mínimo (resiliência a migrações pendentes).
      const modalidade = args.tipo || null; // 'presencial' | 'online' | null
      const fullPayload: Record<string, any> = {
        user_id:          userId,
        data:             args.date,
        time:             normalizedTime,
        client_name:      args.clientName,
        client_phone:     clientPhone,
        contact_id:       contactId,
        status:           'confirmed',
        professional_id:  selectedProf?.id,
        professional_name:selectedProf?.name,
        google_event_id:  googleEventId,
        agent_id:         agentData.id,
        modalidade,
        summary:          `Agendado com ${selectedProf?.name || 'IA'}`
      };

      let newDoc: any = null;
      let insertError: any = null;

      // Primeira tentativa: payload completo
      ({ data: newDoc, error: insertError } = await supabase
        .from('appointments').insert(fullPayload).select().single());

      // Se falhou por coluna inexistente (SQLSTATE 42703), retenta sem campos opcionais
      if (insertError && (insertError.code === '42703' || insertError.message?.includes('column'))) {
        console.warn('[AgentService] ⚠️ Retrying appointment insert without optional columns (migration pending?):', insertError.message);
        const minPayload = {
          user_id:     userId,
          data:        args.date,
          time:        normalizedTime,
          client_name: args.clientName,
          client_phone:clientPhone,
          status:      'confirmed'
        };
        ({ data: newDoc, error: insertError } = await supabase
          .from('appointments').insert(minPayload).select().single());
      }

      if (insertError) {
        console.error('[AgentService] Appointment INSERT error:', insertError);
        return { success: false, reason: insertError.message || 'Erro ao salvar no banco de dados' };
      }

      // 3. Atualiza contato: avança funil para 'Agendado' (fire-and-forget)
      void supabase
        .from('contacts')
        .update({ status_funil: 'Agendado', ultima_interacao: new Date().toISOString() })
        .eq('id', contactId)
        .then(({ error: cErr }) => {
          if (cErr) console.warn('[AgentService] Contact funnel update after booking failed:', cErr.message);
          else console.log(`[AgentService] ✅ Contact ${contactId} avançado para funil 'Agendado'`);
        });

      return {
        success: true,
        id: newDoc.id,
        professional: selectedProf?.name || null,
        tipo: modalidade,
        google_synced: !!googleEventId,
        message: `Agendamento confirmado para ${args.clientName} em ${args.date} às ${normalizedTime} com ${selectedProf?.name || 'a equipe'}.`
      };
    } catch (e: any) {
      console.error('[AgentService] Book appointment error:', e);
      return { success: false, reason: e?.message || 'Erro interno ao agendar' };
    }
  }

  private async getHistoryFromSupabase(threadId: string, limit: number) {
    // Exclui notas privadas (id LIKE 'private-%') — elas são internas do operador
    // e NÃO devem entrar no contexto da IA. Também filtra mensagens vazias.
    const { data } = await supabase
      .from('messages')
      .select('id, text, direction')
      .eq('thread_id', threadId)
      .not('id', 'like', 'private-%')
      .not('text', 'is', null)
      .neq('text', '')
      .order('timestamp', { ascending: false })
      .limit(limit);
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
            } else if (functionName === 'consultarEcommerce') {
              toolResult = await this.handleEcommerceSearch(userId, agentData, args.query || args.pergunta);
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

          const cleanPhone = normalizePhone(rawPhone);
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
            const validStatus = ['Lead', 'Qualificado', 'Agendado', 'Resolvido'];
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

  private async getAgentSecret(agentId: string, secretKey: string) {
    const { data } = await supabase
      .from('agent_secrets')
      .select('secret_value')
      .eq('agent_id', agentId)
      .eq('secret_key', secretKey)
      .maybeSingle();
    return data?.secret_value || null;
  }

  private async handleEcommerceSearch(userId: string, agentData: any, query: string) {
    try {
      const apiUrl = agentData.ecommerce_api_url;
      if (!apiUrl) return { error: 'E-commerce não configurado para este agente.' };

      const apiToken = await this.getAgentSecret(agentData.id, 'ecommerce_api_token');
      const useNlp = agentData.ecommerce_api_use_nlp;

      console.log(`[AgentService] 🛒 E-commerce Search: "${query}" (NLP: ${useNlp})`);

      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;

      let url = apiUrl;
      let options: any = { headers };

      if (useNlp) {
        url = `${apiUrl.endsWith('/') ? apiUrl : apiUrl + '/' }busca-ia`;
        options.method = 'POST';
        options.body = JSON.stringify({ query, modo: 'enxuto' });
      } else {
        url = `${apiUrl.endsWith('/') ? apiUrl : apiUrl + '/' }kits-e-itens?q=${encodeURIComponent(query)}&limit=5`;
        options.method = 'GET';
      }

      const response = await fetch(url, options);
      if (!response.ok) {
        const errText = await response.text();
        return { error: `Falha na API do E-commerce: ${response.status}`, details: errText };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (err: any) {
      console.error('[AgentService] Ecommerce search error:', err);
      return { error: 'Falha na comunicação com o e-commerce.', details: err.message };
    }
  }

  /**
   * Classifica a complexidade de uma mensagem para decidir qual modelo usar.
   * Simples → gpt-4o-mini (10-20x mais barato).
   * Complexo → modelo configurado pelo usuário (padrão gpt-4o).
   */
  private classifyMessageComplexity(body: string): 'simple' | 'complex' {
    const text = body.trim();
    if (text.length > 150) return 'complex';

    const complexKeywords = /agendar|marcar|hor[aá]rio|consulta|dispon[ií]vel|quando (posso|tem|voc[eê])|pre[cç]o|valor|cust[ao]|quero|preciso|gostaria|pedido|comprar|servi[cç]o|produto|reservar|cancelar|endere[cç]o|como chego|como funciona|enviar|entreg/i;
    if (complexKeywords.test(text)) return 'complex';

    return 'simple';
  }

  /**
   * Tools especializadas do SUB-AGENTE de agendamento.
   * Diferente da tool Agendar polimórfica do agente principal,
   * estas são 3 tools com nomes e propósitos claros — modelo de IA decide
   * com muito mais confiabilidade qual chamar.
   *
   * Inspirado no fluxo n8n de referência (ver_horarios, criar_reuniao, cancelar_reuniao).
   */
  private getSchedulingTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'verificar_disponibilidade',
          description: 'Consulta horários reais disponíveis em uma data específica. SEMPRE use ANTES de confirmar agendamento. NUNCA invente horários.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Data no formato YYYY-MM-DD (ex: 2026-05-28)' },
              professional_name: { type: 'string', description: 'Nome do profissional (opcional)' }
            },
            required: ['date']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'confirmar_agendamento',
          description: 'Efetiva o agendamento no banco e Google Calendar. SÓ chame quando tiver TODOS os dados: data, horário, nome do cliente.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              time: { type: 'string', description: 'HH:mm (ex: 10:00)' },
              clientName: { type: 'string', description: 'Nome completo do cliente' },
              professional_name: { type: 'string', description: 'Profissional (opcional)' },
              tipo: { type: 'string', enum: ['presencial', 'online'], description: 'Modalidade (opcional)' }
            },
            required: ['date', 'time', 'clientName']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'reagendar_agendamento',
          description: 'Move o agendamento confirmado mais recente do cliente para nova data/horário. USE quando o cliente pedir REMARCAR/REAGENDAR um agendamento existente (NÃO use para novos agendamentos). Sempre verifique disponibilidade do NOVO horário via verificar_disponibilidade antes de chamar.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Nova data YYYY-MM-DD' },
              time: { type: 'string', description: 'Novo horário HH:mm' },
              professional_name: { type: 'string', description: 'Profissional (opcional — mantém o atual se omitido)' }
            },
            required: ['date', 'time']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'cancelar_agendamento',
          description: 'Cancela o agendamento confirmado mais recente do cliente. Também remove o evento do Google Calendar do profissional.',
          parameters: { type: 'object', properties: {} }
        }
      }
    ];
  }

  /**
   * Sub-agente focado APENAS em agendamento.
   * Inspirado no fluxo n8n: tem prompt enxuto, calendário pré-computado e
   * 3 tools especializadas. Resposta vira diretamente o texto enviado ao cliente.
   *
   * @returns { text, bookingOccurred } — texto final + flag se houve agendamento
   */
  private async processSchedulingSubAgent(
    intent: string,
    userId: string,
    threadId: string,
    contactName: string,
    agentData: any,
    professionals: any[],
    history: Array<{ role: string; content: string }>,
    hint?: { date?: string; time?: string; clientName?: string; tipo?: string } | null
  ): Promise<{ text: string; bookingOccurred: boolean }> {
    console.log(`[SchedulingSubAgent] 🗓️ Processing intent on thread ${threadId}: "${intent.substring(0, 100)}"`);
    if (hint) console.log(`[SchedulingSubAgent] 💡 Hint:`, hint);

    const dateContext = this.buildDateContext();
    const tools = this.getSchedulingTools();

    // Contexto da conversa: últimas 8 trocas, formatadas como diálogo
    const recentHistory = history.slice(-8)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${m.content}`)
      .join('\n');

    // Bloco com dados já detectados deterministicamente
    let hintBlock = '';
    if (hint && (hint.date || hint.time || hint.clientName)) {
      const lines: string[] = ['[DADOS JÁ COLETADOS NESTA CONVERSA — USE DIRETAMENTE]'];
      if (hint.date) lines.push(`- Data: ${hint.date}`);
      if (hint.time) lines.push(`- Horário: ${hint.time}`);
      if (hint.clientName) lines.push(`- Nome do cliente: ${hint.clientName}`);
      if (hint.tipo) lines.push(`- Modalidade: ${hint.tipo}`);
      lines.push('');
      lines.push('⚠️ Estes dados JÁ FORAM informados. NÃO PERGUNTE NOVAMENTE. Use-os para confirmar_agendamento.');
      hintBlock = '\n' + lines.join('\n') + '\n';
    }

    const profList = professionals && professionals.length > 0
      ? professionals.map((p: any) => `- ${p.name}${p.specialties ? ` (${p.specialties})` : ''}`).join('\n')
      : 'Agenda universal (nenhum profissional específico cadastrado).';

    const systemPrompt = `# IDENTIDADE
Você é o módulo de agendamento de ${agentData.company_name || 'Nossa Empresa'}.
Sua ÚNICA função: processar agendamentos usando as 3 tools disponíveis.

# REGRAS CRÍTICAS
1. NUNCA invente horários. SEMPRE chame verificar_disponibilidade ANTES de propor horários ao cliente.
2. Se a conversa JÁ TEM data + horário + nome do cliente, chame confirmar_agendamento IMEDIATAMENTE. Não repita perguntas.
3. NUNCA peça novamente um dado que já está na conversa.
4. Após executar a tool, escreva resposta final em 1-2 frases curtas, em PT-BR, sem markdown, com tom natural.
5. Se confirmar_agendamento retornar success=true, parabenize brevemente. Se success=false, peça desculpas e informe o problema com naturalidade.

# TOOLS DISPONÍVEIS
- verificar_disponibilidade(date YYYY-MM-DD, professional_name?) — consultar slots livres
- confirmar_agendamento(date, time, clientName, professional_name?, tipo?) — efetivar NOVO agendamento
- reagendar_agendamento(date, time, professional_name?) — mover agendamento existente para outro dia/horário
- cancelar_agendamento() — cancelar agendamento existente

# QUANDO USAR CADA TOOL
- Cliente quer NOVO agendamento → confirmar_agendamento (após verificar_disponibilidade)
- Cliente quer MUDAR data/horário de agendamento já marcado → reagendar_agendamento (após verificar_disponibilidade do novo horário)
- Cliente quer CANCELAR sem remarcar → cancelar_agendamento

# PROFISSIONAIS DESTA EMPRESA
${profList}

# CALENDÁRIO DE REFERÊNCIA (use para converter "amanhã", "dia 28", etc em YYYY-MM-DD)
${dateContext}
${hintBlock}
# CONVERSA RECENTE
${recentHistory}

# PEDIDO ATUAL DO CLIENTE
${intent}

Decida e execute a próxima ação usando as tools. Após executar, responda ao cliente em 1-2 frases.`;

    const subMessages: any[] = [{ role: 'user', content: intent }];
    let bookingOccurred = false;
    let finalText: string | null = null;
    const MAX_SUB_ITERATIONS = 4;

    for (let iter = 0; iter < MAX_SUB_ITERATIONS; iter++) {
      console.log(`[SchedulingSubAgent] 🤖 Iteration ${iter + 1}/${MAX_SUB_ITERATIONS}`);
      // tool_choice='required' na primeira iteração se temos hint completo
      const toolChoice = (iter === 0 && hint && hint.date && hint.time && hint.clientName) ? 'required' : 'auto';
      const response = await generateAIResponse(systemPrompt, subMessages, tools, toolChoice as any, userId);

      if (!response || (!response.text && (!response.toolCalls || response.toolCalls.length === 0))) {
        console.warn('[SchedulingSubAgent] ⚠️ Empty response, breaking loop');
        break;
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        subMessages.push({ role: 'assistant', content: response.text || '', tool_calls: response.toolCalls });

        for (const toolCall of response.toolCalls) {
          const name = toolCall.function.name;
          let args: any = {};
          try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { args = {}; }
          console.log(`[SchedulingSubAgent] 🛠️ TOOL: ${name}`, args);

          let result: any;
          try {
            if (name === 'verificar_disponibilidade') {
              result = await this.handleCheckAvailability(userId, args.date, agentData, professionals, args.professional_name);
            } else if (name === 'confirmar_agendamento') {
              result = await this.handleBookAppointment(
                userId, threadId, contactName,
                { acao: 'agendar', ...args },
                agentData, professionals
              );
              if (result?.success) {
                bookingOccurred = true;
                if (args.clientName) {
                  await supabase.from('threads').update({ lead_name: args.clientName }).eq('id', threadId);
                }
              }
            } else if (name === 'reagendar_agendamento') {
              result = await this.handleRescheduleAppointment(userId, threadId, contactName, args, agentData, professionals);
              if (result?.success) {
                bookingOccurred = true;
              }
            } else if (name === 'cancelar_agendamento') {
              result = await this.handleCancelAppointment(userId, threadId, args);
            } else {
              result = { error: `Tool desconhecida: ${name}` };
            }
          } catch (toolErr: any) {
            result = { success: false, error: toolErr?.message || 'Erro interno' };
          }

          console.log(`[SchedulingSubAgent] ✅ Result:`, result);
          subMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(result)
          });
        }
      } else {
        finalText = response.text;
        break;
      }
    }

    // Fallback de texto: se o sub-agente não gerou resposta final, mas houve agendamento, monta resposta
    if (!finalText) {
      if (bookingOccurred && hint?.clientName) {
        const firstName = hint.clientName.trim().split(/\s+/)[0];
        finalText = `Prontinho, ${firstName}! Agendamento confirmado. Te espero! 😊`;
      } else {
        finalText = 'Tudo certo por aqui!';
      }
    }

    return { text: finalText, bookingOccurred };
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
          description: `Delega o pedido para o módulo de agendamento (verificar disponibilidade, confirmar consulta ou cancelar).

USE SEMPRE QUE o cliente:
- perguntar sobre horários disponíveis ('tem horário?', 'quais dias estão livres?')
- pedir um dia/horário específico ('tem amanhã às 10h?')
- confirmar um agendamento ('pode agendar', 'pode confirmar')
- pedir para cancelar um agendamento

PASSE EM 'intent' a descrição completa do que o cliente quer, incluindo TODAS
as informações relevantes que já foram trocadas na conversa: data, horário,
nome do cliente (se já informado), modalidade (presencial/online).

EXEMPLOS de intent:
- "Cliente quer verificar horários disponíveis no dia 28/05"
- "Cliente Natan Vilela quer confirmar agendamento dia 28/05 às 10h"
- "Cliente quer cancelar o agendamento marcado"

O módulo de agendamento processa o pedido com tools especializadas e retorna
uma resposta pronta. NÃO PERGUNTE ao cliente dados que ele já forneceu — passe
tudo que tiver no 'intent'.`,
          parameters: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                description: 'Descrição completa do pedido do cliente, com TODOS os dados conhecidos (data, hora, nome, modalidade). Use a linguagem natural.'
              },
              tipo: {
                type: 'string',
                enum: ['presencial', 'online'],
                description: "Modalidade (presencial/online), se o cliente especificou. Opcional."
              }
            },
            required: ['intent']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'consultarEcommerce',
          description: 'Busca produtos, kits, preços e disponibilidade no catálogo em tempo real do site do cliente.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'A frase ou termo de busca do cliente (ex: kits safari até 400 reais)' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'transfer_to_human',
          description: 'Transfere o atendimento para um agente humano. Use quando: (1) o cliente pedir explicitamente para falar com humano, (2) o cliente estiver irritado ou frustrado, (3) a solicitação estiver completamente fora do seu escopo, (4) após 3 tentativas sem conseguir resolver, ou (5) você coletou dados de onboarding (nome/email) com sucesso e um humano precisa intervir.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                enum: ['solicitacao_cliente', 'cliente_frustrado', 'fora_de_escopo', 'nao_resolvido', 'coleta_dados_concluida'],
                description: 'Motivo da transferência'
              },
              message: {
                type: 'string',
                description: 'Mensagem final para o cliente informando a transferência (em pt-BR, cordial e breve)'
              }
            },
            required: ['reason', 'message']
          }
        }
      }
    ];
  }
  public async updateContactTracking(userId: string, phoneNumber: string, trackingData: any) {
    try {
      const cleanPhone = normalizePhone(phoneNumber);
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
      const cleanPhone = normalizePhone(remoteJid);
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
          // TTL: 6h quando temos URL válida; 1h quando contato não tem foto
          // (evita spam na Evolution API para contatos sem foto)
          const ttlHours = existing.profile_picture_url ? 6 : 1;
          if (diffHours < ttlHours) return;
        }
      }

      const provider = await WhatsAppProviderFactory.getProvider(userId);
      const { data: prof } = await supabase.from('profiles').select('whatsapp_instance_id').eq('id', userId).single();
      const instanceName = prof?.whatsapp_instance_id || `wppai_${userId.substring(0, 8)}`;
      const photoUrl = await provider.fetchProfilePictureUrl(instanceName, remoteJid);

      // Sempre atualiza o timestamp para respeitar o TTL
      const updateData: Record<string, any> = {
        profile_picture_updated_at: new Date().toISOString(),
      };

      // Só sobrescreve a URL se conseguimos uma nova OU se for force refresh.
      // Isso evita que uma resposta null temporária da Evolution API apague
      // uma URL válida já armazenada.
      //
      // ATENÇÃO: nunca incluir 'photo_url' aqui. Essa coluna existe só em
      // 'profiles' — em threads/contacts o PostgREST rejeita o UPDATE INTEIRO
      // com 42703, e como o erro era ignorado nenhuma foto era gravada.
      if (photoUrl !== null || force) {
        updateData.profile_picture_url = photoUrl;
      }

      const [threadRes, contactRes] = await Promise.all([
        supabase.from('threads').update(updateData).eq('id', threadId),
        supabase.from('contacts').update(updateData).eq('id', contactId)
      ]);

      // Falha de escrita aqui é silenciosa por natureza (ninguém consome o
      // retorno) — logar é o que transforma "as fotos sumiram" em algo
      // diagnosticável.
      if (threadRes.error) {
        console.error(`[AgentService] ❌ Falha ao gravar foto na thread ${threadId}:`, threadRes.error.message);
      }
      if (contactRes.error) {
        console.error(`[AgentService] ❌ Falha ao gravar foto no contato ${contactId}:`, contactRes.error.message);
      }
    } catch (err) {
      console.error('[AgentService] Error syncing profile picture:', err);
    }
  }
}

export const agentService = new AgentService();
