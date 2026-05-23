-- Fase 1: Vincula agente de IA por conversa
-- Adiciona agent_id na tabela threads para permitir seleção de agente por lead.
-- NULL = usa o primeiro agente ativo do usuário (comportamento padrão existente).

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

COMMENT ON COLUMN threads.agent_id IS
  'Agente de IA responsável por esta conversa. NULL = agente padrão (primeiro ativo do usuário).';
