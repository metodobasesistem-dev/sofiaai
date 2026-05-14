-- Phase 2.1: Quality improvements for AI agents
-- Adds tone of voice configuration and forbidden topics to agents table.
-- Both fields are optional (NULL means default: neutro/none).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tone_of_voice TEXT
    CHECK (tone_of_voice IN ('formal', 'casual', 'tecnico', 'amigavel', 'consultivo')),
  ADD COLUMN IF NOT EXISTS forbidden_topics TEXT,
  ADD COLUMN IF NOT EXISTS conversation_examples TEXT;

COMMENT ON COLUMN agents.tone_of_voice IS
  'Tom de voz do agente: formal | casual | tecnico | amigavel | consultivo. NULL = neutro.';
COMMENT ON COLUMN agents.forbidden_topics IS
  'Assuntos que o agente NUNCA deve responder (um por linha). Ex: "Política", "Diagnóstico médico".';
COMMENT ON COLUMN agents.conversation_examples IS
  'Exemplos de diálogos (few-shot) que calibram o tom desejado. Formato livre.';
