-- PART 5: MONITORING TABLES & MISSING COLUMNS
-- Execute this block fifth in the Supabase SQL Editor.

-- 1. Ensure whatsapp_qr column exists in public.profiles
-- This stores the temporary QR Code base64 image for the user to scan.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_qr TEXT;

-- 2. Create sys_health table for system status monitoring
CREATE TABLE IF NOT EXISTS public.sys_health (
    id TEXT PRIMARY KEY,
    last_run TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    metadata JSONB
);

-- 3. Create sys_health_history table for system status change history
CREATE TABLE IF NOT EXISTS public.sys_health_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id TEXT NOT NULL,
    status TEXT NOT NULL,
    previous_status TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS on the new monitoring tables
ALTER TABLE public.sys_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_health_history ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for the monitoring tables
-- Allows authenticated users (like front-end admins) to read monitoring data
CREATE POLICY "Allow authenticated read access on sys_health" ON public.sys_health
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read access on sys_health_history" ON public.sys_health_history
    FOR SELECT TO authenticated USING (true);

-- 6. Add profiles and sys_health to Supabase Realtime Publication
-- This lets the frontend receive instant updates for QR code changes and service statuses.
-- We use a DO block to avoid errors if the publication is already set up.
DO $$
BEGIN
  -- Try to add profiles to publication if it exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN duplicate_object THEN
      -- Table is already in the publication, ignore
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.sys_health;
    EXCEPTION WHEN duplicate_object THEN
      -- Table is already in the publication, ignore
    END;
  END IF;
END $$;
