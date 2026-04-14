import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';

// Force load envs since this module can be called widely
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('[AIService] OPENAI_API_KEY is not configured.');
}

/**
 * Generates an AI response using OpenAI based on the provided system conditions.
 * Supports tool calling for integration with other systems.
 */
export async function generateAIResponse(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; [key: string]: any }[],
  tools?: any[],
  toolChoice: 'auto' | 'none' | 'required' = 'auto'
): Promise<{ text: string | null; toolCalls?: any[] }> {
  if (!openai) {
    console.error('[AIService] OpenAI is not initialized. Cannot generate response.');
    return { text: null };
  }

  try {
    console.log(`[AIService] Sending ${messages.length} messages to OpenAI. Last message: "${messages[messages.length - 1]?.content.substring(0, 50)}..."`);
    // Debug history
    console.log('[AIService] Context summary:');
    messages.forEach((m, i) => console.log(`  ${i}: [${m.role}] ${m.content.substring(0, 30)}...`));

    const options: any = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 800,
    };

    if (tools && tools.length > 0) {
      options.tools = tools;
      options.tool_choice = toolChoice;
    }

    // console.log('[AIService] DEBUG FULL OPTIONS:', JSON.stringify(options, null, 2));

    const completion = await openai.chat.completions.create(options);

    const choice = completion.choices[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason;
    
    if (!message?.content && !message?.tool_calls) {
      console.warn(`[AIService] ⚠️ Warning: OpenAI returned empty response. Finish Reason: ${finishReason}`);
      console.log('[AIService] Full choice object:', JSON.stringify(choice, null, 2));
    }
    
    return {
      text: message?.content || null,
      toolCalls: message?.tool_calls,
    };
  } catch (error) {
    console.error('[AIService] Error communicating with OpenAI:', error);
    return { text: null };
  }
}

/**
 * Transcribes audio using OpenAI Whisper.
 */
export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string | null> {
  if (!openai) {
    console.error('[AIService] OpenAI not initialized for transcription.');
    return null;
  }
  try {
    console.log(`[AIService] Transcribing audio buffer of size: ${buffer.length} bytes...`);
    
    // Use .mp3 extension even if it's ogg/opus, OpenAI often handles the buffer better this way
    const safeFilename = filename.endsWith('.ogg') ? filename.replace('.ogg', '.mp3') : filename;
    
    const file = await OpenAI.toFile(buffer, safeFilename);
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });
    
    console.log(`[AIService] Transcription success: "${transcription.text.substring(0, 30)}..."`);
    return transcription.text;
  } catch (error: any) {
    console.error('[AIService] Transcription error details:', error.response?.data || error.message);
    return null;
  }
}
