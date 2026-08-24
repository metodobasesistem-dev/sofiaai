-- Motivos de perda: por que o lead não avançou.
--
-- Marcar "Perdido" sem registrar o porquê descarta a informação mais útil do
-- funil. Com os motivos cadastrados antes, marcar vira um clique — e o
-- histórico permite ver o que mais faz lead escapar.
--
-- Os motivos são de cada inquilino: preço, prazo, escolheu concorrente e sem
-- retorno não são a mesma lista para todo ramo.

CREATE TABLE IF NOT EXISTS public.loss_reasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, nome)
);

CREATE INDEX IF NOT EXISTS loss_reasons_user_idx
  ON public.loss_reasons (user_id, ordem);

-- O registro da perda fica no próprio contato: é dele que o funil e os
-- relatórios leem.
--
-- ON DELETE SET NULL: apagar um motivo da lista não pode apagar o histórico
-- de quem foi perdido por ele — a data e a observação continuam lá.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS loss_reason_id UUID REFERENCES public.loss_reasons(id) ON DELETE SET NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS loss_note TEXT;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contacts_loss_reason_idx
  ON public.contacts (loss_reason_id)
  WHERE loss_reason_id IS NOT NULL;

-- Mesmo padrão das demais tabelas novas: só a service_role acessa; o frontend
-- fala com /api/v2/funnel.
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loss_reasons FROM anon, authenticated;
