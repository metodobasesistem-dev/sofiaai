-- Mensagens programadas: o atendente escolhe o texto e a hora, o sistema envia.
--
-- O QUE FICA GUARDADO É O TEXTO FINAL, já com as variáveis trocadas, e não o
-- modelo que o originou. É de propósito: o atendente vê a prévia antes de
-- confirmar, e o que ele leu é o que o paciente recebe. Guardar a referência
-- faria editar o modelo depois mudar, em silêncio, mensagens já agendadas.

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Mesma chave das threads ({userId}_{telefone}), para listar na conversa.
  thread_id   TEXT NOT NULL,
  -- Normalizado, que é o que o envio precisa.
  telefone    TEXT NOT NULL,

  conteudo    TEXT NOT NULL,
  enviar_em   TIMESTAMPTZ NOT NULL,

  status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'enviada', 'cancelada', 'falhou')),

  -- Por que falhou, para o atendente saber em vez de só ver que não saiu.
  erro        TEXT,
  enviada_em  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- De qual modelo veio, só para referência. ON DELETE SET NULL: apagar o
  -- modelo não pode apagar uma mensagem que já está agendada.
  template_id UUID REFERENCES public.follow_up_templates(id) ON DELETE SET NULL
);

-- O índice do worker: ele só procura o que está pendente e já venceu.
CREATE INDEX IF NOT EXISTS scheduled_messages_pendentes_idx
  ON public.scheduled_messages (enviar_em)
  WHERE status = 'pendente';

-- O índice da tela: as mensagens daquela conversa.
CREATE INDEX IF NOT EXISTS scheduled_messages_thread_idx
  ON public.scheduled_messages (user_id, thread_id, enviar_em);

-- Mesmo padrão das demais tabelas novas: só a service_role acessa; o frontend
-- fala com /api/v2/scheduled-messages.
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_messages FROM anon, authenticated;
