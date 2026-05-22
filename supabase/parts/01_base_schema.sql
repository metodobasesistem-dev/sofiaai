-- PART 1: EXTENSIONS & BASE SCHEMA CREATION
-- Execute this block first in the Supabase SQL Editor.

-- Enable pgvector and uuid-ossp extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  id TEXT PRIMARY KEY, -- Compound key like {userId}_{phone} or UUID
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
  trial_days INTEGER DEFAULT 10,
  admin_notification_phone TEXT,
  admin_notification_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  google_maps_api_key TEXT,
  apify_api_token TEXT,
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
  updated_at TIMESTAMPTZ DEFAULT now(),
  instagram_username TEXT,
  instagram_name TEXT,
  instagram_picture_url TEXT,
  instagram_token_expires_at TIMESTAMPTZ,
  instagram_state_token TEXT,
  insta_auto_follow_enabled BOOLEAN DEFAULT FALSE,
  insta_auto_follow_msg TEXT DEFAULT 'Olá! Obrigado por me seguir. Como posso te ajudar hoje?',
  insta_auto_comment_enabled BOOLEAN DEFAULT FALSE,
  insta_auto_comment_msg TEXT DEFAULT 'Obrigado pelo seu comentário! Te enviei uma mensagem no privado para conversarmos melhor.'
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

-- 8.7. Leo Instagram triggers
CREATE TABLE IF NOT EXISTS public.leo_insta_gatilhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  palavra_chave TEXT NOT NULL,
  mensagem_dm TEXT NOT NULL,
  resposta_comentario TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  post_id TEXT,
  post_url TEXT
);

-- 8.8. Campaigns & Campaign Logs
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_id TEXT,
  status TEXT DEFAULT 'pending',
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  target_type TEXT DEFAULT 'all',
  selected_labels TEXT,
  selected_funnel_status TEXT,
  variables JSONB DEFAULT '{}'::jsonb,
  manual_list TEXT,
  uploaded_contacts JSONB
);

CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES public.contacts(id),
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8.9. Message Templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'MARKETING',
  language TEXT DEFAULT 'pt_BR',
  variables_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  body TEXT DEFAULT ''
);

-- 8.10. Sofia Memory & Messages
CREATE TABLE IF NOT EXISTS public.sofia_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  content TEXT NOT NULL,
  embedding vector(1536),
  category TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sofia_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8.11. Provider Audit Log
CREATE TABLE IF NOT EXISTS public.provider_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  details      JSONB,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.12. Template Send Log & Status Cache & Quality History
CREATE TABLE IF NOT EXISTS public.template_send_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_name    TEXT NOT NULL,
  language_code    TEXT NOT NULL,
  to_phone         TEXT NOT NULL,
  variables_masked JSONB,
  variables_hash   TEXT,
  warnings         JSONB,
  status           TEXT NOT NULL,
  meta_message_id  TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.template_status_cache (
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_name  TEXT NOT NULL,
  language_code  TEXT NOT NULL,
  status         TEXT NOT NULL,
  category       TEXT,
  quality_score  TEXT,
  reason         TEXT,
  last_event     TEXT,
  last_event_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_name, language_code)
);

CREATE TABLE IF NOT EXISTS public.template_quality_history (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_name   TEXT NOT NULL,
  language_code   TEXT NOT NULL DEFAULT 'pt_BR',
  quality_score   TEXT NOT NULL,
  status          TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.13. Leads Radar
CREATE TABLE IF NOT EXISTS public.leads_radar (
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    instagram TEXT,
    email TEXT,
    pain_score INTEGER DEFAULT 0,
    opportunity_score INTEGER DEFAULT 0,
    personalized_message TEXT
);

-- 8.14. AI Interaction Logs
CREATE TABLE IF NOT EXISTS public.ai_interaction_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id       text NOT NULL,
  agent_id        uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  duration_ms     int NOT NULL DEFAULT 0,
  model_used      text,
  tokens_in       int NOT NULL DEFAULT 0,
  tokens_out      int NOT NULL DEFAULT 0,
  cost_brl        numeric(10,6) NOT NULL DEFAULT 0,
  tool_calls_count int NOT NULL DEFAULT 0,
  tool_names      text[] DEFAULT '{}',
  outcome         text NOT NULL CHECK (outcome IN ('responded', 'transferred', 'fallback', 'error')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
