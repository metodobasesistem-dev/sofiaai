-- SQL para rodar no Editor de SQL do Supabase:

-- Adicionar colunas necessárias para suporte a múltiplos profissionais e Google Calendar
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS professional_name TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 30;
