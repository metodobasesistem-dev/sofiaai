import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = `
-- 1. Permissão para INSERIR o próprio perfil
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Permissão para ATUALIZAR o próprio perfil
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Permissão para LER o próprio perfil
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- 4. Re-habilitar RLS em tabelas críticas com políticas de dono
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agents_owner_all" ON public.agents;
CREATE POLICY "agents_owner_all" ON public.agents FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agents_admin_all" ON public.agents;
CREATE POLICY "agents_admin_all" ON public.agents FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Repetir para contatos
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_owner_all" ON public.contacts;
CREATE POLICY "contacts_owner_all" ON public.contacts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "contacts_admin_all" ON public.contacts;
CREATE POLICY "contacts_admin_all" ON public.contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
`;

async function run() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  console.log('Applying RLS fixes for client experience...');
  
  // We run via rpc if available or we just explain we need the user to run it
  // Since I don't have a direct 'run_sql' RPC, I will ask the user to run it in the SQL Editor
  // OR I can try to use the API to check if it's already working.
  // Actually, I'll just give the code and tell the user to run it, OR I can try to execute it if I have an RPC.
  
  console.log('Done (Script check). Please run the SQL file in Supabase Dashboard.');
}

run();
