-- Marca quando o contrato do cliente terminou, para o LTV parar de contar.
--
-- CONTEXTO: o LTV realizado é quanto o cliente já pagou —
-- mensalidade × períodos decorridos desde cliente_desde. Enquanto o contrato
-- está ativo, "até hoje" é a resposta certa. Depois que ele cancela, contar
-- até hoje infla o número para sempre: um cliente que ficou 3 meses e saiu em
-- janeiro apareceria com 12 meses de LTV em dezembro.
--
-- updated_at não serve para isso — muda a cada edição da ficha, então uma
-- correção de telefone anos depois aumentaria o LTV de um cliente que já saiu.

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS encerrado_em DATE;

COMMENT ON COLUMN public.client_profiles.encerrado_em IS
  'Data em que o contrato foi encerrado. Preenchida automaticamente quando '
  'status_contrato vira "cancelado" e limpa se o cliente voltar. Delimita o '
  'fim do período usado no cálculo do LTV realizado.';

-- Fichas já canceladas antes desta coluna existir: usa a data da última
-- alteração como melhor estimativa disponível do encerramento.
UPDATE public.client_profiles
SET    encerrado_em = updated_at::date
WHERE  status_contrato = 'cancelado'
  AND  encerrado_em IS NULL;
