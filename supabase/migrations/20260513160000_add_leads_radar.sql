-- Criar tabela para o Radar de Leads (Agente de Captação)
CREATE TABLE IF NOT EXISTS leads_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    rating DECIMAL(3,2),
    user_rating_count INTEGER,
    website TEXT,
    review_summary TEXT,
    place_id TEXT UNIQUE NOT NULL,
    niche TEXT,
    city TEXT,
    status TEXT DEFAULT 'novo' CHECK (status IN ('novo', 'qualificado', 'descartado', 'contatado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar coluna para a API Key do Google Maps nas configurações globais
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS google_maps_api_key TEXT;

-- Habilitar RLS para leads_radar
ALTER TABLE leads_radar ENABLE ROW LEVEL SECURITY;

-- Política para apenas administradores acessarem os leads
CREATE POLICY "Apenas administradores podem gerenciar leads_radar" 
ON leads_radar 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
