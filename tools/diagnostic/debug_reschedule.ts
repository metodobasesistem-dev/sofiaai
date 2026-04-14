
import { agentService } from '../src/backend/services/agentService.js';
import { supabase } from '../src/backend/lib/supabaseClient.js';

async function testReschedule() {
  const userId = '6524ad04-45bc-4fde-8e38-49e8cd1c40cf';
  const from = '74809757167842@lid'; // ID from screenshot thread
  const body = 'Quero reagendar pro dia 20 as 14:30hs';

  console.log('--- Testing Reschedule Flow ---');
  try {
    const response = await agentService.processIncoming(userId, {
      from,
      body,
      contactName: 'Natan De Souza',
      messageId: 'test-' + Date.now(),
      displayPhone: '5511999999999'
    });
    console.log('Final AI Response:', response);
  } catch (err) {
    console.error('CRASH DETECTED:', err);
  }
}

testReschedule();
