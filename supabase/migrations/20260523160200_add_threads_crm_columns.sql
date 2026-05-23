-- Aplica as colunas de CRM em public.threads que estavam em docs/sql/update_threads_crm.sql
-- mas nunca foram promovidas para migration. O frontend (Inbox.tsx) usa todas elas.

ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS ticket_status TEXT DEFAULT 'open'
  CHECK (ticket_status IN ('open', 'pending', 'resolved'));

ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS assigned_to UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.labels (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text          NOT NULL,
  color       text          DEFAULT '#3B82F6',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labels_own" ON public.labels;
CREATE POLICY "labels_own" ON public.labels
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
