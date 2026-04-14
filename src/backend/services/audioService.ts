import axios from 'axios';
import { supabase } from '../lib/supabaseClient.js';
import dotenv from 'dotenv';
import fs from 'fs';

// Force load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

export class AudioService {
  private apiKey = process.env.OPENAI_API_KEY;

  /**
   * Generates a speech buffer from text using OpenAI TTS.
   * @param text The text to convert to speech.
   * @param voice The voice ID to use (alloy, echo, fable, onyx, nova, shimmer).
   * @returns Buffer representing the audio file.
   */
  async generateSpeech(text: string, voice: string = 'alloy'): Promise<Buffer> {
    console.log(`[AudioService] generateSpeech executing. API Key present: ${!!this.apiKey}`);
    if (!this.apiKey) throw new Error('OpenAI API Key not configured for TTS');

    try {
      console.log(`[AudioService] Generating speech for text: "${text.substring(0, 30)}..." with voice: ${voice}`);
      
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1',
          input: text,
          voice: voice,
          response_format: 'mp3' // whatsapp-web.js handles mp3 well
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('[AudioService] Error generating speech:', error.response?.data || error.message);
      throw error;
    }
  }
}

export const audioService = new AudioService();
