-- PART 3: CONSTRAINTS, INDEXES, DATA BACKFILLS & COMMENTS
-- Execute this block third in the Supabase SQL Editor.

-- 1. Unique Constraints
ALTER TABLE public.leo_leads DROP CONSTRAINT IF EXISTS unique_company_insta_uid;
ALTER TABLE public.leo_leads ADD CONSTRAINT unique_company_insta_uid UNIQUE (company_id, instagram_uid);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_whatsapp_id_user_id_key;
ALTER TABLE public.messages ADD CONSTRAINT messages_whatsapp_id_user_id_key UNIQUE (whatsapp_id, user_id);

-- 2. Database Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON public.campaign_logs(campaign_id);

CREATE INDEX IF NOT EXISTS idx_sofia_memory_tenant ON public.sofia_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sofia_messages_tenant ON public.sofia_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sofia_messages_user ON public.sofia_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sofia_memory_embedding ON public.sofia_memory USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_messages_is_starred ON public.messages(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON public.messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id_user ON public.messages (whatsapp_id, user_id) WHERE whatsapp_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_user_last_msg ON public.threads (user_id, last_message_time DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_telefone_pattern ON public.contacts (user_id, telefone text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_messages_status_user ON public.messages (user_id, status) WHERE status IN ('sending', 'pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_threads_ticket_status ON public.threads (user_id, ticket_status);
CREATE INDEX IF NOT EXISTS idx_threads_photo_update ON public.threads (user_id, profile_picture_updated_at) WHERE profile_picture_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leo_insta_gatilhos_post_id ON public.leo_insta_gatilhos(post_id);
CREATE UNIQUE INDEX IF NOT EXISTS leo_insta_interacoes_message_id_unique ON public.leo_instagram_interacoes (instagram_message_id) WHERE instagram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_audit_log_target_idx ON public.provider_audit_log (target_user_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS provider_audit_log_action_idx ON public.provider_audit_log (action, performed_at DESC);

CREATE INDEX IF NOT EXISTS template_send_log_user_idx ON public.template_send_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS template_send_log_template_idx ON public.template_send_log (template_name, created_at DESC);
CREATE INDEX IF NOT EXISTS template_send_log_hash_idx ON public.template_send_log (variables_hash);

CREATE INDEX IF NOT EXISTS template_status_cache_status_idx ON public.template_status_cache (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tqh_user_template ON public.template_quality_history (user_id, template_name, language_code, recorded_at DESC);

CREATE INDEX IF NOT EXISTS ai_interaction_logs_user_time_idx ON public.ai_interaction_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_interaction_logs_thread_idx ON public.ai_interaction_logs (thread_id, created_at DESC);

-- 3. Feature Flags Setup
INSERT INTO public.feature_flags (key, label, description, enabled)
VALUES 
  ('leo_ai', 'Automação Leo', 'Sistema de automação para Instagram e captura de leads via IA.', false),
  ('agendas', 'Gestão de Agendas', 'Módulo completo de agendamentos, calendários e disponibilidade.', false),
  ('crm', 'Módulo CRM', 'Gestão de contatos, equipe e funil de vendas.', true),
  ('chat', 'Caixa de Entrada', 'Chat em tempo real e gestão de conversas via WhatsApp.', true),
  ('analytics', 'Relatórios & Analytics', 'Dashboards detalhados de performance e métricas do sistema.', true),
  ('meta_official', 'API Oficial (Meta)', 'Habilita a conexão com o provedor WhatsApp Cloud API Oficial no painel de integrações do cliente.', false),
  ('campaigns', 'Campanhas', 'Habilita o módulo de disparos em massa via templates oficiais da Meta.', false),
  ('whatsapp_provider_abstraction', 'Abstração de Provedor WhatsApp', 'Habilita o WhatsAppProviderFactory a resolver o provedor por tenant (profiles.whatsapp_provider). Sem isso, todos os clientes usam Evolution por padrão.', true)
ON CONFLICT (key) DO UPDATE 
SET enabled = EXCLUDED.enabled;

-- 4. Comments for Documentation
COMMENT ON COLUMN public.contacts.profile_picture_url IS 'URL temporaria da foto de perfil do WhatsApp';
COMMENT ON COLUMN public.contacts.profile_picture_updated_at IS 'Data da ultima busca da foto na Evolution API';
COMMENT ON COLUMN public.threads.profile_picture_url IS 'URL temporaria da foto de perfil da thread';
COMMENT ON COLUMN public.threads.profile_picture_updated_at IS 'Data da ultima busca da foto na Evolution API';
COMMENT ON COLUMN public.threads.pending_followup IS 'Stores { message, scheduled_at, type, metadata } for manual human-initiated follow-ups.';
COMMENT ON COLUMN public.contacts.ad_tracking IS 'Stores information about lead origin like campaign_id, ad_id, source, and medium.';
COMMENT ON COLUMN public.message_templates.body IS 'O corpo da mensagem para uso com Evolution API e Uazapi. Variaveis sao mapeadas dinamicamente.';
COMMENT ON COLUMN public.profiles.sofia_prompt IS 'System prompt personalizado para a assistente Sofia';
COMMENT ON COLUMN public.profiles.sofia_active IS 'Habilita ou desabilita o chat da Sofia para o usuario';
COMMENT ON COLUMN public.agents.ecommerce_api_url IS 'URL base para consulta de produtos/catalogo do cliente.';
COMMENT ON COLUMN public.agents.ecommerce_api_type IS 'Plataforma de e-commerce utilizada pelo cliente.';
COMMENT ON COLUMN public.agents.ecommerce_api_use_nlp IS 'Se verdadeiro, tenta utilizar o endpoint /busca-ia se disponivel.';
COMMENT ON COLUMN public.agents.tone_of_voice IS 'Tom de voz do agente: formal | casual | tecnico | amigavel | consultivo. NULL = neutro.';
COMMENT ON COLUMN public.agents.forbidden_topics IS 'Assuntos que o agente NUNCA deve responder (um por linha). Ex: "Politica", "Diagnostico medico".';
COMMENT ON COLUMN public.agents.conversation_examples IS 'Exemplos de dialogos (few-shot) que calibram o tom desejado. Formato livre.';
COMMENT ON TABLE public.ai_interaction_logs IS 'Audit trail for every AI agent processIncoming() call. Used for cost tracking and performance observability.';

-- 5. Data Migrations & Backfills
DO $$
BEGIN
  -- Default existing profiles to use their own ID as tenant_id if tenant_id is NULL
  UPDATE public.profiles SET tenant_id = id WHERE tenant_id IS NULL;
  
  -- Migrate contacts status_funil 'Cliente' to is_client = true and status_funil = 'Lead'
  UPDATE public.contacts SET is_client = true, status_funil = 'Lead' WHERE status_funil = 'Cliente';
  
  -- Ensure contacts funnel status is valid
  UPDATE public.contacts SET status_funil = 'Lead' WHERE status_funil NOT IN ('Lead', 'Qualificado', 'Resolvido');

  -- Backfill whatsapp provider
  UPDATE public.profiles SET whatsapp_provider = 'evolution' WHERE whatsapp_provider IS NULL;
END $$;
