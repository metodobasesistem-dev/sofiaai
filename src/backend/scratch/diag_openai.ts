import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';

// Load envs
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

async function testTranscription() {
  console.log('--- DIAGNOSTIC START ---');
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('API Key present:', !!apiKey);
  if (apiKey) {
    console.log('API Key starts with:', apiKey.substring(0, 7));
  }

  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not found in .env or .env.local');
    return;
  }

  const openai = new OpenAI({ apiKey });

  try {
    // We'll try to list models first to verify connectivity
    console.log('Testing connectivity to OpenAI...');
    await openai.models.list();
    console.log('Connectivity OK!');

    // Test a tiny transcription (this will likely fail because it's not a valid audio file, 
    // but the error message from OpenAI will tell us if the key/endpoint is working)
    console.log('Testing Whisper API...');
    const buffer = Buffer.from('dummy data');
    const file = await OpenAI.toFile(buffer, 'test.mp3');
    await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });
  } catch (err: any) {
    console.log('DIAGNOSTIC RESULT:', err.message);
    if (err.message.includes('Audio file is too short')) {
      console.log('>>> WHISPER API IS WORKING (Error is expected for dummy data)');
    } else {
      console.log('>>> SOMETHING ELSE IS WRONG:', err.message);
    }
  }
}

testTranscription();
