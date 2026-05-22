-- Colunas ausentes na tabela agents
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS training_mode TEXT        DEFAULT 'text'
                                         CHECK (training_mode IN ('text', 'audio'));

-- Tabela de conhecimento do agente
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  title      TEXT,
  content    TEXT,
  type       TEXT        DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_knowledge_owner" ON agent_knowledge
  USING (user_id = auth.uid());

-- Tabela de segredos do agente (tokens de integração)
CREATE TABLE IF NOT EXISTS agent_secrets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL,
  secret_key   TEXT        NOT NULL,
  secret_value TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agent_id, secret_key)
);

ALTER TABLE agent_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_secrets_owner" ON agent_secrets
  USING (user_id = auth.uid());
