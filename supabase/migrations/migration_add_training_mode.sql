-- Adicionar modo de treinamento aos agentes
ALTER TABLE agents ADD COLUMN IF NOT EXISTS training_mode TEXT DEFAULT 'text' CHECK (training_mode IN ('text', 'audio'));

-- Comentário explicativo
COMMENT ON COLUMN agents.training_mode IS 'Define se o agente usa o conhecimento textual manual ou os blocos de áudio transcritos.';
