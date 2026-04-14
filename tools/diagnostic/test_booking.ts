import { agentService } from '../src/backend/services/agentService.js';
import { supabase } from '../src/backend/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function testBooking() {
  const { data: profile } = await supabase.from('profiles').select('*').limit(1).single();
  if (!profile) {
    console.error('No profile found to test with.');
    return;
  }

  const userId = profile.id;
  
  const { data: agent } = await supabase.from('agents').select('id').eq('user_id', userId).limit(1).single();
  const agentId = agent?.id || '00000000-0000-0000-0000-000000000000';

  const testData = {
    date: '2026-04-20',
    time: '14:30',
    clientName: 'Teste de Sistema',
    clientPhone: '5511999999999@c.us',
    summary: 'Teste de sincronização Google Calendar',
    agentId: agentId,
    duration: 30
  };

  console.log('--- Starting Simulated Booking ---');
  try {
    const result = await (agentService as any).handleBookAppointment(userId, testData);
    console.log('\n--- Booking Result ---');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('CRITICAL ERROR:', err);
  }
}

testBooking();
