import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function inspect() {
  console.log('--- Inspecting Appointments ---');
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching appointments:', error);
  } else {
    console.table(appointments.map(a => ({
      id: a.id.slice(0,8),
      data: a.data,
      time: a.time,
      client: a.client_name,
      phone: a.client_phone,
      status: a.status,
      g_id: a.google_event_id ? 'YES' : 'NO'
    })));
  }

  console.log('\n--- Inspecting First Profile ---');
  const { data: profile } = await supabase.from('profiles').select('*').limit(1).single();
  console.log('Profile Sync Active:', profile?.google_calendar_active);
  console.log('Selected Calendar ID:', profile?.selected_calendar_id);
  console.log('Has Refresh Token:', !!profile?.google_refresh_token);
}

inspect();
