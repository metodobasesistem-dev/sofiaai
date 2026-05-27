-- Cria tabelas professionals e availability que estavam ausentes do banco de produção.
-- Estas tabelas são necessárias para o sistema de agendamento via IA funcionar.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. PROFESSIONALS
--    Cada tenant pode ter múltiplos profissionais com suas próprias agendas.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professionals (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id           UUID        REFERENCES public.agents(id) ON DELETE SET NULL,
  name               TEXT        NOT NULL,
  specialties        TEXT        NOT NULL DEFAULT '',
  google_calendar_id TEXT,
  bio                TEXT,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de busca
CREATE INDEX IF NOT EXISTS professionals_user_id_idx  ON public.professionals (user_id);
CREATE INDEX IF NOT EXISTS professionals_is_active_idx ON public.professionals (user_id, is_active);

-- RLS: cada usuário só vê e gerencia seus próprios profissionais
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professionals_select" ON public.professionals;
DROP POLICY IF EXISTS "professionals_insert" ON public.professionals;
DROP POLICY IF EXISTS "professionals_update" ON public.professionals;
DROP POLICY IF EXISTS "professionals_delete" ON public.professionals;

CREATE POLICY "professionals_select" ON public.professionals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "professionals_insert" ON public.professionals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "professionals_update" ON public.professionals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "professionals_delete" ON public.professionals
  FOR DELETE USING (auth.uid() = user_id);

-- service_role (backend) precisa de acesso total para o agente de IA funcionar
GRANT ALL ON public.professionals TO service_role;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. AVAILABILITY
--    Configuração de horários semanais por profissional (ou agenda geral quando
--    professional_id IS NULL).
--    config JSONB: { weekly: [...], specificDates: [...] }
-- ──────────────────────────────────────────────────────────────────────────────

-- Cria a tabela base (sem professional_id) — idempotente
CREATE TABLE IF NOT EXISTS public.availability (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config     JSONB       NOT NULL DEFAULT '{"weekly":[],"specificDates":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona professional_id se ainda não existir (funciona tanto em tabela nova quanto existente)
ALTER TABLE public.availability
  ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE;

-- Unique: um registro por (user_id, professional_id).
-- Como professional_id pode ser NULL (agenda geral), usamos COALESCE para contornar
-- o comportamento padrão do Postgres onde NULL != NULL em constraints UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS availability_user_prof_unique_idx
  ON public.availability (user_id, COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Índice para busca rápida pelo backend (agentService)
CREATE INDEX IF NOT EXISTS availability_user_id_idx ON public.availability (user_id);

-- RLS
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_select" ON public.availability;
DROP POLICY IF EXISTS "availability_insert" ON public.availability;
DROP POLICY IF EXISTS "availability_update" ON public.availability;
DROP POLICY IF EXISTS "availability_delete" ON public.availability;

CREATE POLICY "availability_select" ON public.availability
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "availability_insert" ON public.availability
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "availability_update" ON public.availability
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "availability_delete" ON public.availability
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON public.availability TO service_role;


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. APPOINTMENTS — adiciona FK para professionals (se ainda não existir)
--    A tabela já existe; apenas garantimos que professional_id pode referenciar
--    professionals sem erro.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS professional_id   UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professional_name TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id   TEXT,
  ADD COLUMN IF NOT EXISTS agent_id          UUID,
  ADD COLUMN IF NOT EXISTS summary           TEXT,
  ADD COLUMN IF NOT EXISTS tipo_consulta     TEXT,
  ADD COLUMN IF NOT EXISTS contact_id        TEXT;

-- Constraint tipo_consulta (idempotente via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_tipo_consulta_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_tipo_consulta_check
        CHECK (tipo_consulta IS NULL OR tipo_consulta IN ('presencial', 'online'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS appointments_professional_id_idx
  ON public.appointments (professional_id)
  WHERE professional_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_contact_id_idx
  ON public.appointments (contact_id)
  WHERE contact_id IS NOT NULL;

-- Backfill contact_id para agendamentos existentes
UPDATE public.appointments
SET    contact_id = user_id || '_' || client_phone
WHERE  contact_id IS NULL
  AND  client_phone IS NOT NULL
  AND  user_id IS NOT NULL;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. CONTACTS — adiciona 'Agendado' ao funil (se ainda não existir)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_status_funil_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_status_funil_check
    CHECK (status_funil IN ('Lead', 'Qualificado', 'Agendado', 'Resolvido'));

-- Normaliza eventuais valores 'agendado' (minúsculo) já existentes
UPDATE public.contacts
SET    status_funil = 'Agendado'
WHERE  status_funil = 'agendado';
