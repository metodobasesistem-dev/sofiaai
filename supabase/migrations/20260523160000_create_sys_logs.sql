-- Cria tabela sys_logs usada para telemetria de erros do frontend e backend.
-- Referenciada em:
--   src/services/supabaseService.ts (logSystemError) — escreve via JWT do usuário
--   src/backend/services/agentService.ts (logToDB)   — escreve via service_role

CREATE TABLE IF NOT EXISTS public.sys_logs (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  level       text          NOT NULL DEFAULT 'info',
  module      text          NOT NULL,
  message     text          NOT NULL,
  metadata    jsonb         NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sys_logs_user_created_idx ON public.sys_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sys_logs_module_idx       ON public.sys_logs (module);
CREATE INDEX IF NOT EXISTS sys_logs_level_idx        ON public.sys_logs (level);

ALTER TABLE public.sys_logs ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados só conseguem INSERIR logs em seu próprio nome
-- (e em nome de ninguém, no caso de erros pré-login)
DROP POLICY IF EXISTS "sys_logs_insert_own_or_anon" ON public.sys_logs;
CREATE POLICY "sys_logs_insert_own_or_anon" ON public.sys_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Usuários só conseguem ler seus próprios logs
DROP POLICY IF EXISTS "sys_logs_select_own" ON public.sys_logs;
CREATE POLICY "sys_logs_select_own" ON public.sys_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
