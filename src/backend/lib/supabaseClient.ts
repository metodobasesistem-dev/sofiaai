import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Use environment variables from system first, then fallback to .env files
if (!process.env.SUPABASE_URL) {
  if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
  } else {
    dotenv.config();
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[SupabaseClient] Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment.');
}

// Service Role client for backend operations (bypass RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log(`[SupabaseClient] Initialized for URL: ${supabaseUrl}`);
