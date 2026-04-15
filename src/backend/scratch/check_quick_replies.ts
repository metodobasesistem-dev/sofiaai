import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diagnose() {
  console.log('--- Checking quick_replies Table ---');
  try {
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error selecting from quick_replies:', error.message);
      if (error.message.includes('relation "quick_replies" does not exist')) {
        console.log('CRITICAL: Table quick_replies is MISSING!');
      }
    } else {
      console.log('Table quick_replies exists.');
      console.log('Sample data:', data);
    }
  } catch (err: any) {
    console.error('Exception check:', err.message);
  }
}

diagnose();
