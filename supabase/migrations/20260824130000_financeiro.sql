-- Cria as tabelas do Financeiro.
--
-- CONTEXTO: a tela Finance.tsx sempre leu financial_transactions e
-- financial_categories, mas nenhuma migration as criou. O fetch falhava, o
-- erro era engolido num console.error e a tela mostrava "Nenhum resultado"
-- como se estivesse apenas vazia — qualquer lançamento dava erro.
--
-- RLS COM POLICIES (diferente de client_profiles/push_subscriptions): esta
-- tela conversa direto com o Supabase pela anon key, como agents e contacts.
-- Então cada linha é visível apenas para o dono, via auth.uid().

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Categorias
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'receita' CHECK (tipo IN ('receita', 'despesa')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, nome, tipo)
);

CREATE INDEX IF NOT EXISTS financial_categories_user_idx
  ON public.financial_categories (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Lançamentos
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  descricao        TEXT NOT NULL,
  valor            NUMERIC(12,2) NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  status           TEXT NOT NULL DEFAULT 'pago'
                     CHECK (status IN ('pago', 'pendente', 'cancelado')),
  data_pagamento   DATE NOT NULL DEFAULT CURRENT_DATE,

  categoria_id     UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  -- Liga o lançamento ao cliente: é o que faz a mensalidade aparecer com nome
  -- na lista e permite ver o histórico financeiro dentro da ficha.
  contact_id       TEXT REFERENCES public.contacts(id) ON DELETE SET NULL,

  observacoes      TEXT,
  metodo_pagamento TEXT,

  -- 'manual' (lançado na tela) ou 'mensalidade' (gerado a partir da ficha do
  -- cliente). Separar a origem permite regerar o mês sem tocar no que foi
  -- lançado à mão.
  origem           TEXT NOT NULL DEFAULT 'manual'
                     CHECK (origem IN ('manual', 'mensalidade')),
  -- Mês de referência da cobrança, sempre no dia 1. É o que torna a geração
  -- idempotente: clicar duas vezes em "gerar mensalidades" não duplica.
  competencia      DATE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_transactions_user_data_idx
  ON public.financial_transactions (user_id, data_pagamento DESC);

CREATE INDEX IF NOT EXISTS financial_transactions_contact_idx
  ON public.financial_transactions (contact_id)
  WHERE contact_id IS NOT NULL;

-- Uma mensalidade por cliente por mês. Índice parcial para não atrapalhar
-- lançamentos manuais, que podem se repetir à vontade.
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_mensalidade_unica
  ON public.financial_transactions (contact_id, competencia)
  WHERE origem = 'mensalidade' AND contact_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS — dono do dado
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.financial_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_categories_owner ON public.financial_categories;
CREATE POLICY financial_categories_owner ON public.financial_categories
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS financial_transactions_owner ON public.financial_transactions;
CREATE POLICY financial_transactions_owner ON public.financial_transactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Sem login não se lê nada (o alerta do Supabase que nos custou a
-- n8n_chat_histories começou exatamente assim).
REVOKE ALL ON public.financial_categories   FROM anon;
REVOKE ALL ON public.financial_transactions FROM anon;
