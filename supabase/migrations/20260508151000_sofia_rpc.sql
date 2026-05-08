-- Function to match sofia memory using vector similarity
CREATE OR REPLACE FUNCTION match_sofia_memory (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sofia_memory.id,
    sofia_memory.content,
    1 - (sofia_memory.embedding <=> query_embedding) AS similarity
  FROM sofia_memory
  WHERE 1 - (sofia_memory.embedding <=> query_embedding) > match_threshold
    AND sofia_memory.tenant_id = p_tenant_id
  ORDER BY sofia_memory.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
