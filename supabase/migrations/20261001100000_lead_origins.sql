-- Origens próprias da clínica.
--
-- O sistema já reconhece as origens que dependem de código para funcionar:
-- anúncio, impulsionamento, Instagram, Google, site. Elas existem porque há
-- um detector atrás de cada uma.
--
-- Esta tabela é para as que NÃO dependem de código: convênio, panfleto,
-- parceria com a academia da esquina. O sistema não tem como detectá-las
-- sozinho — alguém marca o lead à mão, ou cadastra uma frase que as aponte.
-- O que faltava era poder nomeá-las.
--
-- Por que não entram em lib/leadOrigin: aquelas categorias existem porque o
-- classificador toma decisões diferentes para cada uma (anúncio tem ID de
-- criativo, impulsionamento nunca terá nome de campanha). Uma origem própria
-- não muda decisão nenhuma — ela é um rótulo. Por isso cai em "Outros" na
-- hora de agrupar o relatório, e carrega o nome que a clínica deu onde o
-- lead aparece individualmente.

CREATE TABLE IF NOT EXISTS public.lead_origins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Vai para contacts.source. Derivado do nome e FIXO: renomear a origem não
  -- pode órfãos os contatos que já foram marcados com ela.
  slug       TEXT NOT NULL,
  nome       TEXT NOT NULL,

  -- Emoji, para o chip ficar reconhecível de relance como os nativos.
  emoji      TEXT NOT NULL DEFAULT '🏷️',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS lead_origins_user_idx
  ON public.lead_origins (user_id);

-- Mesmo padrão das demais tabelas novas: só a service_role acessa; o frontend
-- fala com /api/v2/contacts/origins.
ALTER TABLE public.lead_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_origins FROM anon, authenticated;

COMMENT ON TABLE public.lead_origins IS
  'Origens cadastradas pela clínica (convênio, panfleto). As nativas vivem em lib/leadOrigin.';
