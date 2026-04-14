
import { agentService } from '../src/backend/services/agentService.js';
import { supabase } from '../src/backend/lib/supabaseClient.js';

async function test() {
  const userId = '6524ad04-45bc-4fde-8e38-49e8cd1c40cf';
  const { data: agentData } = await supabase.from('agents').select('*').eq('user_id', userId).single();
  
  console.log('Testing handleCheckAvailability...');
  try {
    const result = await (agentService as any).handleCheckAvailability(userId, '2026-04-20', agentData);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('CRASH:', err);
  }
}

test();
