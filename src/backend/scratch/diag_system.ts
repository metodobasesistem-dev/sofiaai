import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

async function diagnostic() {
  console.log('--- SYSTEM DIAGNOSTIC ---');

  // 1. Env Check
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'MISSING');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'OK' : 'MISSING');

  // 2. Supabase Check
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: agents, error } = await supabase.from('agents').select('nome').limit(1);
    if (error) throw error;
    console.log('Supabase Connection: OK');
    console.log('Agent Name Found:', agents[0]?.nome || 'NONE');
  } catch (err) {
    console.error('Supabase Connection: FAILED', err.message);
  }

  // 3. OpenAI Check
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use gpt-4o-mini as fallback
      messages: [{ role: "user", content: "Hello, are you alive?" }],
      max_tokens: 10
    });
    console.log('OpenAI Connection: OK');
    console.log('OpenAI Response:', completion.choices[0].message.content);
  } catch (err) {
    console.error('OpenAI Connection: FAILED', err.message);
  }
}

diagnostic();
