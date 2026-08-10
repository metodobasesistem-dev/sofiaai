-- =============================================================================
-- Restaura o Row Level Security (RLS) nas tabelas centrais do produto.
--
-- CONTEXTO: A migration 20260522200000_fix_agents_complete.sql desativou RLS
-- em whatsapp_sessions, channels, agents, contacts, messages e threads como
-- correção emergencial, e isso nunca foi revertido. Como o frontend consulta
-- essas tabelas diretamente com a anon key (src/lib/supabase.ts), qualquer
-- usuário autenticado conseguia ler/alterar/apagar dados de QUALQUER tenant
-- (mensagens de WhatsApp, contatos, agentes de IA, etc.), e a policy aberta
-- em profiles ("USING (true)") expunha openai_api_key/gemini_api_key de
-- todos os clientes.
--
-- Esta migration:
--   1. Cria uma função is_admin() (SECURITY DEFINER, sem risco de recursão
--      de RLS) para permitir que o painel administrativo continue
--      enxergando dados agregados de todos os tenants pela anon key
--      (getGlobalDashboardStats, listChannels) exatamente como fazia antes.
--   2. Fecha profiles para leitura/escrita apenas do próprio usuário
--      (+ leitura por admins).
--   3. Reativa RLS em agents/contacts/threads/messages/channels com policies
--      "dono do dado" (user_id = auth.uid()), + leitura por admins nas
--      tabelas onde o frontend hoje depende de visão agregada (contacts,
--      messages, channels).
--
-- SEGURANÇA: O backend usa a service_role key, que sempre ignora RLS — nenhum
-- endpoint do servidor (Express) é afetado por esta migration. Apenas
-- acessos diretos via anon key (frontend) passam a respeitar as regras.
--
-- Observação: a tabela whatsapp_sessions não existe neste projeto (confirmado
-- em docs/rls_phase4_security.sql), então não há bloco correspondente aqui.
-- =============================================================================

-- =============================================================================
-- BLOCO 0: HELPER — is_admin()
-- SECURITY DEFINER: executa com o dono da função, então a leitura de
-- profiles aqui dentro NÃO é filtrada pela RLS de profiles (evita recursão).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;


-- =============================================================================
-- BLOCO 1: PROFILES
-- Fecha a policy "profiles_role_read_all" (USING (true)) criada em
-- 20260522200000_fix_agents_complete.sql, que expunha openai_api_key,
-- gemini_api_key, whatsapp_qr etc. de todos os usuários.
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_role_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_view_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Sem policy de DELETE: exclusão de perfil só acontece via service_role
-- (cascata de auth.users), o que já ignora RLS.


-- =============================================================================
-- BLOCO 2: AGENTS
-- Confirmado: frontend só lê/grava os próprios agentes (.eq('user_id', uid)).
-- =============================================================================
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select_own" ON public.agents;
DROP POLICY IF EXISTS "agents_insert_own" ON public.agents;
DROP POLICY IF EXISTS "agents_update_own" ON public.agents;
DROP POLICY IF EXISTS "agents_delete_own" ON public.agents;

CREATE POLICY "agents_select_own"
  ON public.agents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "agents_insert_own"
  ON public.agents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "agents_update_own"
  ON public.agents FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "agents_delete_own"
  ON public.agents FOR DELETE
  USING (user_id = auth.uid());


-- =============================================================================
-- BLOCO 3: THREADS (conversas)
-- =============================================================================
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threads_select_own" ON public.threads;
DROP POLICY IF EXISTS "threads_insert_own" ON public.threads;
DROP POLICY IF EXISTS "threads_update_own" ON public.threads;
DROP POLICY IF EXISTS "threads_delete_own" ON public.threads;

CREATE POLICY "threads_select_own_or_admin"
  ON public.threads FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "threads_insert_own"
  ON public.threads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "threads_update_own"
  ON public.threads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "threads_delete_own"
  ON public.threads FOR DELETE
  USING (user_id = auth.uid());


-- =============================================================================
-- BLOCO 4: MESSAGES
-- Admin precisa de SELECT agregado (getGlobalDashboardStats em
-- src/services/supabaseService.ts faz supabase.from('messages').select(...)
-- sem filtro de user_id quando isAdmin === true).
-- =============================================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;

CREATE POLICY "messages_select_own_or_admin"
  ON public.messages FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "messages_insert_own"
  ON public.messages FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "messages_delete_own"
  ON public.messages FOR DELETE
  USING (user_id = auth.uid());


-- =============================================================================
-- BLOCO 5: CONTACTS
-- Admin precisa de SELECT agregado (getGlobalDashboardStats faz o mesmo
-- para contacts).
-- =============================================================================
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update_own" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete_own" ON public.contacts;

CREATE POLICY "contacts_select_own_or_admin"
  ON public.contacts FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "contacts_insert_own"
  ON public.contacts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "contacts_update_own"
  ON public.contacts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "contacts_delete_own"
  ON public.contacts FOR DELETE
  USING (user_id = auth.uid());


-- =============================================================================
-- BLOCO 6: CHANNELS
-- Admin precisa de SELECT agregado (listChannels em supabaseService.ts
-- consulta todos os canais quando isAdmin === true).
-- =============================================================================
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channels_select_own" ON public.channels;
DROP POLICY IF EXISTS "channels_insert_own" ON public.channels;
DROP POLICY IF EXISTS "channels_update_own" ON public.channels;
DROP POLICY IF EXISTS "channels_delete_own" ON public.channels;

CREATE POLICY "channels_select_own_or_admin"
  ON public.channels FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "channels_insert_own"
  ON public.channels FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "channels_update_own"
  ON public.channels FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "channels_delete_own"
  ON public.channels FOR DELETE
  USING (user_id = auth.uid());
