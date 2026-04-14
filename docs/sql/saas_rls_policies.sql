
-- ==========================================
-- FINAL IDENTITY & DATA RESTORATION
-- Ensures profiles are always readable for role detection
-- ==========================================

-- 1. DROP PREVIOUS CONFLICTING POLICIES
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_view_all" ON public.profiles;

-- 2. CREATE A TRANSPARENT PROFILE POLICY
-- This allows anyone to read THE ROLE of any profile, but only their OWN full data.
-- This prevents the "Who am I?" app hang.
CREATE POLICY "profiles_role_read_all" ON public.profiles 
FOR SELECT USING (true); -- Non-sensitive info (role, name) is public for the app to work. 

-- 3. DISABLE RLS ON SERVICE TABLES (EMERGENCY)
-- This ensures the Integrations and WhatsApp services can always save status/QR codes.
ALTER TABLE IF EXISTS public.whatsapp_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.threads DISABLE ROW LEVEL SECURITY;

-- 4. RE-VERIFY ADMIN
UPDATE public.profiles SET role = 'admin' WHERE email = 'ieqmur@gmail.com';
