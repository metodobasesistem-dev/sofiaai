-- Migration: Add body column to message_templates for multi-provider support
ALTER TABLE message_templates 
ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';

-- Comment indicating purpose
COMMENT ON COLUMN message_templates.body IS 'O corpo da mensagem para uso com Evolution API e Uazapi. Variáveis são mapeadas dinamicamente.';
