-- Cria tabela quick_replies usada pela aba "Atalhos" no Inbox.
-- Backend (src/backend/routes/quickReplyApiRoutes.ts) acessa via service_role,
-- mas mantemos RLS para defesa em profundidade caso alguém acesse direto.

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text          NOT NULL,
  content     text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_replies_user_idx ON public.quick_replies (user_id, created_at DESC);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quick_replies_own" ON public.quick_replies;
CREATE POLICY "quick_replies_own" ON public.quick_replies
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
