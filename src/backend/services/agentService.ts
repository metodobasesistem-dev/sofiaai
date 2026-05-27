import { audioService } from './audioService.js';
import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse, truncateHistoryByTokens, transcribeAudio, summarizeHistory } from './aiService.js';
import { redisService } from './redisService.js';
import { format, addMinutes, parseISO, isValid, isWithinInterval } from 'date-fns';
import { googleCalendarService } from './googleCalendarService.js';
import { EvolutionApiService } from './evolutionApiService.js';
import { WhatsAppProviderFactory } from '../providers/WhatsAppProviderFactory.js';
import { normalizePhone } from '../lib/phoneHelper.js';

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
        .eq('is_active', true);

      // 3. Persistent History — busca até 30 msgs (reduzido de 50 para evitar poluição
      // de contexto em casos de loop repetitivo, ex: agente pedindo mesma info várias vezes)
      const HISTORY_LIMIT = 30;
      const RECENT_COUNT = 12;
      let history = await redisService.getHistory(threadId, HISTORY_LIMIT);
      if (history.length === 0) {
        history = await this.getHistoryFromSupabase(threadId, HISTORY_LIMIT);
      }

      // Detecção de loop: se as últimas 6 mensagens do assistente contêm a mesma pergunta
      // (ex: "qual dia" ou "qual horário"), descarta o histórico antigo e usa só as últimas 4.
      // Isso quebra ciclos onde o contexto poluído força o modelo a repetir o padrão.
      const recentAssistantMsgs = history
        .filter((m: any) => m.role === 'assistant')
        .slice(-6)
        .map((m: any) => (m.content || '').toLowerCase());
      const loopKeywords = ['qual dia', 'qual horário', 'fica melhor para você', 'pela manhã ou à tarde'];
      const loopCount = recentAssistantMsgs.filter(msg =>
        loopKeywords.some(kw => msg.includes(kw))
      ).length;
      if (loopCount >= 3) {
        console.warn(`[AgentService] 🔄 Loop detectado na thread ${threadId} (${loopCount} repetições). Truncando histórico para últimas 4 msgs.`);
        history = history.slice(-4);
      }

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

      // 5.A: Classifica complexidade e seleciona modelo (simples → mini, complexo → configurado)
      const messageComplexity = this.classifyMessageComplexity(processBody);
      const modelOverride = messageComplexity === 'simple' ? 'gpt-4o-mini' : undefined;
      if (modelOverride) {
        console.log(`[AgentService] 💡 Mensagem simples → usando ${modelOverride} (economia de custo)`);
      }

      // 5.B: Chave de cache FAQ — só para mensagens simples sem contexto de áudio
      const normalizedBodyForCache = processBody.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100);
      const faqCacheKey = (messageComplexity === 'simple' && !isTranscribedAudio && agentData.id)
        ? `ai_faq:${agentData.id}:${Buffer.from(normalizedBodyForCache).toString('base64url').substring(0, 48)}`
        : null;

      // 5. AI Loop (Process Tools)
      const systemPrompt = this.buildSystemPrompt(agentData, threadData, activeProfessionals, knowledgeBlocks || []);
      const now = new Date();
      const dateContext = `\n[CONTEXTO TEMPORAL]\nHOJE: ${format(now, 'dd/MM/yyyy')}\nDATA ATUAL: ${format(now, 'yyyy-MM-dd')}\n`;

      // DETECÇÃO DETERMINÍSTICA DE AGENDAMENTO PRONTO:
      // Quando a conversa já contém data + horário + nome + sinal de confirmação,
      // injetamos uma diretiva explícita + forçamos tool_choice='required'.
      // Isso resolve o problema de loops em que o modelo ignora a regra ANTI-LOOP.
      const bookingReady = this.detectBookingReady(
        history,
        processBody,
        threadData?.lead_name || null
      );

      let bookingDirective = '';
      if (bookingReady) {
        console.log(`[AgentService] 🎯 BOOKING READY DETECTED on thread ${threadId}:`, bookingReady);
        bookingDirective = `

# ⚠️ AÇÃO OBRIGATÓRIA — AGENDAR AGORA
A conversa JÁ TEM TODOS OS DADOS necessários para confirmar o agendamento:
- Data: ${bookingReady.date}
- Horário: ${bookingReady.time}
- Nome do cliente: ${bookingReady.clientName}
- O cliente acabou de confirmar na última mensagem.

VOCÊ DEVE chamar AGORA, sem fazer NENHUMA pergunta adicional:
  Agendar(acao='agendar', date='${bookingReady.date}', time='${bookingReady.time}', clientName='${bookingReady.clientName}')

NÃO PERGUNTE de novo a data. NÃO PERGUNTE de novo o horário. NÃO PERGUNTE o nome.
Os dados já estão acima. Apenas chame a tool com EXATAMENTE esses valores.
`;
      }

      const fullPrompt = systemPrompt + dateContext + bookingDirective;
      const tools = this.getAgentTools();

      // Filtra e formata histórico
      const filteredHistory = history
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));

      // 3.A: Auto-sumariza histórico antigo quando > 20 mensagens para comprimir contexto
      let historyForAI: { role: 'user' | 'assistant'; content: string }[] = filteredHistory;
      if (filteredHistory.length > RECENT_COUNT) {
        const olderPart = filteredHistory.slice(0, filteredHistory.length - RECENT_COUNT);
        const recentPart = filteredHistory.slice(filteredHistory.length - RECENT_COUNT);
        const summary = await summarizeHistory(olderPart, dbUserId);
        if (summary) {
          historyForAI = [
            { role: 'user', content: `[Resumo do histórico anterior desta conversa]: ${summary}` },
            { role: 'assistant', content: 'Entendido. Considerei esse contexto.' },
            ...recentPart
          ];
          console.log(`[AgentService] 📝 Histórico resumido: ${olderPart.length} msgs antigas → 1 resumo`);
        } else {
          historyForAI = recentPart;
        }
      }

      // Aplica limite duro de tokens (8k) — preserva sempre as mais recentes
      const truncatedHistory = truncateHistoryByTokens(historyForAI, 8000);

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

      // 5.B: Verifica cache de resposta FAQ antes de chamar o LLM
      if (faqCacheKey) {
        try {
          const cached = await redisService.get(faqCacheKey);
          if (cached && typeof cached === 'string' && cached.length > 3) {
            aiFinalText = cached;
            console.log(`[AgentService] ⚡ FAQ cache HIT para "${processBody.substring(0, 40)}" — LLM ignorado`);
          }
        } catch { /* cache miss não é crítico */ }
      }

      while (!aiFinalText && iterationCount < MAX_TOOL_ITERATIONS) {
        iterationCount++;
        console.log(`[AgentService] 🤖 IA está pensando... (Thread: ${threadId}, Iter: ${iterationCount}/${MAX_TOOL_ITERATIONS})`);
        // Usa mini model para mensagens simples; após tool call, já não importa (toolCalledInThisTurn=true = iteração de resposta)
        const modelForThisCall = toolCalledInThisTurn ? undefined : modelOverride;
        // Força tool_choice='required' na PRIMEIRA iteração quando detectamos
        // que a conversa está pronta para agendar — garante que o modelo chame Agendar.
        const effectiveToolChoice: 'auto' | 'required' =
          bookingReady && iterationCount === 1 && !toolCalledInThisTurn ? 'required' : 'auto';
        const response = await generateAIResponse(fullPrompt, currentMessages, tools, effectiveToolChoice, dbUserId, modelForThisCall);
        
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
                // SAFETY NET: se detectamos booking ready E o modelo chamou Agendar mas
                // com a acao errada (ex: 'verificar' de novo), forçamos para 'agendar'
                // com os dados que já detectamos deterministicamente.
                if (bookingReady && iterationCount === 1 && args.acao !== 'agendar') {
                  console.warn(`[AgentService] 🔧 Booking ready mas modelo chamou Agendar(${args.acao}). Forçando para 'agendar' com dados detectados.`);
                  args = {
                    acao: 'agendar',
                    date: bookingReady.date,
                    time: bookingReady.time,
                    clientName: bookingReady.clientName,
                    ...(args.tipo ? { tipo: args.tipo } : {}),
                    ...(args.professional_name ? { professional_name: args.professional_name } : {})
                  };
                }

                if (args.acao === 'agendar') {
                  // Se booking ready foi detectado mas o modelo veio com args incompletos,
                  // preenche com os dados detectados (defesa em profundidade).
                  if (bookingReady) {
                    if (!args.date) args.date = bookingReady.date;
                    if (!args.time) args.time = bookingReady.time;
                    if (!args.clientName) args.clientName = bookingReady.clientName;
                  }
                  toolResult = await this.handleBookAppointment(dbUserId, threadId, contactName, args, agentData, activeProfessionals);
                  if (toolResult?.success && args.clientName) {
                    await supabase.from('threads').update({ lead_name: args.clientName }).eq('id', threadId);
                  }
                } else if (args.acao === 'cancelar') {
                  toolResult = await this.handleCancelAppointment(dbUserId, threadId, args);
                } else {
                  toolResult = await this.handleCheckAvailability(dbUserId, args.date, agentData, activeProfessionals, args.professional_name);
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

          // 5.B: Armazena no cache FAQ se a resposta foi simples (sem tool calls e sem transferência)
          if (faqCacheKey && aiFinalText && !toolCalledInThisTurn && !transferredToHuman) {
            void redisService.set(faqCacheKey, aiFinalText, 4 * 3600);
            console.log(`[AgentService] 💾 FAQ cacheado para "${processBody.substring(0, 40)}" (TTL 4h)`);
          }

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
      id:                  messageId,
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
      ...(direction === 'inbound' ? { last_inbound_at: tsToIso(timestamp) } : {})
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

Cliente: O remédio tal funciona pra dor de cabeça?
Você: Sobre medicação especificamente eu não tenho como te orientar — isso é coisa de profissional. Mas se você quiser, posso agendar uma avaliação com nosso especialista. Topa?
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

    return `# IDENTIDADE
Você é o assistente virtual da empresa **${agentData.company_name || 'Nossa Empresa'}**.
${agentData.prompt_base ? `\nMissão definida pelo dono da empresa:\n${agentData.prompt_base}\n` : ''}
${leadName ? `O cliente se chama **${leadName}**. Use o nome dele com naturalidade ao longo da conversa.` : 'Você ainda NÃO sabe o nome do cliente. Pergunte de forma natural na primeira oportunidade.'}

# REGRAS HARD (NUNCA VIOLE)
1. **IDIOMA**: Responda SEMPRE em português brasileiro, mesmo que o cliente escreva em outra língua.
2. **TAMANHO**: WhatsApp é conversa, não documento. Máximo 2 parágrafos curtos por resposta. Idealmente 1 a 3 frases. Quebre informação longa em várias mensagens só quando o cliente pedir detalhe.
3. **NÃO INVENTE**: Você NUNCA inventa preço, prazo, promoção, disponibilidade, características técnicas ou políticas da empresa. Se não tiver a informação na base de conhecimento abaixo ou nas suas tools, diga: "Deixa eu confirmar essa informação com o time e já te respondo". Marcar para handover humano é melhor que inventar.
4. **AGENDAMENTO** — siga EXATAMENTE este fluxo em 3 etapas:
   Etapa 1 → Chame Agendar(acao='verificar', date='YYYY-MM-DD') para obter os horários REAIS disponíveis. NUNCA informe horários sem chamar verificar antes.
   Etapa 2 → Apresente ao cliente somente os horários retornados (campo 'slots'). Se 'slots' estiver vazio, informe que não há horários disponíveis naquele dia e pergunte outra data.
   Etapa 3 → Após o cliente escolher o horário E confirmar o agendamento, chame Agendar(acao='agendar', date='YYYY-MM-DD', time='HH:mm', clientName='nome que o cliente informou').
   Se Agendar retornar success=false, leia o campo 'reason' e informe ao cliente com naturalidade que houve um problema (ex: "Tive um probleminha ao confirmar, pode tentar novamente?").
   Para clientName: use o nome que o cliente disse na conversa. Se não souber o nome, pergunte antes de chamar 'agendar'.
   ANTI-LOOP: Se você já sabe o dia, horário E nome — chame Agendar(acao='agendar') AGORA. Não faça nenhuma pergunta. Não repita perguntas já respondidas nesta conversa. Ver o mesmo dado informado mais de uma vez significa que você deve usar esse dado, não perguntar de novo.
5. **PERSONA**: Você é um humano da equipe da empresa — não revele que é IA, mesmo se perguntado diretamente. Se insistirem, redirecione: "Sou parte do atendimento, e estou aqui pra te ajudar com o que precisar 😊".
6. **EMOJIS**: Use no máximo 1 emoji por mensagem, e só quando combinar com o contexto. Nada de spam de emoji.
7. **FORMATAÇÃO**: NÃO use markdown (**negrito**, _itálico_, # títulos, listas com -). É WhatsApp puro. Se quiser destacar, use frases curtas em linhas separadas.
8. **TRANSFERÊNCIA**: Se o cliente pedir explicitamente para falar com humano, estiver muito irritado/frustrado, a solicitação estiver completamente fora do seu escopo, ou após 3 tentativas sem resolver — chame IMEDIATAMENTE a tool 'transfer_to_human' e envie uma mensagem cordial informando que um atendente irá ajudá-lo em breve.

# TOM DE VOZ
${toneInstruction}
${forbiddenBlock}
# CONTEXTO ATUAL
- Hoje é **${dayStr}**, ${dateStr}, ${timeStr}.
${clientInfoBlock}${threadData?.ad_tracking ? `- Origem do lead: anúncio de "${threadData.ad_tracking.source || 'Meta Ads'}" / "${threadData.ad_tracking.headline || 'N/A'}". Você pode usar isso se ele perguntar algo específico do anúncio.\n` : ''}

# CONHECIMENTO DA EMPRESA
${aboutCompany ? `## Sobre a empresa\n${aboutCompany}\n` : ''}
${productsInfo ? `## Produtos e serviços\n${productsInfo}\n` : ''}
${faqInfo ? `## Perguntas frequentes\n${faqInfo}\n` : ''}
${profsInfo ? `## Equipe disponível\n${profsInfo}\n` : ''}
${kbOutput ? `## Base de conhecimento adicional\n${kbOutput}\n` : ''}
${agentData.company_links ? `## Links úteis\n${agentData.company_links}\n` : ''}
${customExamples}
# CHECKLIST FINAL ANTES DE RESPONDER
- A resposta está em português?
- Está curta (1-3 frases ideais)?
- Você está afirmando algo que não consta no conhecimento acima? Se sim, REFORMULE.
- Você está usando markdown? Se sim, REMOVA.
- O tom bate com "${agentData.tone_of_voice || 'neutro'}"?
`;
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

      // Friendly summary for the AI so it can present options naturally
      const slotsStr = availableSlots.length > 0
        ? availableSlots.join(', ')
        : 'nenhum horário disponível';

      return {
        slots: availableSlots,
        slots_text: slotsStr,
        date: targetDate,
        professional: selectedProf.name,
        total_available: availableSlots.length,
        message: availableSlots.length > 0
          ? `Horários disponíveis em ${targetDate} com ${selectedProf.name}: ${slotsStr}.`
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
   * Detecta quando a conversa já tem TODOS os dados necessários para agendar:
   * data, horário, nome do cliente e sinal de confirmação na última mensagem do usuário.
   *
   * Quando detectado, retorna o payload pronto para a tool Agendar(agendar).
   * Caso contrário, retorna null e o fluxo segue normal (modelo decide).
   *
   * Esta detecção é determinística e contorna o problema de loops onde o modelo
   * ignora a regra ANTI-LOOP mesmo com todos os dados na conversa.
   */
  private detectBookingReady(
    history: Array<{ role: string; content: string }>,
    currentUserMsg: string,
    leadName: string | null
  ): { date: string; time: string; clientName: string } | null {
    // Combina histórico recente + mensagem atual do usuário
    const recent = [...history.slice(-10), { role: 'user', content: currentUserMsg }];

    // 1) Última mensagem do usuário precisa ter sinal de confirmação
    const lastUserMsg = (currentUserMsg || '').toLowerCase().trim();
    const confirmSignals = [
      'pode agendar', 'pode marcar', 'pode confirmar', 'pode reservar',
      'sim, agenda', 'sim agenda', 'sim, pode', 'sim pode', 'sim, agende',
      'confirmo', 'confirma sim', 'confirmado', 'agende', 'agenda sim',
      'marca aí', 'marca ai', 'marca pra mim', 'fechado', 'fechou',
      'beleza', 'perfeito', 'isso mesmo', 'pode ser', 'tá ótimo', 'ta otimo',
      'tudo certo', 'tá bom', 'ta bom', 'ok pode', 'agendar sim'
    ];
    const hasConfirm = confirmSignals.some(s => lastUserMsg.includes(s));
    if (!hasConfirm) return null;

    // 2) Extrai data — prioriza ISO YYYY-MM-DD, depois DD/MM, depois "dia N"
    let date: string | null = null;
    const today = new Date();
    const yearStr = String(today.getFullYear());
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');

    for (const msg of recent) {
      if (date) break;
      const text = msg.content || '';
      const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
      if (iso) {
        date = `${iso[1]}-${iso[2]}-${iso[3]}`;
        continue;
      }
      const br = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
      if (br) {
        const dd = br[1].padStart(2, '0');
        const mm = br[2].padStart(2, '0');
        const yyyy = br[3] || yearStr;
        date = `${yyyy}-${mm}-${dd}`;
        continue;
      }
      const dia = text.match(/\bdia\s+(\d{1,2})\b/i);
      if (dia) {
        const dd = dia[1].padStart(2, '0');
        date = `${yearStr}-${monthStr}-${dd}`;
      }
    }
    if (!date) return null;

    // 3) Extrai horário — HH:MM, HHh, HHhMM, "às HH"
    let time: string | null = null;
    for (const msg of recent) {
      if (time) break;
      const text = msg.content || '';
      const colon = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (colon) {
        time = `${colon[1].padStart(2, '0')}:${colon[2]}`;
        continue;
      }
      const hForm = text.match(/\b(\d{1,2})h(?:s|oras)?(?:\s*(\d{2}))?\b/i);
      if (hForm) {
        const hh = hForm[1].padStart(2, '0');
        const mm = hForm[2] || '00';
        time = `${hh}:${mm}`;
        continue;
      }
      const as = text.match(/\b[àa]s?\s+(\d{1,2})(?:h(?:oras)?)?\b/i);
      if (as) {
        time = `${as[1].padStart(2, '0')}:00`;
      }
    }
    if (!time) return null;

    // 4) Nome — prioriza padrões explícitos nas mensagens do usuário, depois leadName
    let clientName: string | null = null;
    const userMsgs = recent.filter(m => m.role === 'user');
    for (const msg of userMsgs) {
      if (clientName) break;
      const text = msg.content || '';
      const meuNome = text.match(/meu nome [eé]\s+([A-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,40}?)(?:[.,!?\n]|$)/);
      if (meuNome) { clientName = meuNome[1].trim(); continue; }
      const sou = text.match(/\bsou\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,3})/);
      if (sou) { clientName = sou[1].trim(); continue; }
      // Padrão "Natan Vilela. Pode agendar" ou "Natan Vilela, pode agendar"
      const beforeConfirm = text.match(/^([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de\s+|da\s+|do\s+|dos\s+|das\s+)?[A-ZÀ-Ú][a-zà-ú]+){0,3})\s*[.,]\s*(?:pode|agend|confir|marca|fechad)/i);
      if (beforeConfirm) { clientName = beforeConfirm[1].trim(); continue; }
    }
    if (!clientName) clientName = leadName;
    if (!clientName) return null;

    return { date, time, clientName };
  }

  /**
   * Cancela o agendamento confirmado mais recente do contato.
   * Soft-delete: atualiza status → 'cancelled', não remove o registro.
   * Nota: não cancela o evento no Google Calendar (gap conhecido).
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
        .select('id, data, time, professional_name, google_event_id')
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

      console.log(`[AgentService] ✅ Appointment ${appt.id} cancelled`);
      // Nota: evento do Google Calendar NÃO é removido automaticamente (gap conhecido)

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
      const tipoConsulta = args.tipo || null; // 'presencial' | 'online' | null
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
        tipo_consulta:    tipoConsulta,
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
        tipo: tipoConsulta,
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
          description: `Ferramenta de agendamento — TRÊS modos de uso:

MODO 1 — verificar (SEMPRE faça isso primeiro antes de agendar):
  Chame com acao='verificar' e date='YYYY-MM-DD' para consultar os horários reais disponíveis.
  Retorna: { slots: ["09:00","10:00",...], date, professional, total_available }
  Se slots estiver vazio, não há vagas naquele dia — pergunte outra data.

MODO 2 — agendar (só após cliente confirmar horário e nome):
  Chame com acao='agendar', date, time (HH:mm), clientName (nome que o cliente disse na conversa).
  Opcionalmente informe tipo='presencial' ou tipo='online' se o cliente especificar.
  Retorna: { success: true, id, professional } ou { success: false, reason: "mensagem de erro" }.
  Se success=false, leia o campo reason e informe o cliente com naturalidade.

MODO 3 — cancelar (quando o cliente pede para cancelar uma consulta existente):
  Chame com acao='cancelar'. Cancela o agendamento confirmado mais recente do contato.
  Retorna: { success: true, cancelled_date, cancelled_time, professional } ou { success: false, reason }.

IMPORTANTE: nunca chame 'agendar' sem antes ter chamado 'verificar' e sem o cliente ter escolhido um horário.`,
          parameters: {
            type: 'object',
            properties: {
              acao: {
                type: 'string',
                enum: ['verificar', 'agendar', 'cancelar'],
                description: "Use 'verificar' para listar horários disponíveis. Use 'agendar' para confirmar o agendamento após o cliente escolher. Use 'cancelar' para cancelar a consulta mais recente do cliente."
              },
              date: {
                type: 'string',
                description: "Data no formato YYYY-MM-DD (ex: 2026-06-10). Obrigatório para acao='verificar' e acao='agendar'."
              },
              time: {
                type: 'string',
                description: "Horário no formato HH:mm ou formatos amigáveis como '9h', '11h30'. Obrigatório quando acao='agendar'. Deve ser um dos horários retornados pelo verificar."
              },
              clientName: {
                type: 'string',
                description: "Nome completo do cliente/paciente, exatamente como ele informou na conversa. Obrigatório quando acao='agendar'."
              },
              professional_name: {
                type: 'string',
                description: 'Nome do profissional desejado (opcional). Omitir usa o profissional padrão ou agenda universal.'
              },
              tipo: {
                type: 'string',
                enum: ['presencial', 'online'],
                description: "Modalidade da consulta. Informe apenas se o cliente especificar. Omitir quando não mencionado."
              }
            },
            required: ['acao']
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
          description: 'Transfere o atendimento para um agente humano. Use quando: (1) o cliente pedir explicitamente para falar com humano, (2) o cliente estiver irritado ou frustrado, (3) a solicitação estiver completamente fora do seu escopo, (4) após 3 tentativas sem conseguir resolver.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                enum: ['solicitacao_cliente', 'cliente_frustrado', 'fora_de_escopo', 'nao_resolvido'],
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
      if (photoUrl !== null || force) {
        updateData.profile_picture_url = photoUrl;
        updateData.photo_url = photoUrl;
      }

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
