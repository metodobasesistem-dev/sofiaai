CREATE TABLE IF NOT EXISTS leo_insta_gatilhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  palavra_chave TEXT NOT NULL,
  mensagem_dm TEXT NOT NULL,
  resposta_comentario TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE leo_insta_gatilhos ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY "Enable access for own company triggers" ON leo_insta_gatilhos
    FOR ALL USING (auth.uid() = company_id);
