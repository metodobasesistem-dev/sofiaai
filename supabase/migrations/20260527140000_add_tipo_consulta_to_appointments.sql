-- Adiciona colunas para o sistema de agendamento via IA conforme documento técnico.
--
-- tipo_consulta: modalidade da consulta ('presencial' | 'online'), informada pelo cliente
--                durante o fluxo de conversa com o agente.
-- contact_id:    chave de referência ao contato ({user_id}_{phone}) para facilitar
--                buscas e relacionamentos sem depender só de client_phone.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS tipo_consulta TEXT,
  ADD COLUMN IF NOT EXISTS contact_id    TEXT;

-- Constraint de validação: aceita null (não informado) ou os valores válidos
-- Nota: IF NOT EXISTS não existe para ADD CONSTRAINT — usamos DO block para idempotência
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

-- Índice para busca de agendamentos por contato (usado no cancelamento)
CREATE INDEX IF NOT EXISTS appointments_contact_id_idx
  ON public.appointments (contact_id)
  WHERE contact_id IS NOT NULL;

-- Backfill: preenche contact_id para agendamentos existentes que possuem
-- client_phone e user_id preenchidos.
UPDATE public.appointments
SET    contact_id = user_id || '_' || client_phone
WHERE  contact_id IS NULL
  AND  client_phone IS NOT NULL
  AND  user_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.tipo_consulta IS 'Modalidade da consulta: presencial ou online. NULL quando não informado pelo cliente.';
COMMENT ON COLUMN public.appointments.contact_id    IS 'Referência ao contato no formato {user_id}_{phone}. Facilita buscas por agendamentos do mesmo contato.';
