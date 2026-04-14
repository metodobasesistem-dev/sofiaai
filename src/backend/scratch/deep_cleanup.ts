import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function deepCleanup() {
  console.log('--- [DEEP CLEANUP] Starting WhatsApp Reset ---');

  // 1. Reset Supabase status
  console.log('[1/3] Resetting profiles in Supabase...');
  try {
    const { error } = await supabase.from('profiles').update({
        whatsapp_status: 'disconnected',
        whatsapp_instance_id: null
    }).neq('id', 'dummy');
    if (error) throw error;
    console.log('   ✅ Supabase profiles reset.');
  } catch (err) {
    console.error('   ❌ Failed to reset Supabase:', err);
  }

  // 2. Clear Sessions folder
  const sessionsPath = path.join(process.cwd(), 'sessions');
  console.log(`[2/3] Checking sessions folder: ${sessionsPath}`);
  
  if (fs.existsSync(sessionsPath)) {
    try {
      const folders = fs.readdirSync(sessionsPath);
      console.log(`   Found ${folders.length} session folders.`);
      
      for (const folder of folders) {
        const fullPath = path.join(sessionsPath, folder);
        try {
          console.log(`   Deleting ${folder}...`);
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch (e: any) {
          console.warn(`   ⚠️  Could not delete ${folder} (maybe it is locked?): ${e.message}`);
        }
      }
      
      // Try to delete the main folder too
      try { fs.rmdirSync(sessionsPath); } catch (e) {}
      
      console.log('   ✅ Local sessions cleanup finished.');
    } catch (err) {
      console.error('   ❌ Failed to clean local sessions:', err);
    }
  } else {
    console.log('   ℹ️  Sessions folder does not exist. Nothing to delete.');
  }

  // 3. Instruction
  console.log('\n[3/3] IMPORTANT:');
  console.log('   If any folder failed to delete, close all node.exe processes and run this again.');
  console.log('--- [DEEP CLEANUP] Finished. Restart server and click Generate QR Code. ---');
}

deepCleanup();
