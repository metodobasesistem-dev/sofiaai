-- Phase 4: Observability — AI interaction audit trail
-- One row per processIncoming() call. Tracks duration, cost, tools, outcome.
-- Written fire-and-forget (no blocking the agent response path).

CREATE TABLE IF NOT EXISTS ai_interaction_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  thread_id       text        NOT NULL,
  agent_id        uuid        REFERENCES agents(id) ON DELETE SET NULL,
  duration_ms     int         NOT NULL DEFAULT 0,
  model_used      text,
  tokens_in       int         NOT NULL DEFAULT 0,
  tokens_out      int         NOT NULL DEFAULT 0,
  cost_brl        numeric(10,6) NOT NULL DEFAULT 0,
  tool_calls_count int        NOT NULL DEFAULT 0,
  tool_names      text[]      DEFAULT '{}',
  outcome         text        NOT NULL
    CHECK (outcome IN ('responded', 'transferred', 'fallback', 'error')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_interaction_logs_user_time_idx
  ON ai_interaction_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_interaction_logs_thread_idx
  ON ai_interaction_logs (thread_id, created_at DESC);

-- RLS: users can only see their own logs
ALTER TABLE ai_interaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai logs"
  ON ai_interaction_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS for INSERT
CREATE POLICY "Service role can insert ai logs"
  ON ai_interaction_logs FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE ai_interaction_logs IS
  'Audit trail for every AI agent processIncoming() call. Used for cost tracking and performance observability.';
