import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diag() {
  const natanUuid = '6524ad04-45bc-4fde-8e38-49e8cd1c40cf';
  const legacyId = 'WUmNt8pzzKPOxxhcozxPfy63onL2';

  console.log('--- DB SYNC CHECK ---');
  
  const { data: threadsUuid } = await supabase.from('threads').select('id, user_id').eq('user_id', natanUuid);
  const { data: threadsLegacy } = await supabase.from('threads').select('id, user_id').eq('user_id', legacyId);
  
  const { data: contactsUuid } = await supabase.from('contacts').select('id, user_id, telefone').eq('user_id', natanUuid);
  const { data: contactsLegacy } = await supabase.from('contacts').select('id, user_id, telefone').eq('user_id', legacyId);

  console.log(`Threads (UUID): ${threadsUuid?.length || 0}`);
  console.log(`Threads (Legacy): ${threadsLegacy?.length || 0}`);
  console.log(`Contacts (UUID): ${contactsUuid?.length || 0}`);
  console.log(`Contacts (Legacy): ${contactsLegacy?.length || 0}`);

  if (threadsUuid && threadsUuid.length > 0) {
    console.log('Sample Thread (UUID):', JSON.stringify(threadsUuid[0], null, 2));
  }
}

diag();
