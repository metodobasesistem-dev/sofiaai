-- Adiciona todas as colunas de configuração por tenant que estavam ausentes
-- da tabela profiles em produção. Estas colunas são usadas pela página
-- Configurações → Conta e Configuração IA.
--
-- Todas as operações são idempotentes (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.profiles
  -- Identificação da organização
  ADD COLUMN IF NOT EXISTS nome_completo          TEXT,
  ADD COLUMN IF NOT EXISTS nome_empresa           TEXT,
  ADD COLUMN IF NOT EXISTS company_name           TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_organizacao   TEXT,
  ADD COLUMN IF NOT EXISTS descricao_empresa      TEXT,
  ADD COLUMN IF NOT EXISTS produtos_servicos      TEXT,
  ADD COLUMN IF NOT EXISTS faq                    TEXT,
  ADD COLUMN IF NOT EXISTS links_importantes      TEXT,
  ADD COLUMN IF NOT EXISTS nicho                  TEXT,

  -- Contato e notificações
  ADD COLUMN IF NOT EXISTS notification_phone     TEXT,

  -- Plano / assinatura
  ADD COLUMN IF NOT EXISTS plano                  TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ends_at   TIMESTAMPTZ,

  -- IA por tenant (sobrescreve global_settings para este usuário)
  ADD COLUMN IF NOT EXISTS llm_provider           TEXT,
  ADD COLUMN IF NOT EXISTS openai_api_key         TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key         TEXT,
  ADD COLUMN IF NOT EXISTS default_ai_model       TEXT,

  -- Google Calendar
  ADD COLUMN IF NOT EXISTS google_calendar_active  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_calendar_email   TEXT,
  ADD COLUMN IF NOT EXISTS selected_calendar_id    TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token    TEXT;

COMMENT ON COLUMN public.profiles.nome_completo        IS 'Nome completo do usuário (Configurações → Conta).';
COMMENT ON COLUMN public.profiles.nome_empresa         IS 'Nome da organização/empresa do tenant.';
COMMENT ON COLUMN public.profiles.whatsapp_organizacao IS 'Número WhatsApp principal da organização.';
COMMENT ON COLUMN public.profiles.descricao_empresa    IS 'Descrição da empresa — usada no contexto do agente de IA.';
COMMENT ON COLUMN public.profiles.produtos_servicos    IS 'Produtos e serviços — usados no contexto do agente de IA.';
COMMENT ON COLUMN public.profiles.faq                  IS 'FAQ da empresa — usado no contexto do agente de IA.';
COMMENT ON COLUMN public.profiles.links_importantes    IS 'Links importantes (site, agendamento, etc.).';
COMMENT ON COLUMN public.profiles.llm_provider         IS 'Provedor de IA preferido do tenant (openai | gemini). NULL = usa global_settings.';
COMMENT ON COLUMN public.profiles.default_ai_model     IS 'Modelo de IA preferido do tenant. NULL = usa global_settings.';
