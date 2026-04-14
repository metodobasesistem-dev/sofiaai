import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[SupabaseFrontend] Warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
