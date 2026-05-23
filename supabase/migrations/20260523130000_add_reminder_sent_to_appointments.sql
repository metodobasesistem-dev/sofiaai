-- Adiciona coluna de controle de lembrete nos agendamentos
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
