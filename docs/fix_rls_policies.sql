-- =============================================================================
-- WPPAI - RLS Policies & Table Fixes
-- Execute este SQL no Supabase Dashboard > SQL Editor
-- =============================================================================

-- ============================================================
-- 1. AGENTS TABLE — RLS permissiva para o dono dos registros
-- ============================================================

-- Habilitar RLS (caso não esteja)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas (se existirem)
DROP POLICY IF EXISTS "agents_select_own" ON agents;
DROP POLICY IF EXISTS "agents_insert_own" ON agents;
DROP POLICY IF EXISTS "agents_update_own" ON agents;
DROP POLICY IF EXISTS "agents_delete_own" ON agents;

-- SELECT: usuário vê apenas seus próprios agentes
CREATE POLICY "agents_select_own"
  ON agents FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: usuário só insere com seu próprio user_id
CREATE POLICY "agents_insert_own"
  ON agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: usuário só atualiza seus próprios agentes
CREATE POLICY "agents_update_own"
  ON agents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: usuário só deleta seus próprios agentes
CREATE POLICY "agents_delete_own"
  ON agents FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================
-- 2. PROFILES TABLE — RLS
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ============================================================
-- 3. Verificar se a coluna updated_at existe na tabela agents
-- (necessária para updateAgent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE agents ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;


-- ============================================================
-- 4. Verificar se whatsapp_status aceita 'connecting'
-- ============================================================
DO $$
BEGIN
  -- Se a coluna for enum, adicionar 'connecting' se necessário
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'whatsapp_status'
      AND data_type = 'USER-DEFINED'
  ) THEN
    -- Tentar adicionar 'connecting' ao enum (ignora se já existe)
    BEGIN
      ALTER TYPE whatsapp_status_enum ADD VALUE IF NOT EXISTS 'connecting';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;


-- ============================================================
-- 5. DIAGNÓSTICO — Execute para ver seus agentes e user_id
-- ============================================================
-- SELECT id, user_id, nome, created_at FROM agents ORDER BY created_at DESC LIMIT 20;
-- SELECT id, email, whatsapp_status FROM profiles;
