import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("=== PROFILES ===");
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
  if (profErr) {
    console.error("Error fetching profiles:", profErr);
  } else {
    console.log(JSON.stringify(profiles.map(p => ({ id: p.id, email: p.email, whatsapp_provider: p.whatsapp_provider, whatsapp_status: p.whatsapp_status, whatsapp_instance_id: p.whatsapp_instance_id })), null, 2));
  }

  console.log("\n=== AGENTS ===");
  const { data: agents, error: agentErr } = await supabase.from('agents').select('*');
  if (agentErr) {
    console.error("Error fetching agents:", agentErr);
  } else {
    console.log(JSON.stringify(agents.map(a => ({ id: a.id, user_id: a.user_id, nome: a.nome, status_ativo: a.status_ativo, follow_ups: a.follow_ups })), null, 2));
  }

  console.log("\n=== THREADS ===");
  const { data: threads, error: threadErr } = await supabase.from('threads').select('*');
  if (threadErr) {
    console.error("Error fetching threads:", threadErr);
  } else {
    console.log(`Total threads: ${threads.length}`);
    console.log(JSON.stringify(threads.map(t => ({ id: t.id, user_id: t.user_id, contact_name: t.contact_name, display_phone: t.display_phone, status: t.status, pending_followup: t.pending_followup, updated_at: t.updated_at, ticket_status: t.ticket_status, assigned_to: t.assigned_to })), null, 2));
  }
}

inspect();
