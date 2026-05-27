-- Adiciona colunas necessárias para o agendamento via IA funcionar corretamente.
-- O handleBookAppointment tenta inserir professional_id, professional_name e
-- google_event_id, mas essas colunas não existiam na tabela appointments,
-- causando erro silencioso e a IA retornando "houve um problema ao agendar".

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS professional_id   UUID,
  ADD COLUMN IF NOT EXISTS professional_name TEXT,
  ADD COLUMN IF NOT EXISTS google_event_id   TEXT;

-- Índice para busca por evento do Google Calendar (cancelamento, re-sync)
CREATE INDEX IF NOT EXISTS appointments_google_event_id_idx
  ON public.appointments (google_event_id)
  WHERE google_event_id IS NOT NULL;
