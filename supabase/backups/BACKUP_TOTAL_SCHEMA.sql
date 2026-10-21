--- BACKUP TOTAL DO SCHEMA WPP AI ---
--- Gerado em: 05/15/2026 10:26:55 ---

-- Supabase Schema for WhatsApp AI Migration

-- 1. Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  name TEXT,
  photo_url TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  whatsapp_status TEXT DEFAULT 'disconnected' CHECK (whatsapp_status IN ('connected', 'disconnected', 'connecting')),
  whatsapp_instance_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  whatsapp_provider TEXT DEFAULT 'evolution',
  meta_access_token TEXT,
  meta_phone_id TEXT,
  meta_waba_id TEXT,
  sofia_prompt TEXT,
  sofia_active BOOLEAN DEFAULT TRUE,
  tenant_id UUID,
  predefined_labels TEXT[] DEFAULT '{}',
  meta_last_error TEXT,
  meta_last_error_at TIMESTAMPTZ,
  meta_app_secret TEXT
);

-- 2. Agents
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  nicho TEXT,
  prompt_base TEXT,
  status_ativo BOOLEAN DEFAULT TRUE,
  company_name TEXT,
  company_description TEXT,
  knowledge_base JSONB DEFAULT '[]'::jsonb,
  follow_ups JSONB DEFAULT '[]'::jsonb,
  reminders JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ecommerce_api_url TEXT DEFAULT NULL,
  ecommerce_api_type TEXT DEFAULT 'custom',
  ecommerce_api_use_nlp BOOLEAN DEFAULT FALSE,
  tone_of_voice TEXT CHECK (tone_of_voice IN ('formal', 'casual', 'tecnico', 'amigavel', 'consultivo')),
  forbidden_topics TEXT,
  conversation_examples TEXT
);

-- 3. Contacts (CRM Leads)
CREATE TABLE IF NOT EXISTS public.contacts (
  id TEXT PRIMARY KEY, -- Using compound key like {userId}_{phone} if needed or just UUID
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status_funil TEXT DEFAULT 'Lead' CHECK (status_funil IN ('Lead', 'Qualificado', 'Resolvido')),
  ultima_mensagem TEXT,
  total_mensagens INTEGER DEFAULT 1,
  ultima_interacao TIMESTAMPTZ DEFAULT NOW(),
  primeiro_contato TIMESTAMPTZ DEFAULT NOW(),
  data_criacao TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'whatsapp',
  is_client BOOLEAN DEFAULT false,
  profile_picture_url TEXT,
  profile_picture_updated_at TIMESTAMPTZ,
  ad_tracking JSONB DEFAULT NULL
);

-- 4. Threads (WhatsApp Conversations)
CREATE TABLE IF NOT EXISTS public.threads (
  id TEXT PRIMARY KEY, -- {userId}_{phone}
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  remote_jid TEXT NOT NULL,
  contact_name TEXT,
  last_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,
  lead_name TEXT,
  status TEXT DEFAULT 'ia' CHECK (status IN ('ia', 'human')),
  profile_picture_url TEXT,
  profile_picture_updated_at TIMESTAMPTZ,
  pending_followup JSONB DEFAULT NULL,
  last_message_time TIMESTAMPTZ,
  display_phone TEXT,
  agent_name TEXT,
  ticket_status TEXT DEFAULT 'open'
);

-- 5. Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  thread_id TEXT REFERENCES public.threads(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  timestamp BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  whatsapp_id TEXT,
  status TEXT DEFAULT 'sent',
  audio_url TEXT,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  caption TEXT,
  is_external BOOLEAN DEFAULT false,
  quoted_id TEXT,
  quoted_text TEXT,
  contact_jid TEXT,
  is_ai BOOLEAN DEFAULT false,
  tokens_prompt INTEGER DEFAULT 0,
  tokens_completion INTEGER DEFAULT 0,
  cost_brl NUMERIC DEFAULT 0,
  reaction TEXT,
  is_starred BOOLEAN DEFAULT false
);

-- 6. Availability (Agenda Configuration)
CREATE TABLE IF NOT EXISTS public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES public.contacts(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  time TEXT NOT NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  client_name TEXT,
  client_phone TEXT,
  summary TEXT
);

-- 8. Channels
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  tipo TEXT CHECK (tipo IN ('whatsapp', 'chat', 'telegram')),
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8.1. Global Settings
CREATE TABLE IF NOT EXISTS public.global_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  llm_provider TEXT DEFAULT 'openai',
  default_ai_model TEXT DEFAULT 'gpt-4o',
  openai_api_key TEXT,
  gemini_api_key TEXT,
  usd_brl_rate DECIMAL(10,2) DEFAULT 5.30,
  maintenance_mode BOOLEAN DEFAULT false,
  allow_signups BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.global_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000000'::uuid) 
ON CONFLICT (id) DO NOTHING;

-- 8.2. Feature Flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 8.3. Leo Config
CREATE TABLE IF NOT EXISTS public.leo_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  mensagem_inicial TEXT,
  perguntas_qualificacao JSONB,
  score_minimo INTEGER DEFAULT 70,
  timeout_inatividade INTEGER DEFAULT 24,
  instagram_access_token TEXT,
  instagram_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8.4. Leo Leads
CREATE TABLE IF NOT EXISTS public.leo_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome TEXT,
  telefone TEXT,
  instagram_uid TEXT,
  origem TEXT,
  plataforma TEXT,
  status TEXT DEFAULT 'novo',
  score INTEGER DEFAULT 0,
  interesse TEXT,
  orcamento TEXT,
  interacoes_instagram INTEGER DEFAULT 0,
  contexto_conversa JSONB,
  passado_sofia_em TIMESTAMPTZ,
  feedback_sofia TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8.5. Leo Campanhas
CREATE TABLE IF NOT EXISTS public.leo_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  meta_campaign_id TEXT,
  nome TEXT,
  status TEXT,
  orcamento NUMERIC,
  gasto NUMERIC,
  leads_gerados INTEGER DEFAULT 0,
  custo_por_lead NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8.6. Leo Instagram Interacoes
CREATE TABLE IF NOT EXISTS public.leo_instagram_interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leo_leads(id) ON DELETE CASCADE,
  tipo TEXT,
  conteudo TEXT,
  instagram_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Row Level Security (RLS)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_instagram_interacoes ENABLE ROW LEVEL SECURITY;

-- Policies (Allow users to see only their own data)
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage their own agents" ON public.agents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own contacts" ON public.contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own threads" ON public.threads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own messages" ON public.messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own availability" ON public.availability FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own appointments" ON public.appointments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own channels" ON public.channels FOR ALL USING (auth.uid() = user_id);

-- Global Settings Policy
CREATE POLICY "Admins can manage global settings" ON public.global_settings FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Feature Flags Policies
CREATE POLICY "Enable read access for all users" ON public.feature_flags FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for admins only" ON public.feature_flags FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Leo Module Policies
CREATE POLICY "Enable access for own company leads" ON public.leo_leads FOR ALL USING (auth.uid() = company_id);
CREATE POLICY "Enable access for own company campaigns" ON public.leo_campanhas FOR ALL USING (auth.uid() = company_id);
CREATE POLICY "Enable access for own company config" ON public.leo_config FOR ALL USING (auth.uid() = company_id);
CREATE POLICY "Enable access for own company instagram interactions" ON public.leo_instagram_interacoes FOR ALL USING (auth.uid() IN (SELECT company_id FROM public.leo_leads WHERE id = public.leo_instagram_interacoes.lead_id));

-- Enable Realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
--- MIGRATION: 20260503145000_leo_instagram_fields.sql ---
ALTER TABLE leo_config
ADD COLUMN IF NOT EXISTS instagram_username TEXT,
ADD COLUMN IF NOT EXISTS instagram_name TEXT,
ADD COLUMN IF NOT EXISTS instagram_picture_url TEXT,
ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS instagram_state_token TEXT;

--- MIGRATION: 20260503181000_leo_automation_settings.sql ---
ALTER TABLE leo_config
ADD COLUMN IF NOT EXISTS insta_auto_follow_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS insta_auto_follow_msg TEXT DEFAULT 'OlÃ¡! Obrigado por me seguir. Como posso te ajudar hoje?',
ADD COLUMN IF NOT EXISTS insta_auto_comment_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS insta_auto_comment_msg TEXT DEFAULT 'Obrigado pelo seu comentÃ¡rio! Te enviei uma mensagem no privado para conversarmos melhor.';

--- MIGRATION: 20260503182000_leo_instagram_triggers.sql ---
CREATE TABLE IF NOT EXISTS leo_insta_gatilhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  palavra_chave TEXT NOT NULL,
  mensagem_dm TEXT NOT NULL,
  resposta_comentario TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE leo_insta_gatilhos ENABLE ROW LEVEL SECURITY;

-- PolÃ­tica de acesso
CREATE POLICY "Enable access for own company triggers" ON leo_insta_gatilhos
    FOR ALL USING (auth.uid() = company_id);

--- MIGRATION: 20260503183500_fix_leo_leads_upsert.sql ---
-- Adicionar restriÃ§Ã£o de unicidade para permitir o upsert correto dos leads
ALTER TABLE leo_leads 
ADD CONSTRAINT unique_company_insta_uid UNIQUE (company_id, instagram_uid);

--- MIGRATION: 20260504124000_add_media_columns_to_messages.sql ---
-- Add new columns to messages table for rich media and sync support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_filename TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false; -- To identify messages sent from phone

-- Update existing messages to have 'text' as type
UPDATE messages SET message_type = 'text' WHERE message_type IS NULL;

--- MIGRATION: 20260504131500_add_unread_count_to_threads.sql ---
-- Add unread_count column to threads table
ALTER TABLE threads ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

--- MIGRATION: 20260504155000_add_is_client_to_contacts.sql ---
-- Adiciona coluna is_client para separar a identidade de cliente do status do funil
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT false;

-- Migra os contatos que estavam com status_funil = 'Cliente' para is_client = true e status_funil = 'Lead'
UPDATE contacts SET is_client = true, status_funil = 'Lead' WHERE status_funil = 'Cliente';

--- MIGRATION: 20260504160000_update_funnel_constraints.sql ---
-- Atualiza as restriÃ§Ãµes da coluna status_funil para aceitar 'Resolvido' em vez de 'Cliente'
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_funil_check;

ALTER TABLE contacts ADD CONSTRAINT contacts_status_funil_check 
CHECK (status_funil IN ('Lead', 'Qualificado', 'Resolvido'));

-- Garante que nÃ£o existam valores Ã³rfÃ£os
UPDATE contacts SET status_funil = 'Lead' WHERE status_funil NOT IN ('Lead', 'Qualificado', 'Resolvido');

--- MIGRATION: 20260504163000_add_profile_picture_cache.sql ---
-- Adiciona colunas para cache de foto de perfil
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_updated_at TIMESTAMPTZ;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS profile_picture_updated_at TIMESTAMPTZ;

-- ComentÃ¡rios para documentaÃ§Ã£o
COMMENT ON COLUMN contacts.profile_picture_url IS 'URL temporÃ¡ria da foto de perfil do WhatsApp';
COMMENT ON COLUMN contacts.profile_picture_updated_at IS 'Data da Ãºltima busca da foto na Evolution API';
COMMENT ON COLUMN threads.profile_picture_url IS 'URL temporÃ¡ria da foto de perfil da thread';
COMMENT ON COLUMN threads.profile_picture_updated_at IS 'Data da Ãºltima busca da foto na Evolution API';

--- MIGRATION: 20260504180000_add_leo_and_agendas_flags.sql ---
-- Adicionar Feature Flags para Leo e Agendas
INSERT INTO feature_flags (key, label, description, enabled)
VALUES 
  ('leo_ai', 'AutomaÃ§Ã£o Leo', 'Sistema de automaÃ§Ã£o para Instagram e captura de leads via IA.', false),
  ('agendas', 'GestÃ£o de Agendas', 'MÃ³dulo completo de agendamentos, calendÃ¡rios e disponibilidade.', false)
ON CONFLICT (key) DO NOTHING;

--- MIGRATION: 20260504183000_add_unique_to_messages.sql ---
-- Adiciona constraint UNIQUE na tabela messages para evitar duplicatas por whatsapp_id + user_id
-- Isso resolve o problema de webhook echo e race conditions entre envio e confirmaÃ§Ã£o.

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_whatsapp_id_user_id_key;
ALTER TABLE messages ADD CONSTRAINT messages_whatsapp_id_user_id_key UNIQUE (whatsapp_id, user_id);

--- MIGRATION: 20260504184500_add_missing_feature_flags.sql ---
-- Adicionar Feature Flags faltantes para CRM, Chat e Analytics
INSERT INTO feature_flags (key, label, description, enabled)
VALUES 
  ('crm', 'MÃ³dulo CRM', 'GestÃ£o de contatos, equipe e funil de vendas.', true),
  ('chat', 'Caixa de Entrada', 'Chat em tempo real e gestÃ£o de conversas via WhatsApp.', true),
  ('analytics', 'RelatÃ³rios & Analytics', 'Dashboards detalhados de performance e mÃ©tricas do sistema.', true)
ON CONFLICT (key) DO UPDATE 
SET enabled = EXCLUDED.enabled;

--- MIGRATION: 20260505130000_add_reaction_to_messages.sql ---
-- Migration to add reaction support to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reaction TEXT;

--- MIGRATION: 20260505140000_add_meta_provider_fields.sql ---
-- Migration for Meta Official API fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'evolution',
ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
ADD COLUMN IF NOT EXISTS meta_phone_id TEXT,
ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;

--- MIGRATION: 20260505140500_insert_meta_feature_flag.sql ---
-- Insert the new feature flag for Meta Official API
INSERT INTO feature_flags (key, label, description, enabled)
VALUES (
  'meta_official',
  'API Oficial (Meta)',
  'Habilita a conexÃ£o com o provedor WhatsApp Cloud API Oficial no painel de integraÃ§Ãµes do cliente.',
  false
)
ON CONFLICT (key) DO NOTHING;

--- MIGRATION: 20260505141000_add_is_ai_to_messages.sql ---
-- Adiciona a coluna is_ai na tabela de mensagens para diferenciar mensagens enviadas pelo robÃ´ das enviadas pela equipe no painel
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE;

--- MIGRATION: 20260506083000_add_trial_days_to_settings.sql ---
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 10;

--- MIGRATION: 20260506100000_add_pending_followup_to_threads.sql ---
-- Migration: Add pending_followup to threads
-- Description: Stores metadata about manually scheduled follow-ups by humans.

ALTER TABLE threads ADD COLUMN IF NOT EXISTS pending_followup JSONB DEFAULT NULL;

COMMENT ON COLUMN threads.pending_followup IS 'Stores { message, scheduled_at, type, metadata } for manual human-initiated follow-ups.';

--- MIGRATION: 20260506110000_add_ad_tracking_to_contacts.sql ---
-- Migration: Add ad_tracking to contacts
-- Description: Stores metadata about the lead source (Meta Ads, UTMs, Referral data)

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_tracking JSONB DEFAULT NULL;

COMMENT ON COLUMN contacts.ad_tracking IS 'Stores information about lead origin like campaign_id, ad_id, source, and medium.';

--- MIGRATION: 20260506120000_add_campaigns_module.sql ---
-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID, -- Removida referÃªncia direta para evitar erro de tabela inexistente
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_id TEXT,
  status TEXT DEFAULT 'pending', -- pending, sending, completed, failed
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaign logs for tracking individual deliveries
CREATE TABLE IF NOT EXISTS campaign_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  status TEXT NOT NULL, -- success, failed
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON campaign_logs(campaign_id);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (Basic tenant isolation)
CREATE POLICY "Users can view their tenant's campaigns" 
ON campaigns FOR SELECT 
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create campaigns for their tenant" 
ON campaigns FOR INSERT 
WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their tenant's campaign logs" 
ON campaign_logs FOR SELECT 
USING (campaign_id IN (SELECT id FROM campaigns WHERE tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

--- MIGRATION: 20260506130000_add_campaigns_flag.sql ---
-- Insert the campaigns feature flag
INSERT INTO feature_flags (key, label, description, enabled)
VALUES ('campaigns', 'Campanhas', 'Habilita o mÃ³dulo de disparos em massa via templates oficiais da Meta.', false)
ON CONFLICT (key) DO NOTHING;

--- MIGRATION: 20260506140000_add_message_templates.sql ---
-- Migration: Add message templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'MARKETING',
  language TEXT DEFAULT 'pt_BR',
  variables_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own templates"
  ON message_templates
  FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE tenant_id = message_templates.tenant_id
  ));

--- MIGRATION: 20260506141000_fix_templates_rls.sql ---
-- Migration: Fix message templates RLS and add tenant check
DROP POLICY IF EXISTS "Users can manage their own templates" ON message_templates;

-- Policy for ALL (Select, Insert, Update, Delete)
CREATE POLICY "Users can manage their own templates"
  ON message_templates
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Also allow insert if tenant_id matches profile
-- This ensures that the user can only insert records for their own tenant

--- MIGRATION: 20260506142000_final_tenant_fix.sql ---
-- Migration: Align Campaigns and Templates with the actual Profile ID structure
DROP POLICY IF EXISTS "Users can manage their own templates" ON message_templates;
DROP POLICY IF EXISTS "Users can manage their own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage their own campaign logs" ON campaign_logs;

-- Templates: Scope by auth.uid()
CREATE POLICY "Users can manage their own templates"
  ON message_templates
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Campaigns: Scope by auth.uid()
CREATE POLICY "Users can manage their own campaigns"
  ON campaigns
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Logs: Scope through campaigns
CREATE POLICY "Users can manage their own campaign logs"
  ON campaign_logs
  FOR ALL
  USING (campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = auth.uid()));

--- MIGRATION: 20260506143000_add_template_body.sql ---
-- Migration: Add body column to message_templates for multi-provider support
ALTER TABLE message_templates 
ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';

-- Comment indicating purpose
COMMENT ON COLUMN message_templates.body IS 'O corpo da mensagem para uso com Evolution API e Uazapi. VariÃ¡veis sÃ£o mapeadas dinamicamente.';

--- MIGRATION: 20260506144000_add_campaign_targets.sql ---
-- Migration: Add targeting and variable mapping columns to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'all',
ADD COLUMN IF NOT EXISTS selected_labels TEXT,
ADD COLUMN IF NOT EXISTS selected_funnel_status TEXT,
ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}'::jsonb;

--- MIGRATION: 20260506145000_add_predefined_labels.sql ---
-- Migration: Add predefined_labels to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS predefined_labels TEXT[] DEFAULT '{}';

--- MIGRATION: 20260506150000_add_manual_targeting.sql ---
-- Migration: Add manual and upload targeting to campaigns
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS manual_list TEXT,
ADD COLUMN IF NOT EXISTS uploaded_contacts JSONB;

--- MIGRATION: 20260508150000_add_sofia_memory.sql ---
-- Enable the pgvector extension to work with embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create sofia_memory table for long-term storage of knowledge
CREATE TABLE IF NOT EXISTS sofia_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  content TEXT NOT NULL,
  embedding vector(1536), -- Optimized for text-embedding-3-small
  category TEXT, -- e.g., 'preference', 'business_rule', 'goal', 'history'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sofia_messages table for the direct chat history with the admin
CREATE TABLE IF NOT EXISTS sofia_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sofia_memory_tenant ON sofia_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sofia_messages_tenant ON sofia_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sofia_messages_user ON sofia_messages(user_id);

-- Vector index for semantic search (HNSW)
-- Note: cosine similarity is common for embeddings
CREATE INDEX IF NOT EXISTS idx_sofia_memory_embedding ON sofia_memory USING hnsw (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE sofia_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sofia_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for sofia_memory
CREATE POLICY "Users can view their tenant's sofia_memory" 
ON sofia_memory FOR SELECT 
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage their tenant's sofia_memory" 
ON sofia_memory FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Create policies for sofia_messages
CREATE POLICY "Users can view their tenant's sofia_messages" 
ON sofia_messages FOR SELECT 
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create sofia_messages for their tenant" 
ON sofia_messages FOR INSERT 
WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

--- MIGRATION: 20260508151000_sofia_rpc.sql ---
-- Function to match sofia memory using vector similarity
CREATE OR REPLACE FUNCTION match_sofia_memory (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sofia_memory.id,
    sofia_memory.content,
    1 - (sofia_memory.embedding <=> query_embedding) AS similarity
  FROM sofia_memory
  WHERE 1 - (sofia_memory.embedding <=> query_embedding) > match_threshold
    AND sofia_memory.tenant_id = p_tenant_id
  ORDER BY sofia_memory.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

--- MIGRATION: 20260508152000_sofia_config.sql ---
-- Adicionar configuraÃ§Ãµes da Sofia na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sofia_prompt TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sofia_active BOOLEAN DEFAULT TRUE;

-- ComentÃ¡rios para documentaÃ§Ã£o
COMMENT ON COLUMN profiles.sofia_prompt IS 'System prompt personalizado para a assistente Sofia';
COMMENT ON COLUMN profiles.sofia_active IS 'Habilita ou desabilita o chat da Sofia para o usuÃ¡rio';

--- MIGRATION: 20260508221500_fix_profile_tenant_id.sql ---
-- Migration: Add tenant_id to profiles to support multi-user tenant architecture
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'profiles' AND COLUMN_NAME = 'tenant_id') THEN
        ALTER TABLE public.profiles ADD COLUMN tenant_id UUID;
        -- Default existing profiles to use their own ID as tenant_id
        UPDATE public.profiles SET tenant_id = id;
    END IF;
END $$;

-- Update Sofia policies to be more direct if needed, but the column fix will solve the current error
-- Re-applying Sofia policies to ensure they work with the new column
DROP POLICY IF EXISTS "Users can view their tenant's sofia_memory" ON sofia_memory;
CREATE POLICY "Users can view their tenant's sofia_memory" 
ON sofia_memory FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their tenant's sofia_memory" ON sofia_memory;
CREATE POLICY "Users can manage their tenant's sofia_memory" 
ON sofia_memory FOR ALL
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their tenant's sofia_messages" ON sofia_messages;
CREATE POLICY "Users can view their tenant's sofia_messages" 
ON sofia_messages FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create sofia_messages for their tenant" ON sofia_messages;
CREATE POLICY "Users can create sofia_messages for their tenant" 
ON sofia_messages FOR INSERT 
WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

--- MIGRATION: 20260509143600_add_message_starred.sql ---
-- Add is_starred column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false;

-- Create index for faster filtering of starred messages
CREATE INDEX IF NOT EXISTS idx_messages_is_starred ON messages(is_starred) WHERE is_starred = true;

--- MIGRATION: 20260511170000_chat_performance_indexes.sql ---
-- ============================================================
-- Chat Performance Indexes
-- Melhora drasticamente a performance das queries mais frequentes
-- do mÃ³dulo de chat: listagem de mensagens, threads e contatos.
-- ============================================================

-- 1. Ãndice composto para busca de mensagens por thread (a query mais frequente)
-- Suporta: .eq('thread_id', id).order('created_at', ascending: true)
CREATE INDEX IF NOT EXISTS idx_messages_thread_created 
  ON public.messages (thread_id, created_at ASC);

-- 2. Ãndice para busca de mensagens por whatsapp_id (deduplicaÃ§Ã£o de webhook)
-- Suporta: .eq('whatsapp_id', id).eq('user_id', id)
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id_user 
  ON public.messages (whatsapp_id, user_id) 
  WHERE whatsapp_id IS NOT NULL;

-- 3. Ãndice para busca de threads por usuÃ¡rio ordenadas por Ãºltima mensagem (sidebar)
-- Suporta: .eq('user_id', id).order('last_message_time', descending: true)
CREATE INDEX IF NOT EXISTS idx_threads_user_last_msg 
  ON public.threads (user_id, last_message_time DESC NULLS LAST);

-- 4. Ãndice para busca de contatos por usuÃ¡rio (join com threads)
CREATE INDEX IF NOT EXISTS idx_contacts_user_id 
  ON public.contacts (user_id);

-- 5. Ãndice para busca aproximada de telefone (normalizaÃ§Ã£o do 9Âº dÃ­gito)
-- Suporta: .ilike('telefone', '%XXXXXXXX')
CREATE INDEX IF NOT EXISTS idx_contacts_telefone_pattern 
  ON public.contacts (user_id, telefone text_pattern_ops);

-- 6. Ãndice para filtrar mensagens por status (monitoramento de mensagens travadas)
CREATE INDEX IF NOT EXISTS idx_messages_status_user 
  ON public.messages (user_id, status) 
  WHERE status IN ('sending', 'pending', 'failed');

-- 7. Ãndice para busca de threads por ticket_status (abertos/resolvidos)
CREATE INDEX IF NOT EXISTS idx_threads_ticket_status 
  ON public.threads (user_id, ticket_status);

-- 8. Ãndice parcial para threads com foto a atualizar
CREATE INDEX IF NOT EXISTS idx_threads_photo_update 
  ON public.threads (user_id, profile_picture_updated_at) 
  WHERE profile_picture_url IS NOT NULL;


--- MIGRATION: 20260511174200_add_contact_jid_to_messages.sql ---
-- Add contact_jid column to messages table to support "click to chat" from shared contacts
ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_jid TEXT;

--- MIGRATION: 20260511180000_leo_instagram_post_triggers.sql ---
ALTER TABLE leo_insta_gatilhos ADD COLUMN IF NOT EXISTS post_id TEXT;
ALTER TABLE leo_insta_gatilhos ADD COLUMN IF NOT EXISTS post_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leo_insta_gatilhos_post_id ON leo_insta_gatilhos(post_id);

--- MIGRATION: 20260512100000_upsert_inbound_message_rpc.sql ---
-- ============================================================
-- RPC: upsert_inbound_message
--
-- Executa os 3 upserts (message â†’ thread â†’ contact) dentro de
-- uma Ãºnica transaÃ§Ã£o PostgreSQL, eliminando estados inconsistentes
-- onde o sidebar mostra uma last_message que nÃ£o existe na tabela
-- messages, ou vice-versa.
--
-- ParÃ¢metros (todos JSONB para flexibilidade de schema):
--   p_message : payload da mensagem (campos de messages)
--   p_thread  : payload da thread   (campos de threads)
--   p_contact : payload do contato  (campos de contacts +
--               increment_count BOOL e reopen_ticket BOOL)
--
-- Retorno: { "success": true } ou { "success": false, "error": "...", "code": "..." }
-- A exceÃ§Ã£o Ã© capturada internamente para que o chamador possa
-- distinguir erros SQL de erros de rede sem retry desnecessÃ¡rio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_inbound_message(
  p_message JSONB,
  p_thread  JSONB,
  p_contact JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  -- 1. MENSAGEM
  --    Idempotente via UNIQUE (whatsapp_id, user_id).
  --    DO NOTHING em duplicatas â€” o webhook pode re-entregar.
  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO messages (
    id,
    user_id,
    thread_id,
    text,
    direction,
    status,
    timestamp,
    audio_url,
    message_type,
    media_url,
    media_mime_type,
    media_filename,
    caption,
    is_external,
    quoted_id,
    quoted_text,
    whatsapp_id,
    contact_jid,
    is_ai,
    tokens_prompt,
    tokens_completion,
    cost_brl,
    created_at
  )
  VALUES (
    p_message->>'id',
    (p_message->>'user_id')::uuid,
    p_message->>'thread_id',
    COALESCE(p_message->>'text', ''),
    p_message->>'direction',
    COALESCE(p_message->>'status', 'sent'),
    (p_message->>'timestamp')::bigint,
    p_message->>'audio_url',
    COALESCE(p_message->>'message_type', 'text'),
    p_message->>'media_url',
    p_message->>'media_mime_type',
    p_message->>'media_filename',
    p_message->>'caption',
    COALESCE((p_message->>'is_external')::boolean, false),
    p_message->>'quoted_id',
    p_message->>'quoted_text',
    p_message->>'whatsapp_id',
    p_message->>'contact_jid',
    COALESCE((p_message->>'is_ai')::boolean, false),
    COALESCE((p_message->>'tokens_prompt')::integer, 0),
    COALESCE((p_message->>'tokens_completion')::integer, 0),
    COALESCE((p_message->>'cost_brl')::numeric, 0),
    COALESCE((p_message->>'created_at')::timestamptz, NOW())
  )
  ON CONFLICT (whatsapp_id, user_id) DO NOTHING;


  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  -- 2. THREAD
  --    Atualiza last_message, unread_count e ticket_status.
  --    Preserva a foto de perfil existente se nÃ£o for fornecida.
  --    Nunca sobrescreve contact_name real com nÃºmero de telefone.
  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO threads (
    id,
    user_id,
    remote_jid,
    display_phone,
    contact_name,
    last_message,
    last_message_time,
    status,
    unread_count,
    ticket_status,
    agent_name,
    updated_at,
    profile_picture_url,
    profile_picture_updated_at
  )
  VALUES (
    p_thread->>'id',
    (p_thread->>'user_id')::uuid,
    p_thread->>'remote_jid',
    p_thread->>'display_phone',
    p_thread->>'contact_name',
    p_thread->>'last_message',
    (p_thread->>'last_message_time')::timestamptz,
    COALESCE(p_thread->>'status', 'ia'),
    COALESCE((p_thread->>'unread_count')::integer, 0),
    COALESCE(p_thread->>'ticket_status', 'open'),
    p_thread->>'agent_name',
    COALESCE((p_thread->>'updated_at')::timestamptz, NOW()),
    p_thread->>'profile_picture_url',
    (p_thread->>'profile_picture_updated_at')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    last_message             = EXCLUDED.last_message,
    last_message_time        = EXCLUDED.last_message_time,
    unread_count             = EXCLUDED.unread_count,
    ticket_status            = EXCLUDED.ticket_status,
    agent_name               = COALESCE(EXCLUDED.agent_name, threads.agent_name),
    updated_at               = EXCLUDED.updated_at,
    -- Prioridade de nome: novo valor real > existente > nunca nÃºmero puro
    contact_name             = CASE
      WHEN EXCLUDED.contact_name IS NOT NULL
        AND LENGTH(TRIM(EXCLUDED.contact_name)) > 0
        AND EXCLUDED.contact_name !~ '^[0-9+\-\s().]+$'
      THEN EXCLUDED.contact_name
      ELSE COALESCE(threads.contact_name, EXCLUDED.contact_name)
    END,
    -- Preserva foto existente quando nÃ£o Ã© fornecida uma nova
    profile_picture_url      = COALESCE(EXCLUDED.profile_picture_url, threads.profile_picture_url),
    profile_picture_updated_at = COALESCE(
      EXCLUDED.profile_picture_updated_at,
      threads.profile_picture_updated_at
    );


  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  -- 3. CONTATO
  --    Cria novo contato com dados completos, ou atualiza apenas
  --    os campos de interaÃ§Ã£o (nunca sobrescreve nome real com
  --    nÃºmero de telefone puro).
  --    Flags especiais no payload:
  --      increment_count  BOOL â†’ incrementa total_mensagens
  --      reopen_ticket    BOOL â†’ move 'Resolvido' â†’ 'Lead'
  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO contacts (
    id,
    user_id,
    telefone,
    nome,
    status_funil,
    source,
    ultima_mensagem,
    ultima_interacao,
    primeiro_contato,
    data_criacao,
    total_mensagens
  )
  VALUES (
    p_contact->>'id',
    (p_contact->>'user_id')::uuid,
    p_contact->>'telefone',
    COALESCE(NULLIF(TRIM(p_contact->>'nome'), ''), p_contact->>'telefone', 'Lead WhatsApp'),
    COALESCE(p_contact->>'status_funil', 'Lead'),
    COALESCE(p_contact->>'source', 'whatsapp'),
    p_contact->>'ultima_mensagem',
    COALESCE((p_contact->>'ultima_interacao')::timestamptz, NOW()),
    COALESCE((p_contact->>'primeiro_contato')::timestamptz, NOW()),
    COALESCE((p_contact->>'data_criacao')::timestamptz, NOW()),
    COALESCE((p_contact->>'total_mensagens')::integer, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    ultima_mensagem  = EXCLUDED.ultima_mensagem,
    ultima_interacao = EXCLUDED.ultima_interacao,
    -- Incrementa contador apenas quando explicitamente solicitado
    total_mensagens  = CASE
      WHEN COALESCE((p_contact->>'increment_count')::boolean, false)
      THEN contacts.total_mensagens + 1
      ELSE contacts.total_mensagens
    END,
    -- Nunca sobrescreve nome real com nÃºmero de telefone
    nome = CASE
      WHEN EXCLUDED.nome IS NULL OR TRIM(EXCLUDED.nome) = ''
           OR EXCLUDED.nome ~ '^[0-9+\-\s().]+$'
      THEN COALESCE(contacts.nome, EXCLUDED.nome)
      ELSE EXCLUDED.nome
    END,
    -- Reabre ticket ao receber nova mensagem de contato resolvido
    status_funil = CASE
      WHEN COALESCE((p_contact->>'reopen_ticket')::boolean, false)
        AND contacts.status_funil = 'Resolvido'
      THEN 'Lead'
      ELSE contacts.status_funil
    END;


  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  -- Retorna erro como dado (nÃ£o como exceÃ§Ã£o) para que o chamador
  -- possa inspecionar o SQLSTATE e decidir se deve ou nÃ£o retentar.
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'code',    SQLSTATE
  );

END;
$$;

-- Apenas service_role (backend) pode executar esta funÃ§Ã£o.
-- O frontend nunca deve chamar RPCs de escrita diretamente.
REVOKE ALL ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) TO service_role;

--- MIGRATION: 20260512182000_agent_ecommerce_integration.sql ---
-- MigraÃ§Ã£o para adicionar suporte a IntegraÃ§Ã£o de E-commerce / APIs Externas
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS ecommerce_api_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ecommerce_api_type TEXT DEFAULT 'custom', -- 'custom', 'shopify', 'woocommerce'
ADD COLUMN IF NOT EXISTS ecommerce_api_use_nlp BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN agents.ecommerce_api_url IS 'URL base para consulta de produtos/catÃ¡logo do cliente.';
COMMENT ON COLUMN agents.ecommerce_api_type IS 'Plataforma de e-commerce utilizada pelo cliente.';
COMMENT ON COLUMN agents.ecommerce_api_use_nlp IS 'Se verdadeiro, tenta utilizar o endpoint /busca-ia se disponÃ­vel.';

--- MIGRATION: 20260512183000_fix_global_settings_columns.sql ---
-- Garantir que a tabela global_settings tenha todas as colunas necessÃ¡rias para o Painel Admin
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_signups BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS admin_notification_phone TEXT,
ADD COLUMN IF NOT EXISTS admin_notification_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Notificar o PostgREST para recarregar o cache do schema (se estiver em um ambiente que suporte NOTIFY)
-- NOTIFY pgrst, 'reload schema';

--- MIGRATION: 20260512210000_leo_idempotency_index.sql ---
-- ============================================================
-- IdempotÃªncia no processamento de webhooks do Instagram
--
-- Adiciona Ã­ndice UNIQUE em instagram_message_id para garantir
-- que o mesmo evento (comentÃ¡rio ou DM) nunca seja processado
-- duas vezes, mesmo que a Meta entregue o webhook duplicado ou
-- o worker BullMQ execute a tarefa mais de uma vez apÃ³s retry.
--
-- Cobre apenas linhas onde instagram_message_id IS NOT NULL
-- (DMs enviadas sem source nÃ£o tÃªm esse campo preenchido).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS leo_insta_interacoes_message_id_unique
  ON leo_instagram_interacoes (instagram_message_id)
  WHERE instagram_message_id IS NOT NULL;

--- MIGRATION: 20260512220000_messages_add_quoted_columns.sql ---
-- Adiciona colunas de mensagem citada (reply) na tabela messages.
-- NecessÃ¡rio para a funÃ§Ã£o upsert_inbound_message funcionar corretamente.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS quoted_id   TEXT,
  ADD COLUMN IF NOT EXISTS quoted_text TEXT;

--- MIGRATION: 20260512230000_messages_add_missing_columns.sql ---
-- Adiciona todas as colunas que a funÃ§Ã£o upsert_inbound_message referencia
-- mas que podem nÃ£o existir em bancos criados antes dessas features.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS quoted_id    TEXT,
  ADD COLUMN IF NOT EXISTS quoted_text  TEXT,
  ADD COLUMN IF NOT EXISTS contact_jid  TEXT;

--- MIGRATION: 20260512240000_fix_upsert_inbound_message_order.sql ---
-- Corrige a ordem de inserÃ§Ã£o da RPC upsert_inbound_message.
-- A versÃ£o anterior inseria messages ANTES de threads, violando
-- a FK messages_thread_id_fkey. A ordem correta Ã©: contact â†’ thread â†’ message.

CREATE OR REPLACE FUNCTION public.upsert_inbound_message(
  p_message JSONB,
  p_thread  JSONB,
  p_contact JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  -- 1. CONTATO (deve existir antes da thread)
  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO contacts (
    id,
    user_id,
    telefone,
    nome,
    status_funil,
    source,
    ultima_mensagem,
    ultima_interacao,
    primeiro_contato,
    data_criacao,
    total_mensagens
  )
  VALUES (
    p_contact->>'id',
    (p_contact->>'user_id')::uuid,
    p_contact->>'telefone',
    COALESCE(NULLIF(TRIM(p_contact->>'nome'), ''), p_contact->>'telefone', 'Lead WhatsApp'),
    COALESCE(p_contact->>'status_funil', 'Lead'),
    COALESCE(p_contact->>'source', 'whatsapp'),
    p_contact->>'ultima_mensagem',
    COALESCE((p_contact->>'ultima_interacao')::timestamptz, NOW()),
    COALESCE((p_contact->>'primeiro_contato')::timestamptz, NOW()),
    COALESCE((p_contact->>'data_criacao')::timestamptz, NOW()),
    COALESCE((p_contact->>'total_mensagens')::integer, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    ultima_mensagem  = EXCLUDED.ultima_mensagem,
    ultima_interacao = EXCLUDED.ultima_interacao,
    total_mensagens  = CASE
      WHEN COALESCE((p_contact->>'increment_count')::boolean, false)
      THEN contacts.total_mensagens + 1
      ELSE contacts.total_mensagens
    END,
    nome = CASE
      WHEN EXCLUDED.nome IS NULL OR TRIM(EXCLUDED.nome) = ''
           OR EXCLUDED.nome ~ '^[0-9+\-\s().]+$'
      THEN COALESCE(contacts.nome, EXCLUDED.nome)
      ELSE EXCLUDED.nome
    END,
    status_funil = CASE
      WHEN COALESCE((p_contact->>'reopen_ticket')::boolean, false)
        AND contacts.status_funil = 'Resolvido'
      THEN 'Lead'
      ELSE contacts.status_funil
    END;


  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  -- 2. THREAD (deve existir antes da mensagem por causa da FK)
  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO threads (
    id,
    user_id,
    remote_jid,
    display_phone,
    contact_name,
    last_message,
    last_message_time,
    status,
    unread_count,
    ticket_status,
    agent_name,
    updated_at,
    profile_picture_url,
    profile_picture_updated_at
  )
  VALUES (
    p_thread->>'id',
    (p_thread->>'user_id')::uuid,
    p_thread->>'remote_jid',
    p_thread->>'display_phone',
    p_thread->>'contact_name',
    p_thread->>'last_message',
    (p_thread->>'last_message_time')::timestamptz,
    COALESCE(p_thread->>'status', 'ia'),
    COALESCE((p_thread->>'unread_count')::integer, 0),
    COALESCE(p_thread->>'ticket_status', 'open'),
    p_thread->>'agent_name',
    COALESCE((p_thread->>'updated_at')::timestamptz, NOW()),
    p_thread->>'profile_picture_url',
    (p_thread->>'profile_picture_updated_at')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    last_message               = EXCLUDED.last_message,
    last_message_time          = EXCLUDED.last_message_time,
    unread_count               = EXCLUDED.unread_count,
    ticket_status              = EXCLUDED.ticket_status,
    agent_name                 = COALESCE(EXCLUDED.agent_name, threads.agent_name),
    updated_at                 = EXCLUDED.updated_at,
    contact_name               = CASE
      WHEN EXCLUDED.contact_name IS NOT NULL
        AND LENGTH(TRIM(EXCLUDED.contact_name)) > 0
        AND EXCLUDED.contact_name !~ '^[0-9+\-\s().]+$'
      THEN EXCLUDED.contact_name
      ELSE COALESCE(threads.contact_name, EXCLUDED.contact_name)
    END,
    profile_picture_url        = COALESCE(EXCLUDED.profile_picture_url, threads.profile_picture_url),
    profile_picture_updated_at = COALESCE(
      EXCLUDED.profile_picture_updated_at,
      threads.profile_picture_updated_at
    );


  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  -- 3. MENSAGEM (thread jÃ¡ existe, FK satisfeita)
  --    Idempotente via UNIQUE (whatsapp_id, user_id).
  -- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  INSERT INTO messages (
    id,
    user_id,
    thread_id,
    text,
    direction,
    status,
    timestamp,
    audio_url,
    message_type,
    media_url,
    media_mime_type,
    media_filename,
    caption,
    is_external,
    quoted_id,
    quoted_text,
    whatsapp_id,
    contact_jid,
    is_ai,
    tokens_prompt,
    tokens_completion,
    cost_brl,
    created_at
  )
  VALUES (
    CASE 
      WHEN (p_message->>'id') ~ '^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$' 
      THEN (p_message->>'id')::uuid 
      ELSE gen_random_uuid() 
    END,
    (p_message->>'user_id')::uuid,
    p_message->>'thread_id',
    COALESCE(p_message->>'text', ''),
    p_message->>'direction',
    COALESCE(p_message->>'status', 'sent'),
    (p_message->>'timestamp')::bigint,
    p_message->>'audio_url',
    COALESCE(p_message->>'message_type', 'text'),
    p_message->>'media_url',
    p_message->>'media_mime_type',
    p_message->>'media_filename',
    p_message->>'caption',
    COALESCE((p_message->>'is_external')::boolean, false),
    p_message->>'quoted_id',
    p_message->>'quoted_text',
    p_message->>'whatsapp_id',
    p_message->>'contact_jid',
    COALESCE((p_message->>'is_ai')::boolean, false),
    COALESCE((p_message->>'tokens_prompt')::integer, 0),
    COALESCE((p_message->>'tokens_completion')::integer, 0),
    COALESCE((p_message->>'cost_brl')::numeric, 0),
    COALESCE((p_message->>'created_at')::timestamptz, NOW())
  )
  ON CONFLICT (whatsapp_id, user_id) DO NOTHING;


  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'code',    SQLSTATE
  );

END;
$$;

REVOKE ALL ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_inbound_message(JSONB, JSONB, JSONB) TO service_role;

--- MIGRATION: 20260513110000_enable_whatsapp_provider_abstraction.sql ---
-- Habilita a flag que o WhatsAppProviderFactory consulta antes de resolver
-- o provedor por tenant (profiles.whatsapp_provider).
--
-- Sem essa flag, o Factory sempre retorna EvolutionProvider (legacy fallback)
-- e nenhum cliente consegue usar Meta Cloud API â€” mesmo com credenciais vÃ¡lidas.

INSERT INTO feature_flags (key, label, description, enabled)
VALUES (
  'whatsapp_provider_abstraction',
  'AbstraÃ§Ã£o de Provedor WhatsApp',
  'Habilita o WhatsAppProviderFactory a resolver o provedor por tenant (profiles.whatsapp_provider). Sem isso, todos os clientes usam Evolution por padrÃ£o.',
  true
)
ON CONFLICT (key) DO UPDATE SET enabled = true;

--- MIGRATION: 20260513120000_add_meta_last_error.sql ---
-- Coluna para armazenar o Ãºltimo erro reportado pela Meta Cloud API para
-- um tenant. Permite que o AdminPanel mostre o problema ao admin sem
-- precisar abrir logs do servidor.
--
-- Exemplos tÃ­picos: "[Meta 190] Invalid OAuth access token",
-- "[Meta 131047] Re-engagement message", "phone_quality: RED".

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS meta_last_error TEXT,
ADD COLUMN IF NOT EXISTS meta_last_error_at TIMESTAMPTZ;

--- MIGRATION: 20260513130000_per_tenant_meta_secret_and_audit.sql ---
-- Per-tenant Meta App Secret + provider audit log.
--
-- meta_app_secret: opcional. Quando preenchido, o webhook valida o HMAC contra
-- esse secret especÃ­fico do tenant. Quando NULL, cai no fallback global
-- WHATSAPP_APP_SECRET (modo "uma app Meta para todos").
--
-- provider_audit_log: trilha quem trocou o provider de qual tenant, quando e
-- com quais valores (mascarados â€” nunca armazena tokens completos).

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

CREATE TABLE IF NOT EXISTS provider_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,           -- e.g. provider_changed, meta_credentials_saved, meta_disconnected
  details      JSONB,                   -- redacted payload (no raw tokens)
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_audit_log_target_idx
  ON provider_audit_log (target_user_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS provider_audit_log_action_idx
  ON provider_audit_log (action, performed_at DESC);

-- RLS: admin lÃª tudo, usuÃ¡rio comum lÃª apenas o prÃ³prio histÃ³rico.
ALTER TABLE provider_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_audit_log_admin_read ON provider_audit_log;
CREATE POLICY provider_audit_log_admin_read
  ON provider_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    OR target_user_id = auth.uid()
  );

--- MIGRATION: 20260513140000_backfill_whatsapp_provider.sql ---
-- Garante que toda linha em profiles tenha um valor explÃ­cito em
-- whatsapp_provider. O Factory jÃ¡ trata NULL como 'evolution', mas
-- normalizar no DB simplifica queries de relatÃ³rio/filtro e evita
-- comportamentos surpreendentes em joins.

UPDATE profiles
SET whatsapp_provider = 'evolution'
WHERE whatsapp_provider IS NULL;

-- ReforÃ§a o default para inserÃ§Ãµes futuras (jÃ¡ estava em 'evolution',
-- mas garantimos para casos de schemas restaurados de backup antigo).
ALTER TABLE profiles
ALTER COLUMN whatsapp_provider SET DEFAULT 'evolution';

--- MIGRATION: 20260513150000_template_audit.sql ---
-- Auditoria de envios de template Meta Cloud API.
--
-- Cada vez que sendTemplate Ã© chamado (com sucesso ou falha) registramos:
--   - quem enviou (user_id), qual template, idioma, destinatÃ¡rio
--   - as variÃ¡veis MASCARADAS (primeiros 30 + Ãºltimos 30 chars) â€” LGPD-safe
--   - hash SHA256 das variÃ¡veis originais (detecta reincidÃªncia sem expor conteÃºdo)
--   - warnings detectadas pelo templateValidator (URL encurtado, all-caps, etc)
--   - status final + mensagem de erro se houver
--
-- Quando a Meta banir/pausar um template, esse log permite identificar
-- exatamente que conteÃºdo foi injetado nas variÃ¡veis antes do incidente.

CREATE TABLE IF NOT EXISTS template_send_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_name    TEXT NOT NULL,
  language_code    TEXT NOT NULL,
  to_phone         TEXT NOT NULL,
  variables_masked JSONB,
  variables_hash   TEXT,
  warnings         JSONB,
  status           TEXT NOT NULL,          -- 'sent' | 'failed' | 'blocked_local'
  meta_message_id  TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_send_log_user_idx
  ON template_send_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS template_send_log_template_idx
  ON template_send_log (template_name, created_at DESC);
CREATE INDEX IF NOT EXISTS template_send_log_hash_idx
  ON template_send_log (variables_hash);

ALTER TABLE template_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_send_log_owner_read ON template_send_log;
CREATE POLICY template_send_log_owner_read
  ON template_send_log
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

--- MIGRATION: 20260513150100_template_status_cache.sql ---
-- Cache local do status de cada template (por tenant).
-- A fonte da verdade ainda Ã© a Graph API da Meta â€” esse cache Ã© alimentado
-- pelo webhook message_template_status_update e usado para:
--   1. Consultas rÃ¡pidas (nÃ£o precisar pingar Graph API a cada request da UI)
--   2. HistÃ³rico (combinado com template_quality_history na sub-fase C)
--   3. SugestÃ£o de alternativa quando um template Ã© pausado pela Meta

CREATE TABLE IF NOT EXISTS template_status_cache (
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_name  TEXT NOT NULL,
  language_code  TEXT NOT NULL,
  status         TEXT NOT NULL,           -- APPROVED|PENDING|REJECTED|PAUSED|DISABLED|FLAGGED
  category       TEXT,                    -- UTILITY|MARKETING|AUTHENTICATION
  quality_score  TEXT,                    -- GREEN|YELLOW|RED|UNKNOWN
  reason         TEXT,                    -- motivo de REJECTED, se houver
  last_event     TEXT,                    -- Ãºltimo evento recebido (APPROVED|PAUSED|...)
  last_event_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_name, language_code)
);

CREATE INDEX IF NOT EXISTS template_status_cache_status_idx
  ON template_status_cache (user_id, status);

ALTER TABLE template_status_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_status_cache_owner_read ON template_status_cache;
CREATE POLICY template_status_cache_owner_read
  ON template_status_cache
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

--- MIGRATION: 20260513150200_template_quality_history.sql ---
-- Phase 5.1.C: Template Quality History
-- Captures periodic snapshots of template quality_score for trend display.

CREATE TABLE IF NOT EXISTS template_quality_history (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_name   TEXT        NOT NULL,
  language_code   TEXT        NOT NULL DEFAULT 'pt_BR',
  -- quality_score from Meta Graph API: GREEN | YELLOW | RED | UNKNOWN
  quality_score   TEXT        NOT NULL,
  -- template status at snapshot time
  status          TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tqh_user_template
  ON template_quality_history (user_id, template_name, language_code, recorded_at DESC);

-- RLS: tenants only see their own rows
ALTER TABLE template_quality_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_quality_history"
  ON template_quality_history
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role bypasses RLS (backend workers)
CREATE POLICY "service_role_quality_history"
  ON template_quality_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

--- MIGRATION: 20260513160000_add_leads_radar.sql ---
-- Criar tabela para o Radar de Leads (Agente de CaptaÃ§Ã£o)
CREATE TABLE IF NOT EXISTS leads_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    rating DECIMAL(3,2),
    user_rating_count INTEGER,
    website TEXT,
    review_summary TEXT,
    place_id TEXT UNIQUE NOT NULL,
    niche TEXT,
    city TEXT,
    status TEXT DEFAULT 'novo' CHECK (status IN ('novo', 'qualificado', 'descartado', 'contatado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar coluna para a API Key do Google Maps nas configuraÃ§Ãµes globais
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS google_maps_api_key TEXT;

-- Habilitar RLS para leads_radar
ALTER TABLE leads_radar ENABLE ROW LEVEL SECURITY;

-- PolÃ­tica para apenas administradores acessarem os leads
CREATE POLICY "Apenas administradores podem gerenciar leads_radar" 
ON leads_radar 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

--- MIGRATION: 20260513173000_update_leads_radar_apify.sql ---
-- Update global_settings to include apify_api_token
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS apify_api_token TEXT;

-- Update leads_radar to include new data fields from Apify and Scoring
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS pain_score INTEGER DEFAULT 0;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS opportunity_score INTEGER DEFAULT 0;
ALTER TABLE leads_radar ADD COLUMN IF NOT EXISTS personalized_message TEXT;

--- MIGRATION: 20260514160000_add_agent_tone_and_forbidden.sql ---
-- Phase 2.1: Quality improvements for AI agents
-- Adds tone of voice configuration and forbidden topics to agents table.
-- Both fields are optional (NULL means default: neutro/none).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tone_of_voice TEXT
    CHECK (tone_of_voice IN ('formal', 'casual', 'tecnico', 'amigavel', 'consultivo')),
  ADD COLUMN IF NOT EXISTS forbidden_topics TEXT,
  ADD COLUMN IF NOT EXISTS conversation_examples TEXT;

COMMENT ON COLUMN agents.tone_of_voice IS
  'Tom de voz do agente: formal | casual | tecnico | amigavel | consultivo. NULL = neutro.';
COMMENT ON COLUMN agents.forbidden_topics IS
  'Assuntos que o agente NUNCA deve responder (um por linha). Ex: "PolÃ­tica", "DiagnÃ³stico mÃ©dico".';
COMMENT ON COLUMN agents.conversation_examples IS
  'Exemplos de diÃ¡logos (few-shot) que calibram o tom desejado. Formato livre.';

--- MIGRATION: 20260514170000_add_ai_interaction_logs.sql ---
-- Phase 4: Observability â€” AI interaction audit trail
-- One row per processIncoming() call. Tracks duration, cost, tools, outcome.
-- Written fire-and-forget (no blocking the agent response path).

CREATE TABLE IF NOT EXISTS ai_interaction_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  thread_id       text        NOT NULL,
  agent_id        uuid        REFERENCES agents(id) ON DELETE SET NULL,
  duration_ms     int         NOT NULL DEFAULT 0,
  model_used      text,
  tokens_in       int         NOT NULL DEFAULT 0,
  tokens_out      int         NOT NULL DEFAULT 0,
  cost_brl        numeric(10,6) NOT NULL DEFAULT 0,
  tool_calls_count int        NOT NULL DEFAULT 0,
  tool_names      text[]      DEFAULT '{}',
  outcome         text        NOT NULL
    CHECK (outcome IN ('responded', 'transferred', 'fallback', 'error')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_interaction_logs_user_time_idx
  ON ai_interaction_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_interaction_logs_thread_idx
  ON ai_interaction_logs (thread_id, created_at DESC);

-- RLS: users can only see their own logs
ALTER TABLE ai_interaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai logs"
  ON ai_interaction_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS for INSERT
CREATE POLICY "Service role can insert ai logs"
  ON ai_interaction_logs FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE ai_interaction_logs IS
  'Audit trail for every AI agent processIncoming() call. Used for cost tracking and performance observability.';

