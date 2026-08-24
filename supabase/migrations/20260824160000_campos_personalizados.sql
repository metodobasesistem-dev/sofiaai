-- Campos personalizados da ficha do cliente, definidos por cada inquilino.
--
-- CONTEXTO: o produto é um CRM genérico. Um gestor de tráfego precisa saber em
-- quais plataformas o cliente anuncia; um contador precisa do regime
-- tributário; um personal precisa do objetivo do aluno. Nada disso faz sentido
-- para os outros, e cada um viraria uma migration nova.
--
-- A ficha já guarda os VALORES em client_profiles.custom_fields (JSONB). Esta
-- tabela guarda a DEFINIÇÃO dos campos: o que existe, como se chama, de que
-- tipo é e em que ordem aparece.

CREATE TABLE IF NOT EXISTS public.client_field_definitions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Chave usada dentro do JSONB. Fixa: renomear o rótulo não pode perder os
  -- valores já preenchidos nas fichas.
  chave      TEXT NOT NULL,
  label      TEXT NOT NULL,

  tipo       TEXT NOT NULL DEFAULT 'texto'
               CHECK (tipo IN ('texto', 'numero', 'data', 'selecao', 'multi_selecao', 'booleano')),

  -- Opções de 'selecao' e 'multi_selecao'. Ex.: ["Meta", "Google"]
  opcoes     JSONB NOT NULL DEFAULT '[]'::jsonb,

  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, chave)
);

CREATE INDEX IF NOT EXISTS client_field_definitions_user_idx
  ON public.client_field_definitions (user_id, ordem);

-- Mesmo padrão de client_profiles: só a service_role acessa; o frontend fala
-- com /api/v2/clients/campos.
ALTER TABLE public.client_field_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_field_definitions FROM anon, authenticated;
