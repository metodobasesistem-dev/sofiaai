import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';

// Force load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

// Timeouts por provedor (ms) — o webhook Meta tem timeout próprio de ~20s,
// então mantemos margem para retry + fallback antes disso
const OPENAI_TIMEOUT_MS = 12000;
const GEMINI_TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [1000, 3000, 9000]; // backoff exponencial: 1s, 3s, 9s

// Erros que NÃO devem ser retentados (não vão melhorar com retry)
const NON_RETRYABLE_PATTERNS = [
  /invalid_api_key/i,
  /incorrect api key/i,
  /api key missing/i,
  /content_policy_violation/i,
  /context_length_exceeded/i,
  /model_not_found/i,
];

function isRetryableError(err: any): boolean {
  const msg = (err?.message || String(err)).toString();
  return !NON_RETRYABLE_PATTERNS.some(rx => rx.test(msg));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  delays: number[] = RETRY_DELAYS_MS
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === delays.length) {
        throw err;
      }
      const delay = delays[attempt];
      console.warn(`[AIService] ⚠️ ${label} tentativa ${attempt + 1} falhou (${err?.message || err}). Tentando novamente em ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Estimativa rápida de tokens — não é exata mas é segura para limitar entrada
// (1 token ≈ 4 chars em pt-BR / inglês)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Trunca o histórico mantendo as mensagens mais recentes até caber no budget.
// Sempre preserva a última mensagem (a do usuário que está respondendo).
export function truncateHistoryByTokens<T extends { content: string | null | undefined }>(
  messages: T[],
  maxTokens: number = 8000
): T[] {
  if (!messages.length) return messages;
  let total = 0;
  const kept: T[] = [];
  // Itera do mais recente para o mais antigo, parando quando estourar
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens((messages[i].content as string) || '');
    if (total + tokens > maxTokens && kept.length > 0) break;
    total += tokens;
    kept.unshift(messages[i]);
  }
  if (kept.length < messages.length) {
    console.log(`[AIService] ✂️ Histórico truncado: ${messages.length} → ${kept.length} mensagens (~${total} tokens)`);
  }
  return kept;
}

// Pricing per 1k tokens (Estimated USD)
const PRICING = {
  'gpt-4o': { in: 0.005, out: 0.015 },
  'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  'o1-preview': { in: 0.015, out: 0.060 },
  'o1-mini': { in: 0.003, out: 0.012 },
  'gpt-4-turbo': { in: 0.010, out: 0.030 },
  'gpt-4': { in: 0.030, out: 0.060 },
  'gemini-1.5-pro': { in: 0.0035, out: 0.0105 },
  'gemini-1.5-flash': { in: 0.000075, out: 0.0003 },
  'gemini-1.5-flash-8b': { in: 0.0000375, out: 0.00015 },
  'gemini-2.0-flash-exp': { in: 0.000075, out: 0.0003 }, // Preliminary pricing
  'gemini-1.5-flash-latest': { in: 0.000075, out: 0.0003 }
} as any;

async function getAISettings(userId?: string) {
  const mask = (key?: string) => key && key.trim() !== '' ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : 'MISSING';

  // 1. Iniciar com valores padrão/env
  let finalSettings: any = {
    openai_api_key: process.env.OPENAI_API_KEY,
    gemini_api_key: process.env.GEMINI_API_KEY,
    default_ai_model: 'gpt-4o',
    llm_provider: 'openai',
    usd_brl_rate: 5.30
  };

  try {
    // 2. Tentar Configurações Globais
    const { data: global, error: globalErr } = await supabase.from('global_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (global && !globalErr) {
      finalSettings = { ...finalSettings, ...global };
      console.log(`[AIService] ⚙️ Settings globais carregadas (Provider: ${global.llm_provider})`);
    }

    // 3. Tentar Configurações Individuais (Profile)
    if (userId) {
      const { data: profile, error: profileErr } = await supabase.from('profiles')
        .select('llm_provider, openai_api_key, gemini_api_key, default_ai_model')
        .eq('id', userId)
        .maybeSingle();

      if (profile && !profileErr) {
        // Apenas sobrescreve se o usuário definiu algo específico
        if (profile.llm_provider) finalSettings.llm_provider = profile.llm_provider;
        if (profile.openai_api_key) finalSettings.openai_api_key = profile.openai_api_key;
        if (profile.gemini_api_key) finalSettings.gemini_api_key = profile.gemini_api_key;
        if (profile.default_ai_model) finalSettings.default_ai_model = profile.default_ai_model;

        console.log(`[AIService] 👤 Settings individuais aplicadas para User: ${userId}`);
      }
    }
  } catch (err: any) {
    console.warn(`[AIService] ⚠️ Falha na consulta de configurações: ${err.message}`);
  }

  return finalSettings;
}

type GenerateAIResponseResult = {
  text: string | null;
  toolCalls?: any[];
  usage?: { prompt_tokens: number; completion_tokens: number; cost_brl: number };
  providerUsed?: 'openai' | 'gemini';
};

async function callOpenAI(
  systemPrompt: string,
  messages: any[],
  tools: any[] | undefined,
  toolChoice: 'auto' | 'none' | 'required',
  apiKey: string,
  model: string,
  exchangeRate: number
): Promise<GenerateAIResponseResult> {
  const client = new OpenAI({ apiKey });

  const formattedMessages = messages.map(m => {
    if (m.role === 'user' && m.mediaUrl) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content || 'Analise esta imagem' },
          { type: 'image_url', image_url: { url: m.mediaUrl } }
        ]
      };
    }
    const formatted: any = { role: m.role, content: m.content };
    if (m.tool_call_id) formatted.tool_call_id = m.tool_call_id;
    if (m.tool_calls) formatted.tool_calls = m.tool_calls;
    if (m.name) formatted.name = m.name;
    return formatted;
  });

  const startTime = Date.now();
  const completion = await withTimeout(
    client.chat.completions.create({
      model: model,
      messages: [{ role: 'system', content: systemPrompt }, ...formattedMessages as any],
      temperature: 0.7,
      max_tokens: 1000,
      tools: tools?.length ? tools : undefined,
      tool_choice: tools?.length ? toolChoice : undefined,
    }),
    OPENAI_TIMEOUT_MS,
    'OpenAI'
  );

  const duration = Date.now() - startTime;
  const choice = completion.choices[0];
  const usage = completion.usage;

  const pricing = PRICING[model] || PRICING['gpt-4o'];
  const costUsd = ((usage?.prompt_tokens || 0) / 1000 * pricing.in) + ((usage?.completion_tokens || 0) / 1000 * pricing.out);

  console.log(`[AIService] ✅ Sucesso OpenAI (${usage?.total_tokens} tokens) em ${duration}ms`);

  return {
    text: choice.message.content,
    toolCalls: choice.message.tool_calls,
    usage: {
      prompt_tokens: usage?.prompt_tokens || 0,
      completion_tokens: usage?.completion_tokens || 0,
      cost_brl: costUsd * exchangeRate
    },
    providerUsed: 'openai',
  };
}

async function callGemini(
  systemPrompt: string,
  messages: any[],
  apiKey: string,
  model: string,
  exchangeRate: number
): Promise<GenerateAIResponseResult> {
  // Se o modelo for um modelo OpenAI, usa um Gemini default no fallback
  const geminiModelName = /^gpt|^o1/i.test(model) ? 'gemini-1.5-flash-latest' : model;
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: geminiModelName });

  const contents = await Promise.all(messages.map(async m => {
    const parts: any[] = [{ text: m.content || '' }];

    if (m.role === 'user' && m.mediaUrl) {
      try {
        const imgRes = await fetch(m.mediaUrl);
        const arrayBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = m.mediaMimeType || imgRes.headers.get('content-type') || 'image/jpeg';

        parts.push({
          inlineData: { data: base64, mimeType: mimeType }
        });
      } catch (imgErr) {
        console.error('[AIService] Failed to download image for Gemini:', imgErr);
      }
    }

    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: parts
    };
  }));

  console.log(`[AIService] 🚀 Chamando Google Gemini (${geminiModelName})...`);

  const startTime = Date.now();
  const result = await withTimeout(
    geminiModel.generateContent({
      contents: contents as any,
      systemInstruction: systemPrompt
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini'
  );

  const response = await result.response;
  const text = response.text();
  const duration = Date.now() - startTime;

  const usageMetadata = (response as any).usageMetadata;
  const promptTokens = usageMetadata?.promptTokenCount || 0;
  const completionTokens = usageMetadata?.candidatesTokenCount || 0;

  const pricing = PRICING[geminiModelName] || PRICING['gemini-1.5-flash'];
  const costUsd = (promptTokens / 1000 * pricing.in) + (completionTokens / 1000 * pricing.out);

  console.log(`[AIService] ✅ Sucesso Gemini (${promptTokens + completionTokens} tokens) em ${duration}ms`);

  return {
    text: text,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_brl: costUsd * exchangeRate
    },
    providerUsed: 'gemini',
  };
}

/**
 * Generates an AI response using the configured provider (OpenAI or Gemini).
 *
 * Resilência (Fase 1):
 * - Timeout: 12s OpenAI / 15s Gemini
 * - Retry com backoff exponencial (1s/3s/9s) em erros transitórios
 * - Fallback automático: se o provider primário falhar e o outro estiver configurado, tenta o outro
 */
export async function generateAIResponse(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; mediaUrl?: string; mediaMimeType?: string; [key: string]: any }[],
  tools?: any[],
  toolChoice: 'auto' | 'none' | 'required' = 'auto',
  userId?: string
): Promise<GenerateAIResponseResult> {
  const settings = await getAISettings(userId);
  const provider = (settings.llm_provider || 'openai') as 'openai' | 'gemini';
  const model = settings.default_ai_model || 'gpt-4o';
  const exchangeRate = settings.usd_brl_rate || 5.30;

  const openaiKey = (settings.openai_api_key && String(settings.openai_api_key).trim() !== '')
    ? settings.openai_api_key
    : process.env.OPENAI_API_KEY;
  const geminiKey = (settings.gemini_api_key && String(settings.gemini_api_key).trim() !== '')
    ? settings.gemini_api_key
    : process.env.GEMINI_API_KEY;

  console.log(`[AIService] 🤖 Gerando resposta... [Provider: ${provider}] [Model: ${model}]`);

  const hasOpenAI = !!openaiKey;
  const hasGemini = !!geminiKey;

  const tryOpenAI = () => withRetry(
    () => callOpenAI(systemPrompt, messages, tools, toolChoice, openaiKey, model, exchangeRate),
    'OpenAI'
  );
  const tryGemini = () => withRetry(
    () => callGemini(systemPrompt, messages, geminiKey, model, exchangeRate),
    'Gemini'
  );

  // Provider primário
  if (provider === 'openai') {
    if (hasOpenAI) {
      try {
        return await tryOpenAI();
      } catch (err: any) {
        console.error('[AIService] ❌ OpenAI falhou após retries:', err?.message || err);
        if (hasGemini) {
          console.log('[AIService] 🔄 Tentando fallback automático para Gemini...');
          try {
            return await tryGemini();
          } catch (gErr: any) {
            console.error('[AIService] ❌ Fallback Gemini também falhou:', gErr?.message || gErr);
            throw err; // lança o erro original do OpenAI
          }
        }
        throw err;
      }
    }
    if (hasGemini) {
      console.warn('[AIService] ⚠️ OpenAI key ausente — usando Gemini direto');
      return await tryGemini();
    }
    throw new Error('OpenAI key missing');
  }

  if (provider === 'gemini') {
    if (hasGemini) {
      try {
        return await tryGemini();
      } catch (err: any) {
        console.error('[AIService] ❌ Gemini falhou após retries:', err?.message || err);
        if (hasOpenAI) {
          console.log('[AIService] 🔄 Tentando fallback automático para OpenAI...');
          try {
            return await tryOpenAI();
          } catch (oErr: any) {
            console.error('[AIService] ❌ Fallback OpenAI também falhou:', oErr?.message || oErr);
            throw err;
          }
        }
        throw err;
      }
    }
    if (hasOpenAI) {
      console.warn('[AIService] ⚠️ Gemini key ausente — usando OpenAI direto');
      return await tryOpenAI();
    }
    throw new Error('Gemini key missing');
  }

  return { text: null };
}

/**
 * Transcribes audio using OpenAI Whisper.
 */
export async function transcribeAudio(buffer: Buffer, filename: string, userId?: string): Promise<string | null> {
  const settings = await getAISettings(userId);
  const key = settings.openai_api_key || process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const client = new OpenAI({ apiKey: key });
    const safeFilename = filename.endsWith('.ogg') ? filename.replace('.ogg', '.mp3') : filename;
    const file = await OpenAI.toFile(buffer, safeFilename);
    const transcription = await withTimeout(
      client.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
      }),
      OPENAI_TIMEOUT_MS,
      'Whisper'
    );
    return transcription.text;
  } catch (error) {
    console.error('[AIService] Transcription error:', error);
    return null;
  }
}

/**
 * Analyzes a transcription to identify missing business info and generate follow-up questions.
 */
export async function analyzeTranscription(transcription: string, userId?: string): Promise<string[]> {
  const settings = await getAISettings(userId);
  const key = settings.openai_api_key || process.env.OPENAI_API_KEY;
  if (!key) return [];

  try {
    const client = new OpenAI({ apiKey: key });

    // Fallback prompt se não houver um no banco
    const defaultPrompt = `Você é um analista de negócios especialista em treinamento de agentes de IA.
Sua tarefa é analisar a transcrição de um dono de negócio explicando sua empresa e identificar lacunas CRÍTICAS de informação.

Foque nos seguintes pilares:
1. Detalhes dos Serviços/Produtos
2. Preços e Formas de Pagamento
3. Horários de Atendimento e Localização
4. Como responder a objeções comuns (ex: "está caro")
5. Tom de voz desejado (formal, amigável, etc.)

Regras:
- Identifique o que NÃO foi mencionado ou o que está vago.
- Gere no MÁXIMO 3 perguntas curtas, diretas e amigáveis para o dono responder e completar o conhecimento.
- NÃO faça perguntas sobre o que já foi explicado.
- Se a transcrição já estiver completa, retorne um array vazio [].
- Retorne APENAS o JSON puro no formato: ["pergunta 1", "pergunta 2"]`;

    const systemPrompt = (settings as any).knowledge_analysis_prompt || defaultPrompt;

    const response = await withTimeout(
      client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Transcrição: "${transcription}"`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5
      }),
      OPENAI_TIMEOUT_MS,
      'OpenAI/analyze'
    );

    const content = response.choices[0].message.content;
    if (!content) return [];

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.warn('[AIService] analyzeTranscription: resposta não-JSON, retornando vazio');
      return [];
    }
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
    if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions.slice(0, 3);

    const values = Object.values(parsed).find(v => Array.isArray(v)) as string[];
    if (values) return values.slice(0, 3);

    return [];
  } catch (error) {
    console.error('[AIService] Analysis error:', error);
    return [];
  }
}

/**
 * Comprime o histórico antigo de uma conversa em um resumo de 2-3 frases.
 * Usa gpt-4o-mini para manter custo baixo — chamado apenas quando history > 20 msgs.
 */
export async function summarizeHistory(
  messages: { role: string; content: string }[],
  userId?: string
): Promise<string | null> {
  if (!messages.length) return null;

  const settings = await getAISettings(userId);
  const key = settings.openai_api_key || process.env.OPENAI_API_KEY;
  if (!key) return null;

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`)
    .join('\n');

  try {
    const client = new OpenAI({ apiKey: key });
    const response = await withTimeout(
      client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Resuma a conversa abaixo em 2-3 frases em português. Inclua: o que o cliente quer, o que foi combinado e dados importantes (nome, produto, horário, valor). Seja direto e conciso.'
          },
          { role: 'user', content: conversationText }
        ],
        max_tokens: 250,
        temperature: 0.2
      }),
      OPENAI_TIMEOUT_MS,
      'OpenAI/summary'
    );
    return response.choices[0]?.message?.content || null;
  } catch (err) {
    console.warn('[AIService] summarizeHistory failed (non-critical):', (err as any)?.message || err);
    return null;
  }
}

/**
 * Generates an embedding for the given text using OpenAI.
 */
export async function generateEmbedding(text: string, userId?: string): Promise<number[] | null> {
  const settings = await getAISettings(userId);
  const key = settings.openai_api_key || process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const client = new OpenAI({ apiKey: key });
    const response = await withTimeout(
      client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.replace(/\n/g, ' '),
      }),
      OPENAI_TIMEOUT_MS,
      'OpenAI/embeddings'
    );
    return response.data[0].embedding;
  } catch (error) {
    console.error('[AIService] Embedding error:', error);
    return null;
  }
}
