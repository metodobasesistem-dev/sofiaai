-- Separa "cliente" de "lead" no CRM do inquilino.
--
-- CONTEXTO: contacts guarda todo mundo que chega pelo WhatsApp ou é
-- cadastrado. Quem é promovido a cliente sai da lista de leads e ganha uma
-- ficha com os dados comerciais. A promoção é manual (botão), e a fonte de
-- verdade de "é cliente" é contacts.is_client — a mesma flag que o Inbox já
-- grava em "Marcar como cliente".
--
-- NÃO confundir com os inquilinos da plataforma (tabela profiles): aquilo é
-- quem contrata o sistema; isto é a carteira de cada inquilino.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Dados de contato — servem para lead também, por isso ficam em contacts.
--    O Radar de Leads já coleta email e instagram e hoje descarta na hora de
--    virar contato; com estas colunas o dado passa a ser aproveitado.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email     TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS website   TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Ficha do cliente — 1:1 com o contato, criada na promoção.
--
--    Fica fora de contacts porque só faz sentido para quem é cliente: seriam
--    colunas vazias em centenas de leads frios.
--
--    custom_fields existe porque o produto é um CRM genérico — dentista quer
--    convênio, agência quer contrato, advogado quer processo. Sem ele, cada
--    segmento novo viraria uma migration.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      TEXT NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Comercial: o que o INQUILINO cobra do cliente dele (não é o plano da plataforma)
  mensalidade     NUMERIC(12,2),
  moeda           TEXT NOT NULL DEFAULT 'BRL',
  ciclo           TEXT NOT NULL DEFAULT 'mensal'
                    CHECK (ciclo IN ('mensal', 'anual', 'unico')),

  cliente_desde   DATE NOT NULL DEFAULT CURRENT_DATE,
  status_contrato TEXT NOT NULL DEFAULT 'ativo'
                    CHECK (status_contrato IN ('ativo', 'pausado', 'cancelado')),

  observacoes     TEXT,
  custom_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_profiles_user_id_idx
  ON public.client_profiles (user_id);

-- Receita recorrente por inquilino (card da tela de Clientes)
CREATE INDEX IF NOT EXISTS client_profiles_user_status_idx
  ON public.client_profiles (user_id, status_contrato);

-- SEGURANÇA: RLS ligado e sem policies — só a service_role (backend) acessa,
-- o frontend fala com /api/v2/clients. Mesmo cuidado de push_subscriptions.
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_profiles FROM anon, authenticated;
