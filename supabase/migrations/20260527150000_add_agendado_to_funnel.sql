-- Adiciona 'Agendado' como estágio válido do funil de contatos.
-- Quando o agente de IA confirma um agendamento, o contato é automaticamente
-- avançado para este estágio para refletir seu progresso no pipeline.

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_status_funil_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_status_funil_check
    CHECK (status_funil IN ('Lead', 'Qualificado', 'Agendado', 'Resolvido'));

-- Normaliza qualquer valor 'agendado' (minúsculo) já existente
UPDATE public.contacts
SET    status_funil = 'Agendado'
WHERE  status_funil = 'agendado';

COMMENT ON COLUMN public.contacts.status_funil IS 'Estágio no funil de vendas: Lead → Qualificado → Agendado → Resolvido';
