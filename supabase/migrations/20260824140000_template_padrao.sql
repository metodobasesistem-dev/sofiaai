-- Modelo de mensagem padrão do inquilino.
--
-- Quem dispara sempre com o mesmo texto tinha de escolhê-lo a cada campanha.
-- Com um modelo marcado como padrão, ele já vem selecionado no assistente.

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Só um padrão por inquilino. O índice parcial faz o banco garantir isso:
-- marcar um segundo modelo sem desmarcar o primeiro passa a ser impossível,
-- em vez de depender de o código lembrar de limpar o anterior.
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_um_padrao_por_tenant
  ON public.message_templates (tenant_id)
  WHERE is_default;

COMMENT ON COLUMN public.message_templates.is_default IS
  'Modelo pré-selecionado ao criar uma campanha. No máximo um por tenant.';
