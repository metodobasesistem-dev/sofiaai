-- Leads do Leo
CREATE TABLE IF NOT EXISTS leo_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT,
  telefone TEXT,
  instagram_uid TEXT,
  origem TEXT, -- qual campanha trouxe
  plataforma TEXT, -- instagram ou whatsapp_direto
  status TEXT DEFAULT 'novo', -- novo, qualificado, passado_sofia, convertido, perdido
  score INTEGER DEFAULT 0,
  interesse TEXT,
  orcamento TEXT,
  interacoes_instagram INTEGER DEFAULT 0,
  contexto_conversa JSONB,
  passado_sofia_em TIMESTAMPTZ,
  feedback_sofia TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Campanhas vinculadas ao Leo
CREATE TABLE IF NOT EXISTS leo_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  meta_campaign_id TEXT,
  nome TEXT,
  status TEXT,
  orcamento NUMERIC,
  gasto NUMERIC,
  leads_gerados INTEGER DEFAULT 0,
  custo_por_lead NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Configurações do Leo por empresa
CREATE TABLE IF NOT EXISTS leo_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  mensagem_inicial TEXT,
  perguntas_qualificacao JSONB,
  score_minimo INTEGER DEFAULT 70,
  timeout_inatividade INTEGER DEFAULT 24,
  instagram_access_token TEXT,
  instagram_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Interações do Instagram
CREATE TABLE IF NOT EXISTS leo_instagram_interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leo_leads(id) ON DELETE CASCADE,
  tipo TEXT, -- comentario, dm_enviada, dm_recebida
  conteudo TEXT,
  instagram_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE leo_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_instagram_interacoes ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (Isolamento por company_id/profile_id)
CREATE POLICY "Enable access for own company leads" ON leo_leads
    FOR ALL USING (auth.uid() = company_id);

CREATE POLICY "Enable access for own company campaigns" ON leo_campanhas
    FOR ALL USING (auth.uid() = company_id);

CREATE POLICY "Enable access for own company config" ON leo_config
    FOR ALL USING (auth.uid() = company_id);

CREATE POLICY "Enable access for own company instagram interactions" ON leo_instagram_interacoes
    FOR ALL USING (auth.uid() IN (SELECT company_id FROM leo_leads WHERE id = leo_instagram_interacoes.lead_id));
