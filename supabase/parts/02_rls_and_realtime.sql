-- PART 2: ROW LEVEL SECURITY (RLS) & REALTIME
-- Execute this block second in the Supabase SQL Editor.

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_instagram_interacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_insta_gatilhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sofia_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sofia_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_status_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_quality_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_radar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interaction_logs ENABLE ROW LEVEL SECURITY;

-- 1. Base Profiles Policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Base Client Modules Policies (Scoped by user_id)
CREATE POLICY "Users can manage their own agents" ON public.agents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own contacts" ON public.contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own threads" ON public.threads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own messages" ON public.messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own availability" ON public.availability FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own appointments" ON public.appointments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own channels" ON public.channels FOR ALL USING (auth.uid() = user_id);

-- 3. Global Settings & Feature Flags Policies
CREATE POLICY "Admins can manage global settings" ON public.global_settings FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Enable read access for all users" ON public.feature_flags FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for admins only" ON public.feature_flags FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 4. Leo Module Policies
CREATE POLICY "Enable access for own company leads" ON public.leo_leads FOR ALL USING (auth.uid() = company_id);
CREATE POLICY "Enable access for own company campaigns" ON public.leo_campanhas FOR ALL USING (auth.uid() = company_id);
CREATE POLICY "Enable access for own company config" ON public.leo_config FOR ALL USING (auth.uid() = company_id);
CREATE POLICY "Enable access for own company instagram interactions" ON public.leo_instagram_interacoes FOR ALL USING (auth.uid() IN (SELECT company_id FROM public.leo_leads WHERE id = public.leo_instagram_interacoes.lead_id));
CREATE POLICY "Enable access for own company triggers" ON public.leo_insta_gatilhos FOR ALL USING (auth.uid() = company_id);

-- 5. Campaigns & Templates Policies
CREATE POLICY "Users can manage their own campaigns" ON public.campaigns FOR ALL USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Users can manage their own campaign logs" ON public.campaign_logs FOR ALL USING (campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = auth.uid()));
CREATE POLICY "Users can manage their own templates" ON public.message_templates FOR ALL USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());

-- 6. Sofia Memory & Messages Policies
CREATE POLICY "Users can view their tenant's sofia_memory" ON public.sofia_memory FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their tenant's sofia_memory" ON public.sofia_memory FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())) WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can view their tenant's sofia_messages" ON public.sofia_messages FOR SELECT USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create sofia_messages for their tenant" ON public.sofia_messages FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- 7. Audit Logs & System Status Policies
CREATE POLICY provider_audit_log_admin_read ON public.provider_audit_log FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR target_user_id = auth.uid());
CREATE POLICY template_send_log_owner_read ON public.template_send_log FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY template_status_cache_owner_read ON public.template_status_cache FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "tenant_own_quality_history" ON public.template_quality_history FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "service_role_quality_history" ON public.template_quality_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Leads Radar Policies (Admins only)
CREATE POLICY "Apenas administradores podem gerenciar leads_radar" ON public.leads_radar FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 9. AI Interaction Logs Policies
CREATE POLICY "Users can read own ai logs" ON public.ai_interaction_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert ai logs" ON public.ai_interaction_logs FOR INSERT WITH CHECK (true);

-- 10. Enable Realtime Publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
