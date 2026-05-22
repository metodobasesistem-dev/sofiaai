-- Adiciona colunas de automação que o frontend já usa mas não existiam na tabela agents
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS appointment_duration INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS response_delay       INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS follow_ups           JSONB,
  ADD COLUMN IF NOT EXISTS reminders            JSONB;
