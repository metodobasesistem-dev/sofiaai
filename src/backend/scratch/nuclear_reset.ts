import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function nuclearReset() {
  console.log('--- NUCLEAR RESET: CLEANING ALL SESSIONS ---');

  // 1. Clear Supabase status
  console.log('Cleaning Supabase profiles status...');
  await supabase.from('profiles').update({
    whatsapp_status: 'disconnected',
    whatsapp_instance_id: null,
    whatsapp_qr: null
  }).neq('id', 'dummy'); // Update all

  // 2. Clear Sessions table if it exists
  try {
     await supabase.from('whatsapp_sessions').delete().neq('id', 'dummy');
  } catch(e) {}

  // 3. Delete local session files
  const sessionsPath = path.join(process.cwd(), 'sessions');
  if (fs.existsSync(sessionsPath)) {
    console.log('Deleting local sessions folder...');
    try {
        // We use a safe delete approach since some files might be locked
        const files = fs.readdirSync(sessionsPath);
        for (const file of files) {
            const fullPath = path.join(sessionsPath, file);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } catch (err) {
                console.warn(`Could not delete ${file}: ${err}`);
            }
        }
    } catch (err) {
        console.error('Failed to clean sessions folder:', err);
    }
  }

  console.log('--- RESET COMPLETE! Please restart the server and scan the QR code. ---');
}

nuclearReset();
