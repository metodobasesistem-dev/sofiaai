import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function migrateUser() {
  const currentId = 'WUmNt8pzzKPOxxhcozxPfy63onL2';
  const dataId = '6524ad04-45bc-4fde-8e38-49e8cd1c40cf';

  console.log(`--- MIGRATING DATA FROM ${dataId} TO ${currentId} ---`);

  // Update Agents
  const { error: e1 } = await supabase.from('agents').update({ user_id: currentId }).eq('user_id', dataId);
  console.log('Agents migration:', e1 ? 'Failed' : 'Success');

  // Update Professionals
  const { error: e2 } = await supabase.from('professionals').update({ user_id: currentId }).eq('user_id', dataId);
  console.log('Professionals migration:', e2 ? 'Failed' : 'Success');

  // Update KB
  const { error: e3 } = await supabase.from('knowledge_base').update({ user_id: currentId }).eq('user_id', dataId);
  console.log('Knowledge Base migration:', e3 ? 'Failed' : 'Success');

  if (e1 || e2 || e3) {
     console.error('Migration had errors. Likely the user_id column is restricted to UUID type.');
  } else {
     console.log('SUCCESS! Memory restored to current user session.');
  }
}

migrateUser();
