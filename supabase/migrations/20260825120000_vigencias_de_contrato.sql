-- Vigências de valor do contrato.
--
-- PROBLEMA: client_profiles.mensalidade guarda um valor único, e o LTV é
-- calculado como "mensalidade × meses". Reajustar o cliente REESCREVE O
-- PASSADO: subir de 600 para 1.100 faz os meses já vividos passarem a valer
-- 1.100 cada, inflando o histórico inteiro.
--
-- SOLUÇÃO: cada faixa de preço vira uma linha com início e fim. O LTV soma
-- por faixa, então o passado fica congelado no valor que valia à época e o
-- reajuste só conta daqui para a frente. Reajuste com data futura também
-- passa a ser possível: basta um período que começa depois.

CREATE TABLE IF NOT EXISTS public.client_contract_periods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  valor      NUMERIC(12,2) NOT NULL,
  moeda      TEXT NOT NULL DEFAULT 'BRL',
  ciclo      TEXT NOT NULL DEFAULT 'mensal'
               CHECK (ciclo IN ('mensal', 'anual', 'unico')),

  inicio     DATE NOT NULL,
  -- NULL = vigente. Ao reajustar, o período anterior é fechado no dia
  -- anterior ao início do novo.
  fim        DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT client_contract_periods_intervalo CHECK (fim IS NULL OR fim >= inicio)
);

CREATE INDEX IF NOT EXISTS client_contract_periods_contato_idx
  ON public.client_contract_periods (contact_id, inicio);

CREATE INDEX IF NOT EXISTS client_contract_periods_user_idx
  ON public.client_contract_periods (user_id);

-- Um contato não pode ter dois períodos abertos ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS client_contract_periods_um_vigente
  ON public.client_contract_periods (contact_id)
  WHERE fim IS NULL;

ALTER TABLE public.client_contract_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_contract_periods FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Migração: cada ficha com valor vira o primeiro período, começando na data
-- de entrada do cliente. Nenhum número muda no dia em que isto rodar — o LTV
-- calculado por vigências dá exatamente o mesmo resultado do cálculo antigo.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.client_contract_periods (contact_id, user_id, valor, moeda, ciclo, inicio)
SELECT
  p.contact_id,
  p.user_id,
  p.mensalidade,
  COALESCE(p.moeda, 'BRL'),
  COALESCE(p.ciclo, 'mensal'),
  COALESCE(p.cliente_desde, p.created_at::date)
FROM public.client_profiles p
WHERE p.mensalidade IS NOT NULL
  AND p.mensalidade > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.client_contract_periods v WHERE v.contact_id = p.contact_id
  );

COMMENT ON TABLE public.client_contract_periods IS
  'Histórico de valores do contrato. O LTV soma por faixa de vigência, para '
  'que reajuste não reescreva o passado. client_profiles.mensalidade segue '
  'como o valor vigente, mantido em sincronia pela API.';
