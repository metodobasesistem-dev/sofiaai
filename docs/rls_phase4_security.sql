-- =============================================================================
-- WPPAI — Fase 4: Row Level Security (RLS) Completa
-- 
-- SEGURANÇA: O backend usa service_role_key que BYPASSA o RLS.
-- Apenas acessos diretos via anon_key são afetados.
-- Pode ser executado com segurança em produção.
--
-- Execute no Supabase Dashboard > SQL Editor
-- Execute bloco por bloco se preferir mais controle.
-- =============================================================================


-- =============================================================================
-- BLOCO 1: PROFILES
-- Cada usuário só vê e edita o próprio perfil.
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- =============================================================================
-- BLOCO 2: AGENTS
-- Cada usuário só vê e edita seus próprios agentes de IA.
-- =============================================================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select_own" ON agents;
DROP POLICY IF EXISTS "agents_insert_own" ON agents;
DROP POLICY IF EXISTS "agents_update_own" ON agents;
DROP POLICY IF EXISTS "agents_delete_own" ON agents;

CREATE POLICY "agents_select_own"
  ON agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "agents_insert_own"
  ON agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "agents_update_own"
  ON agents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "agents_delete_own"
  ON agents FOR DELETE
  USING (auth.uid() = user_id);


-- =============================================================================
-- BLOCO 3: THREADS (Conversas)
-- Cada usuário só vê suas próprias conversas.
-- =============================================================================
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "threads_select_own" ON threads;
DROP POLICY IF EXISTS "threads_insert_own" ON threads;
DROP POLICY IF EXISTS "threads_update_own" ON threads;
DROP POLICY IF EXISTS "threads_delete_own" ON threads;

CREATE POLICY "threads_select_own"
  ON threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "threads_insert_own"
  ON threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "threads_update_own"
  ON threads FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "threads_delete_own"
  ON threads FOR DELETE
  USING (auth.uid() = user_id);


-- =============================================================================
-- BLOCO 4: MESSAGES (Mensagens)
-- Cada usuário só vê suas próprias mensagens.
-- =============================================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON messages;
DROP POLICY IF EXISTS "messages_insert_own" ON messages;
DROP POLICY IF EXISTS "messages_update_own" ON messages;
DROP POLICY IF EXISTS "messages_delete_own" ON messages;

CREATE POLICY "messages_select_own"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "messages_insert_own"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "messages_update_own"
  ON messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "messages_delete_own"
  ON messages FOR DELETE
  USING (auth.uid() = user_id);


-- =============================================================================
-- BLOCO 5: CONTACTS
-- =============================================================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_own" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_own" ON contacts;
DROP POLICY IF EXISTS "contacts_update_own" ON contacts;
DROP POLICY IF EXISTS "contacts_delete_own" ON contacts;

CREATE POLICY "contacts_select_own"
  ON contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "contacts_insert_own"
  ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_update_own"
  ON contacts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_delete_own"
  ON contacts FOR DELETE
  USING (auth.uid() = user_id);


-- BLOCO 6: WHATSAPP_SESSIONS — IGNORADO (tabela não existe neste projeto)


-- =============================================================================
-- DIAGNÓSTICO — Execute após o script para confirmar que ficou correto.
-- Deve retornar todas as tabelas com RLS ativo.
-- =============================================================================
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN (
  'profiles', 'agents', 'threads', 'messages',
  'contacts', 'whatsapp_sessions'
)
ORDER BY tablename;
