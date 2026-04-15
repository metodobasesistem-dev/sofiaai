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
  'gemini-1.5-pro': { in: 0.0035, out: 0.0105 },
  'gemini-1.5-flash': { in: 0.000075, out: 0.0003 }
} as any;

let openai: OpenAI | null = null;
let currentOpenAIKey: string | null = null;
let genAI: GoogleGenerativeAI | null = null;
let currentGeminiKey: string | null = null;

async function getAISettings() {
  try {
    const { data: settings } = await supabase.from('global_settings').select('*').limit(1).maybeSingle();
    return settings || {
      openai_api_key: process.env.OPENAI_API_KEY,
      gemini_api_key: process.env.GEMINI_API_KEY,
      default_ai_model: 'gpt-4o',
      llm_provider: 'openai',
      usd_brl_rate: 5.30
    };
  } catch (err) {
    return {
      openai_api_key: process.env.OPENAI_API_KEY,
      gemini_api_key: process.env.GEMINI_API_KEY,
      default_ai_model: 'gpt-4o',
      llm_provider: 'openai',
      usd_brl_rate: 5.30
    };
  }
}

/**
 * Generates an AI response using the configured provider (OpenAI or Gemini).
 */
export async function generateAIResponse(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; [key: string]: any }[],
  tools?: any[],
  toolChoice: 'auto' | 'none' | 'required' = 'auto'
): Promise<{ 
  text: string | null; 
  toolCalls?: any[]; 
  usage?: { prompt_tokens: number; completion_tokens: number; cost_brl: number } 
}> {
  const settings = await getAISettings();
  const provider = settings.llm_provider || 'openai';
  const model = settings.default_ai_model || 'gpt-4o';
  const exchangeRate = settings.usd_brl_rate || 5.30;

  // --- OpenAI Client Refresh ---
  if (provider === 'openai') {
    const key = settings.openai_api_key || process.env.OPENAI_API_KEY;
    if (key !== currentOpenAIKey) {
      console.log('[AIService] 🔄 Refrescando cliente OpenAI com nova chave...');
      openai = key ? new OpenAI({ apiKey: key }) : null;
      currentOpenAIKey = key;
    }
    
    if (!openai) throw new Error('OpenAI key missing');

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 1000,
      tools: tools?.length ? tools : undefined,
      tool_choice: tools?.length ? toolChoice : undefined,
    });

    const choice = completion.choices[0];
    const usage = completion.usage;
    
    // Calculate cost in BRL
    const pricing = PRICING[model] || PRICING['gpt-4o'];
    const costUsd = ((usage?.prompt_tokens || 0) / 1000 * pricing.in) + ((usage?.completion_tokens || 0) / 1000 * pricing.out);
    
    return {
      text: choice.message.content,
      toolCalls: choice.message.tool_calls,
      usage: {
        prompt_tokens: usage?.prompt_tokens || 0,
        completion_tokens: usage?.completion_tokens || 0,
        cost_brl: costUsd * exchangeRate
      }
    };
  } 
  
  // --- Gemini Client Refresh ---
  else if (provider === 'gemini') {
    const key = settings.gemini_api_key || process.env.GEMINI_API_KEY;
    if (key !== currentGeminiKey) {
      console.log('[AIService] 🔄 Refrescando cliente Gemini com nova chave...');
      genAI = key ? new GoogleGenerativeAI(key) : null;
      currentGeminiKey = key;
    }

    if (!genAI) throw new Error('Gemini key missing');

    const geminiModel = genAI.getGenerativeModel({ model: model });
    
    // Convert OpenAI message format to Gemini
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const result = await geminiModel.generateContent({
      contents: contents,
      systemInstruction: systemPrompt
    });

    const response = await result.response;
    const text = response.text();
    
    // Gemini usage info
    const usageMetadata = (response as any).usageMetadata;
    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const completionTokens = usageMetadata?.candidatesTokenCount || 0;

    const pricing = PRICING[model] || PRICING['gemini-1.5-flash'];
    const costUsd = (promptTokens / 1000 * pricing.in) + (completionTokens / 1000 * pricing.out);

    return {
      text: text,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_brl: costUsd * exchangeRate
      }
    };
  }

  return { text: null };
}

/**
 * Transcribes audio using OpenAI Whisper.
 */
export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string | null> {
  const settings = await getAISettings();
  if (!openai && settings.openai_api_key) {
    openai = new OpenAI({ apiKey: settings.openai_api_key });
  }
  if (!openai) return null;

  try {
    const safeFilename = filename.endsWith('.ogg') ? filename.replace('.ogg', '.mp3') : filename;
    const file = await OpenAI.toFile(buffer, safeFilename);
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });
    return transcription.text;
  } catch (error) {
    console.error('[AIService] Transcription error:', error);
    return null;
  }
}
