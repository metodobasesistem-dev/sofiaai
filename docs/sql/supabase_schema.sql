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
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Contacts (CRM Leads)
CREATE TABLE IF NOT EXISTS public.contacts (
  id TEXT PRIMARY KEY, -- Using compound key like {userId}_{phone} if needed or just UUID
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status_funil TEXT DEFAULT 'Lead' CHECK (status_funil IN ('Lead', 'Qualificado')),
  ultima_mensagem TEXT,
  total_mensagens INTEGER DEFAULT 1,
  ultima_interacao TIMESTAMPTZ DEFAULT NOW(),
  primeiro_contato TIMESTAMPTZ DEFAULT NOW(),
  data_criacao TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'whatsapp'
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
  status TEXT DEFAULT 'ia' CHECK (status IN ('ia', 'human'))
);

-- 5. Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  thread_id TEXT REFERENCES public.threads(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  timestamp BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- 9. Row Level Security (RLS)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

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

-- Enable Realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
