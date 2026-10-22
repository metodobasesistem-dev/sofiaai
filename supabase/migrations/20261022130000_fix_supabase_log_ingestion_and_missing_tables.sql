-- MIGRATION: 20261022130000_fix_supabase_log_ingestion_and_missing_tables.sql
-- Resolves Postgres error flood, missing tables and columns causing excessive Supabase Log Ingestion.

-- 1. Create sys_health table for system status monitoring if not exists
CREATE TABLE IF NOT EXISTS public.sys_health (
    id TEXT PRIMARY KEY,
    last_run TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL,
    metadata JSONB
);

-- 2. Create sys_health_history table for system status change history if not exists
CREATE TABLE IF NOT EXISTS public.sys_health_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id TEXT NOT NULL,
    status TEXT NOT NULL,
    previous_status TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on monitoring tables
ALTER TABLE public.sys_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_health_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for sys_health
DROP POLICY IF EXISTS "Allow authenticated read access on sys_health" ON public.sys_health;
CREATE POLICY "Allow authenticated read access on sys_health" ON public.sys_health
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon read access on sys_health" ON public.sys_health;
CREATE POLICY "Allow anon read access on sys_health" ON public.sys_health
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow service role full access on sys_health" ON public.sys_health;
CREATE POLICY "Allow service role full access on sys_health" ON public.sys_health
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. RLS Policies for sys_health_history
DROP POLICY IF EXISTS "Allow authenticated read access on sys_health_history" ON public.sys_health_history;
CREATE POLICY "Allow authenticated read access on sys_health_history" ON public.sys_health_history
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow service role full access on sys_health_history" ON public.sys_health_history;
CREATE POLICY "Allow service role full access on sys_health_history" ON public.sys_health_history
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Ensure global_settings has all required columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'global_settings') THEN
    ALTER TABLE public.global_settings
      ADD COLUMN IF NOT EXISTS allow_signups BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 10,
      ADD COLUMN IF NOT EXISTS admin_notification_phone TEXT,
      ADD COLUMN IF NOT EXISTS admin_notification_user_id UUID,
      ADD COLUMN IF NOT EXISTS support_whatsapp TEXT;
  END IF;
END $$;

-- 7. Ensure profiles has whatsapp_qr and other sync columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_qr TEXT;

-- 8. Add sys_health and profiles to Supabase Realtime Publication safely
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.sys_health;
    EXCEPTION WHEN duplicate_object THEN
      -- Already added
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN duplicate_object THEN
      -- Already added
    END;
  END IF;
END $$;
