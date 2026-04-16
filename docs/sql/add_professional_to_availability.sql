-- Altera a tabela de disponibilidade para suportar múltiplos profissionais
-- 1. Adiciona a coluna professional_id
ALTER TABLE public.availability 
ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE;

-- 2. Remove a restrição única antiga que permitia apenas uma agenda por usuário
ALTER TABLE public.availability DROP CONSTRAINT IF EXISTS availability_user_id_key;

-- 3. Adiciona nova restrição única (usuário + profissional)
-- Nota: se professional_id for NULL, considera como a agenda "geral" da conta
-- Para permitir apenas uma agenda geral E uma por profissional:
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_user_prof ON public.availability (user_id, COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMENT ON COLUMN public.availability.professional_id IS 'ID do profissional ao qual esta agenda pertence. Se nulo, é a agenda padrão da conta.';
