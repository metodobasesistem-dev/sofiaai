-- Coluna usada pelo UI para calcular janela de 24h da Meta Cloud API.
-- Apos 24h sem mensagem do cliente, mensagens livres sao rejeitadas pelo Meta
-- (codigo 131047) e somente templates aprovados podem ser enviados.

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

-- Backfill: usa o created_at da mensagem inbound mais recente de cada thread.
UPDATE public.threads t
SET last_inbound_at = sub.last_in
FROM (
  SELECT thread_id, MAX(created_at) AS last_in
  FROM public.messages
  WHERE direction = 'inbound'
  GROUP BY thread_id
) sub
WHERE t.id = sub.thread_id
  AND t.last_inbound_at IS NULL;

CREATE INDEX IF NOT EXISTS threads_last_inbound_at_idx
  ON public.threads (last_inbound_at DESC)
  WHERE last_inbound_at IS NOT NULL;
