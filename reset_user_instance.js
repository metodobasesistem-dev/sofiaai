import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function resetProfileInstance() {
  console.log('Resetting whatsapp_instance_id for all profiles...');
  const { data, error } = await supabase
    .from('profiles')
    .update({ 
       whatsapp_instance_id: null, 
       whatsapp_status: 'disconnected',
       whatsapp_qr: null
    })
    .neq('id', '00000000-0000-0000-0000-000000000000'); 
    
  if (error) {
     console.error('Error:', error);
  } else {
     console.log('Reset successful. WppAI will now generate completely fresh instance names for all users.');
  }
}

resetProfileInstance();
