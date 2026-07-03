-- Adiciona a coluna additional_info na tabela diagnostics para permitir o envio de contexto extra
ALTER TABLE diagnostics ADD COLUMN IF NOT EXISTS additional_info TEXT;
