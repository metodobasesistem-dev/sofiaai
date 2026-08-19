-- Cria a tabela push_subscriptions.
--
-- CONTEXTO: o código sempre usou esta tabela (pushNotificationService.ts), mas
-- ela nunca foi criada — não existe migration nem definição em nenhum backup.
-- Resultado: POST /api/v2/push/subscribe devolvia 500
-- ("Could not find the table 'public.push_subscriptions' in the schema cache")
-- e NENHUMA notificação push funcionava: o envio também faz select aqui,
-- recebia erro e retornava em silêncio.
--
-- Schema espelha exatamente o que o serviço já espera:
--   user_id      → filtro do envio (.eq('user_id', userId))
--   subscription → objeto PushSubscription do browser, consultado por
--                  .contains('subscription', { endpoint }) — daí o índice GIN.
--
-- SEGURANÇA: RLS ligado e SEM policies. Só a service_role (backend) acessa;
-- o frontend nunca fala com esta tabela direto, sempre pela rota Express. Sem
-- policy, anon e authenticated não leem nada — é o cuidado que faltou em
-- n8n_chat_histories.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Envio busca todas as assinaturas de um usuário
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

-- Suporta o .contains('subscription', { endpoint: ... }) do serviço
CREATE INDEX IF NOT EXISTS push_subscriptions_subscription_gin_idx
  ON public.push_subscriptions USING GIN (subscription jsonb_path_ops);

-- Um endpoint (dispositivo/navegador) não pode existir duas vezes. O serviço
-- já checa antes de inserir, mas duas abas assinando ao mesmo tempo passariam
-- pela checagem e gerariam push duplicado no mesmo aparelho.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions ((subscription->>'endpoint'));

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
