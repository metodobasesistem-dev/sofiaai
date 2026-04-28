-- Adicionar Status do Ticket (Metodologia Inbox Zero)
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS ticket_status TEXT DEFAULT 'open' CHECK (ticket_status IN ('open', 'pending', 'resolved'));

-- Adicionar Prioridade
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- Adicionar Atribuição de Usuário (Agent)
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Adicionar Etiquetas (Labels)
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;

-- Criar tabela de Etiquetas globais do sistema (Opcional, mas útil para autocomplete)
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Ativar RLS para a nova tabela de labels
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own labels" ON public.labels FOR ALL USING (auth.uid() = user_id);
