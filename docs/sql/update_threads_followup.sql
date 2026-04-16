-- Migração para suporte a múltiplos níveis de follow-up dinâmico
ALTER TABLE public.threads 
ADD COLUMN IF NOT EXISTS follow_up_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN DEFAULT FALSE; -- Garantir que existe

-- Adicionar índice para performance do Job de Segundo Plano
CREATE INDEX IF NOT EXISTS idx_threads_followup ON public.threads (status, follow_up_level, updated_at);
