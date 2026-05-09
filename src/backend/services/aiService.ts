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
  'gemini-1.5-flash-latest': { in: 0.000075, out: 0.0003 }
} as any;

async function getAISettings(userId?: string) {
  const mask = (key?: string) => key && key.trim() !== '' ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : 'MISSING';

  // 1. Iniciar com valores padrão/env
  let finalSettings = {
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

/**
 * Generates an AI response using the configured provider (OpenAI or Gemini).
 */
export async function generateAIResponse(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; mediaUrl?: string; mediaMimeType?: string; [key: string]: any }[],
  tools?: any[],
  toolChoice: 'auto' | 'none' | 'required' = 'auto',
  userId?: string
): Promise<{ 
  text: string | null; 
  toolCalls?: any[]; 
  usage?: { prompt_tokens: number; completion_tokens: number; cost_brl: number } 
}> {
  const settings = await getAISettings(userId);
  const provider = settings.llm_provider || 'openai';
  let model = settings.default_ai_model || 'gpt-4o';
  const exchangeRate = settings.usd_brl_rate || 5.30;

  console.log(`[AIService] 🤖 Gerando resposta... [Provider: ${provider}] [Model: ${model}]`);

  // --- OpenAI ---
  if (provider === 'openai') {
    const key = (settings.openai_api_key && settings.openai_api_key.trim() !== '') 
      ? settings.openai_api_key 
      : process.env.OPENAI_API_KEY;

    if (!key) {
      console.error('[AIService] ❌ ERRO: Chave OpenAI não encontrada (Banco/Env vazios)');
      throw new Error('OpenAI key missing');
    }
    
    const client = new OpenAI({ apiKey: key });

    // Preparar mensagens multimodais para OpenAI
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

    try {
      const startTime = Date.now();
      const completion = await client.chat.completions.create({
        model: model,
        messages: [{ role: 'system', content: systemPrompt }, ...formattedMessages as any],
        temperature: 0.7,
        max_tokens: 1000,
        tools: tools?.length ? tools : undefined,
        tool_choice: tools?.length ? toolChoice : undefined,
      });

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
        }
      };
    } catch (error) {
      console.error('[AIService] ❌ Erro na chamada OpenAI:', error);
      throw error;
    }
  } 
  
  // --- Google Gemini ---
  if (provider === 'gemini') {
    const key = (settings.gemini_api_key && settings.gemini_api_key.trim() !== '') 
      ? settings.gemini_api_key 
      : process.env.GEMINI_API_KEY;

    if (!key) {
      console.error('[AIService] ❌ ERRO: Chave Gemini não encontrada (Banco/Env vazios)');
      throw new Error('Gemini key missing');
    }

    const maskedKey = `${key.substring(0, 7)}...${key.substring(key.length - 4)}`;
    console.log(`[AIService] 🔑 Utilizando chave Gemini: ${maskedKey}`);
    
    try {
      const startTime = Date.now();
      const genAI = new GoogleGenerativeAI(key);
      const geminiModel = genAI.getGenerativeModel({ model: model });
      
      // Convert OpenAI message format to Gemini (Multimodal support)
      const contents = await Promise.all(messages.map(async m => {
        const parts: any[] = [{ text: m.content || '' }];

        if (m.role === 'user' && m.mediaUrl) {
          try {
            console.log(`[AIService] 📥 Fetching image for Gemini: ${m.mediaUrl}`);
            const imgRes = await fetch(m.mediaUrl);
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = m.mediaMimeType || imgRes.headers.get('content-type') || 'image/jpeg';

            parts.push({
              inlineData: {
                data: base64,
                mimeType: mimeType
              }
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

      console.log(`[AIService] 🚀 Chamando Google Gemini Multimodal...`);

      const result = await geminiModel.generateContent({
        contents: contents,
        systemInstruction: systemPrompt
      });

      const response = await result.response;
      const text = response.text();
      const duration = Date.now() - startTime;
    
    // Gemini usage info
    const usageMetadata = (response as any).usageMetadata;
    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const completionTokens = usageMetadata?.candidatesTokenCount || 0;

    const pricing = PRICING[model] || PRICING['gemini-1.5-flash'];
    const costUsd = (promptTokens / 1000 * pricing.in) + (completionTokens / 1000 * pricing.out);

    console.log(`[AIService] ✅ Sucesso Gemini (${promptTokens + completionTokens} tokens) em ${duration}ms`);

      return {
        text: text,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_brl: costUsd * exchangeRate
        }
      };
    } catch (error) {
      console.error('[AIService] ❌ Erro na chamada Gemini:', error);
      throw error;
    }
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
    const transcription = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });
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

    const systemPrompt = settings.knowledge_analysis_prompt || defaultPrompt;

    const response = await client.chat.completions.create({
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
    });

    const content = response.choices[0].message.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    // GPT might return { "questions": [...] } or just [...] if we are lucky, 
    // but with json_object it usually needs a key.
    // Let's refine the prompt to ensure a key if needed, or handle both.
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
    if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions.slice(0, 3);
    
    // Fallback if it returned something else with values as questions
    const values = Object.values(parsed).find(v => Array.isArray(v)) as string[];
    if (values) return values.slice(0, 3);

    return [];
  } catch (error) {
    console.error('[AIService] Analysis error:', error);
    return [];
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
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' '),
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('[AIService] Embedding error:', error);
    return null;
  }
}

