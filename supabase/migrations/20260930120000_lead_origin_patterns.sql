-- Detector de origem por frase cadastrada.
--
-- O clique em anúncio (CTWA) só cobre quem veio de mídia paga da Meta. A
-- maior parte da base chega por outros caminhos — link no site, indicação,
-- Google — e o único sinal disponível é o que a pessoa escreve na primeira
-- mensagem, porque o link já a instrui a mandar uma frase pronta
-- ("Olá! Quero agendar — lead via site").
--
-- Cada clínica cadastra as próprias frases: o que identifica o canal muda com
-- quem monta a campanha.

CREATE TABLE IF NOT EXISTS public.lead_origin_patterns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A frase procurada na mensagem. Comparada como substring, em minúsculas e
  -- sem acento — não é regex.
  pattern       TEXT NOT NULL,
  -- Slug gravado em contacts.source: 'instagram', 'google', 'site', ...
  source        TEXT NOT NULL DEFAULT 'meta_ads',
  -- Vira ad_tracking.headline: o que a clínica lê no relatório.
  campaign_name TEXT NOT NULL,
  description   TEXT,
  UNIQUE (user_id, pattern)
);

CREATE INDEX IF NOT EXISTS lead_origin_patterns_user_idx
  ON public.lead_origin_patterns (user_id);

-- Mesmo padrão das demais tabelas novas: só a service_role acessa; o frontend
-- fala com /api/v2/contacts/origin-patterns.
ALTER TABLE public.lead_origin_patterns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_origin_patterns FROM anon, authenticated;

-- A escolha do atendente vence qualquer detector.
--
-- Sem esta trava, quem corrige a origem à mão vê a correção ser desfeita na
-- mensagem seguinte, porque o detector por frase roda a cada mensagem
-- recebida. A coluna é o que o distingue de "ainda não foi detectado".
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS origin_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.contacts.origin_locked IS
  'Origem escolhida à mão pelo atendente. Nenhum detector sobrescreve.';
