-- Qual modelo o sistema usa em cada envio automático.
--
-- Sem isto, ligar o lembrete de consulta aos modelos seria adivinhação: o
-- nome é livre ("Lembrete Consulta", "Lembrete de retorno", "AVISO"), e
-- procurar por texto quebraria no dia em que a clínica renomeasse o modelo —
-- em silêncio, parando de avisar o paciente sem ninguém perceber.
--
-- `gatilho` nulo = modelo de uso livre, só para envio manual. Com valor, ele
-- é O modelo daquele envio automático.

ALTER TABLE public.follow_up_templates
  ADD COLUMN IF NOT EXISTS gatilho TEXT;

-- Só um modelo por gatilho, por clínica: dois candidatos ao mesmo envio
-- deixariam a escolha para a ordem do banco, que é indefinida.
CREATE UNIQUE INDEX IF NOT EXISTS follow_up_templates_gatilho_idx
  ON public.follow_up_templates (user_id, gatilho)
  WHERE gatilho IS NOT NULL;

COMMENT ON COLUMN public.follow_up_templates.gatilho IS
  'Envio automático que usa este modelo (ex: lembrete_consulta). Nulo = só envio manual.';
