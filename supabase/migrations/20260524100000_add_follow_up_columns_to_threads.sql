-- Colunas usadas pelo notificationService.checkFollowUps (job recorrente 15min).
-- Sem essas colunas o UPDATE de tracking falha silenciosamente e o cron reenvia
-- follow-up em loop infinito, mesmo com 1 unico nivel configurado.

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS follow_up_level   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_sent    BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_threads_followup
  ON public.threads (status, follow_up_level, updated_at);
