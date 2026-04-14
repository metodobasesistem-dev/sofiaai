import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function migrate() {
  const uuid = '6524ad04-45bc-4fde-8e38-49e8cd1c40cf';
  const legacyId = 'WUmNt8pzzKPOxxhcozxPfy63onL2';

  console.log('--- STARTING MIGRATION ---');

  // Migrate Threads
  const { data: threads } = await supabase.from('threads').select('*').eq('user_id', uuid);
  if (threads) {
    for (const t of threads) {
      const newId = t.id.replace(uuid, legacyId);
      await supabase.from('threads').upsert({ ...t, id: newId, user_id: legacyId });
      console.log(`Migrated thread ${t.id} -> ${newId}`);
    }
  }

  // Migrate Messages
  const { data: messages } = await supabase.from('messages').select('*').eq('user_id', uuid);
  if (messages) {
    for (const m of messages) {
       const newThreadId = m.thread_id.replace(uuid, legacyId);
       await supabase.from('messages').upsert({ ...m, user_id: legacyId, thread_id: newThreadId });
       console.log(`Migrated message ${m.id}`);
    }
  }

  // Migrate Contacts
  const { data: contacts } = await supabase.from('contacts').select('*').eq('user_id', uuid);
  if (contacts) {
    for (const c of contacts) {
      const newId = c.id.replace(uuid, legacyId);
      await supabase.from('contacts').upsert({ ...c, id: newId, user_id: legacyId });
      console.log(`Migrated contact ${c.id}`);
    }
  }

  console.log('--- MIGRATION COMPLETE ---');
}

migrate();
