-- Enable the pgvector extension to work with embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create sofia_memory table for long-term storage of knowledge
CREATE TABLE IF NOT EXISTS sofia_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  content TEXT NOT NULL,
  embedding vector(1536), -- Optimized for text-embedding-3-small
  category TEXT, -- e.g., 'preference', 'business_rule', 'goal', 'history'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sofia_messages table for the direct chat history with the admin
CREATE TABLE IF NOT EXISTS sofia_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sofia_memory_tenant ON sofia_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sofia_messages_tenant ON sofia_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sofia_messages_user ON sofia_messages(user_id);

-- Vector index for semantic search (HNSW)
-- Note: cosine similarity is common for embeddings
CREATE INDEX IF NOT EXISTS idx_sofia_memory_embedding ON sofia_memory USING hnsw (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE sofia_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sofia_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for sofia_memory
CREATE POLICY "Users can view their tenant's sofia_memory" 
ON sofia_memory FOR SELECT 
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage their tenant's sofia_memory" 
ON sofia_memory FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Create policies for sofia_messages
CREATE POLICY "Users can view their tenant's sofia_messages" 
ON sofia_messages FOR SELECT 
USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create sofia_messages for their tenant" 
ON sofia_messages FOR INSERT 
WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
