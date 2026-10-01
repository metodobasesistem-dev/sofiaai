-- Modelos de follow-up: mensagens prontas para envio programado.
--
-- Diferente de quick_replies, e de propósito. Resposta rápida é para o
-- atendente DIGITAR depressa no meio da conversa: ela é colada no campo de
-- texto e enviada na hora. Um modelo de follow-up é enviado PELO SISTEMA,
-- sem ninguém na frente — lembrete de consulta, retorno, reativar quem ficou
-- em silêncio.
--
-- Daí as colunas que a outra não tem: `ativo`, porque um modelo desligado
-- precisa parar de ser enviado sem ser apagado; e `ordem`, porque quando mais
-- de um modelo serve ao mesmo gatilho é preciso saber qual vale.

CREATE TABLE IF NOT EXISTS public.follow_up_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- O rótulo que aparece no chip da lista ("Lembrete Consulta").
  nome       TEXT NOT NULL,

  -- O texto, com as variáveis entre chaves: {nome}, {data}, {hora}...
  conteudo   TEXT NOT NULL,

  -- Desligado continua cadastrado, mas não é usado em envio nenhum.
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,

  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, nome)
);

CREATE INDEX IF NOT EXISTS follow_up_templates_user_idx
  ON public.follow_up_templates (user_id, ordem);

-- Mesmo padrão das demais tabelas novas: só a service_role acessa; o frontend
-- fala com /api/v2/follow-up-templates.
ALTER TABLE public.follow_up_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.follow_up_templates FROM anon, authenticated;
