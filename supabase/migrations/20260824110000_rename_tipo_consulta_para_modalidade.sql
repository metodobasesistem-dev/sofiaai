-- Renomeia appointments.tipo_consulta para modalidade.
--
-- MOTIVO: o produto é um CRM para qualquer ramo, e "consulta" é vocabulário de
-- um segmento só. O campo nunca guardou tipo de consulta — guarda 'presencial'
-- ou 'online', que é a modalidade do atendimento em qualquer negócio.
--
-- SEGURANÇA DA OPERAÇÃO: a tabela tem 1 linha e nenhuma com o campo
-- preenchido; o agendamento mais recente é de maio. Um RENAME é instantâneo e
-- não reescreve dados, então não há bloqueio relevante.
--
-- ORDEM: rode este SQL DEPOIS que o deploy do código correspondente subir. O
-- código novo já grava em `modalidade`; enquanto a coluna não for renomeada,
-- criar agendamento com modalidade falharia. Com o deploy no ar primeiro, a
-- janela é apenas o intervalo entre o deploy e este comando.

ALTER TABLE public.appointments
  RENAME COLUMN tipo_consulta TO modalidade;

-- A constraint acompanha o nome antigo; recria com o novo para o schema não
-- ficar com um appointments_tipo_consulta_check pendurado numa coluna que já
-- não se chama assim.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_tipo_consulta_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_modalidade_check
    CHECK (modalidade IS NULL OR modalidade IN ('presencial', 'online'));

COMMENT ON COLUMN public.appointments.modalidade IS
  'Modalidade do atendimento: presencial ou online.';
