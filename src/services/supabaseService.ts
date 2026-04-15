import { supabase } from '../lib/supabase';

export interface KnowledgeItem {
  id: string;
  type: 'qa' | 'text' | 'document';
  title?: string;
  content?: string;
  question?: string;
  answer?: string;
  fileName?: string;
  createdAt: string;
}

export interface Agent {
  id?: string;
  userId: string;
  nome: string;
  nicho?: string;
  prompt_base?: string;
  status_ativo: boolean;
  companyName?: string;
  companyAddress?: string;
  professionalName?: string;
  companyDescription?: string;
  companyProducts?: string;
  companyFAQ?: string;
  companyLinks?: string;
  voice_mode?: 'disabled' | 'always' | 'audio_only';
  voice_id?: string;
  knowledgeBase?: KnowledgeItem[];
  followUps?: {
    delayMinutes: number;
    extraPrompt: string;
  }[];
  reminders?: {
    mode: string;
    hoursBefore: number;
    message: string;
    sendAfterTime: boolean;
  }[];
  appointmentDuration?: number;
}

export interface Professional {
  id?: string;
  userId: string;
  agentId?: string;
  name: string;
  specialties: string;
  googleCalendarId?: string;
  bio?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Contact {
  id?: string;
  userId: string;
  nome: string;
  telefone: string;
  status_funil: 'Lead' | 'Qualificado' | 'Cliente';
  data_criacao: string;
  ultimaMensagem?: string;
  ultimaInteracao?: string;
  primeiroContato?: string;
  totalMensagens?: number;
  source?: 'whatsapp' | 'manual';
}

export interface UserProfile {
  id: string;
  email: string;
  nome_completo?: string;
  name?: string; 
  photo_url?: string;
  role: 'admin' | 'client';
  whatsapp_status: 'connected' | 'disconnected' | 'connecting';
  whatsapp_instance_id?: string;
  created_at?: string;
  updated_at?: string;
  nome_empresa?: string;
  whatsapp_organizacao?: string;
  descricao_empresa?: string;
  produtos_servicos?: string;
  faq?: string;
  links_importantes?: string;
  plano?: string;
  google_calendar_active?: boolean;
  google_calendar_email?: string;
  selected_calendar_id?: string;
  notification_phone?: string;
  nicho?: string;
  trial_ends_at?: string;
}

export interface AvailabilityConfig {
  userId: string;
  weekly: any[];
  specificDates: any[];
}

export interface QuickReply {
  id?: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface Appointment {
  id?: string;
  userId: string;
  clientName: string;
  clientPhone: string;
  date: string;
  time: string;
  duration: number;
  niche: string;
  summary: string;
  agentId: string;
  agentName: string;
  professionalId?: string;
  professionalName?: string;
  createdAt: string;
}

export interface Channel {
  id?: string;
  user_id: string;
  nome: string;
  agentId: string;
  tipo: 'whatsapp' | 'chat' | 'telegram';
  status: 'ativo' | 'inativo';
  created_at?: string;
}

/**
 * Agents (Email-Anchored RPCs — resilientes a user_id OAuth mismatch)
 */
const AGENTS_CACHE_KEY = (email: string) => `wppai_agents_${email}`;

export const getCachedAgents = (email: string): Agent[] => {
  try {
    const raw = localStorage.getItem(AGENTS_CACHE_KEY(email));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

export const setCachedAgents = (email: string, agents: Agent[]) => {
  try {
    localStorage.setItem(AGENTS_CACHE_KEY(email), JSON.stringify(agents));
  } catch {}
};

export const clearAgentFromCache = (email: string, agentId: string) => {
  try {
    const cached = getCachedAgents(email);
    setCachedAgents(email, cached.filter(a => a.id !== agentId));
  } catch {}
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const mapAgents = (data: any[]): Agent[] =>
  data.map((a: any) => ({
    id: a.id,
    userId: a.user_id,
    nome: a.nome,
    nicho: a.nicho,
    prompt_base: a.prompt_base,
    status_ativo: a.status_ativo ?? true,
    companyName: a.company_name,
    companyAddress: a.company_address,
    professionalName: a.professional_name,
    companyDescription: a.company_description,
    companyProducts: a.company_products,
    companyFAQ: a.company_faq,
    companyLinks: a.company_links,
    voice_mode: a.voice_mode,
    voice_id: a.voice_id,
    knowledgeBase: a.knowledge_base,
    followUps: a.follow_ups,
    reminders: a.reminders,
    appointmentDuration: a.appointment_duration
  }));

export const listAgents = async (): Promise<Agent[]> => {
  const fetchDirect = async (): Promise<Agent[]> => {
    // getSession() lê do localStorage — instantâneo após F5, sem rede
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      console.warn('[listAgents] Sem sessão disponível');
      return [];
    }

    console.log('[listAgents] Buscando para user_id:', user.id, '/', user.email);

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listAgents] Erro SELECT:', error.message);
      throw error;
    }

    const agents = mapAgents(data || []);
    console.log('[listAgents] Encontrados:', agents.length, 'agentes');
    if (user.email && agents.length > 0) setCachedAgents(user.email, agents);
    return agents;
  };

  const timeoutFallback = new Promise<Agent[]>(resolve =>
    setTimeout(() => {
      console.warn('[listAgents] Timeout 10s');
      resolve([]);
    }, 10000)
  );

  try {
    return await Promise.race([fetchDirect(), timeoutFallback]);
  } catch (err: any) {
    console.error('[listAgents] falha:', err.message);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (email) return getCachedAgents(email);
    } catch {}
    return [];
  }
};

/**
 * Cria agente via INSERT direto na tabela agents
 */
export const createAgent = async (agentData: Omit<Agent, 'id' | 'userId'>) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    console.log('[createAgent] Inserindo direto na tabela agents para:', user.id);

    const { data, error } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        nome: agentData.nome,
        nicho: agentData.nicho || '',
        prompt_base: agentData.prompt_base || '',
        status_ativo: agentData.status_ativo ?? true,
        company_name: agentData.companyName || '',
        company_address: agentData.companyAddress || '',
        professional_name: agentData.professionalName || '',
        company_description: agentData.companyDescription || '',
        company_products: agentData.companyProducts || '',
        company_faq: agentData.companyFAQ || '',
        company_links: agentData.companyLinks || '',
        voice_mode: agentData.voice_mode || 'disabled',
        voice_id: agentData.voice_id || 'alloy',
        knowledge_base: agentData.knowledgeBase || [],
        follow_ups: agentData.followUps || [],
        reminders: agentData.reminders || [],
        appointment_duration: agentData.appointmentDuration || 30
      })
      .select()
      .single();

    if (error) {
      console.error('[createAgent] Erro no INSERT:', error.message, error.code);
      throw new Error(error.message);
    }

    console.log('[createAgent] ✅ Agente criado com sucesso, id:', data?.id);
    return data;
  } catch (err: any) {
    console.error('[createAgent] Falha:', err.message);
    throw err;
  }
};

/**
 * Atualiza agente via UPDATE direto na tabela agents
 */
export const updateAgent = async (agentId: string, agentData: Partial<Agent>) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    console.log('[updateAgent] Atualizando agente id:', agentId);

    const { error } = await supabase
      .from('agents')
      .update({
        nome: agentData.nome,
        nicho: agentData.nicho,
        prompt_base: agentData.prompt_base,
        status_ativo: agentData.status_ativo,
        company_name: agentData.companyName,
        company_address: agentData.companyAddress,
        professional_name: agentData.professionalName,
        company_description: agentData.companyDescription,
        company_products: agentData.companyProducts,
        company_faq: agentData.companyFAQ,
        company_links: agentData.companyLinks,
        voice_mode: agentData.voice_mode,
        voice_id: agentData.voice_id,
        appointment_duration: agentData.appointmentDuration,
        knowledge_base: agentData.knowledgeBase,
        follow_ups: agentData.followUps,
        reminders: agentData.reminders,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .eq('user_id', user.id); // Security: only update own agents

    if (error) {
      console.error('[updateAgent] Erro no UPDATE:', error.message, error.code);
      throw new Error(error.message);
    }

    console.log('[updateAgent] ✅ Agente atualizado com sucesso.');
  } catch (err: any) {
    console.error('[updateAgent] Falha:', err.message);
    throw err;
  }
};

export const toggleAgentStatus = async (agentId: string, currentStatus: boolean) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const newStatus = !currentStatus;

  // Se ativando, desativa todos os outros agentes do usuário primeiro
  if (newStatus) {
    const { data: myAgents } = await supabase
      .from('agents')
      .select('id, status_ativo')
      .eq('user_id', user.id)
      .neq('id', agentId)
      .eq('status_ativo', true);

    if (myAgents && myAgents.length > 0) {
      await supabase
        .from('agents')
        .update({ status_ativo: false })
        .eq('user_id', user.id)
        .neq('id', agentId);
    }
  }

  // Atualiza o status do agente alvo via UPDATE direto
  const { error } = await supabase
    .from('agents')
    .update({ status_ativo: newStatus })
    .eq('id', agentId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[toggleAgentStatus] Erro:', error.message);
    throw error;
  }
};

export const deleteAgent = async (agentId: string) => {
  // Timeout de segurança: nunca travar por mais de 5s
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Tempo esgotado. Verifique sua conexão.')), 5000)
  );

  const deletePromise = supabase
    .from('agents')
    .delete()
    .eq('id', agentId);

  const result = await Promise.race([deletePromise, timeoutPromise]);
  const { error } = result as any;

  if (error) {
    console.error('[deleteAgent] Erro:', error.message);
    throw new Error(error.message);
  }

  console.log('[deleteAgent] Agente excluído:', agentId);
};

/**
 * Contacts
 */
export const listContacts = async (): Promise<Contact[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Admin Bypass via role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  let query = supabase.from('contacts').select('*');
  
  if (!isAdmin) {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[SupabaseService] listContacts error:', error);
    throw error;
  }
  return (data || []).map(c => ({
    id: c.id,
    userId: c.user_id,
    nome: c.nome,
    telefone: c.telefone,
    status_funil: c.status_funil as any,
    data_criacao: c.data_criacao,
    ultimaMensagem: c.ultima_mensagem,
    ultimaInteracao: c.ultima_interacao,
    primeiroContato: c.primeiro_contato,
    totalMensagens: c.total_mensagens,
    source: c.source as any
  }));
};

/**
 * Professionals
 */
export const listProfessionals = async (): Promise<Professional[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('user_id', user.id);
  
  if (error) throw error;
  
  return (data || []).map(p => ({
    id: p.id,
    userId: p.user_id,
    agentId: p.agent_id,
    name: p.name,
    specialties: p.specialties,
    googleCalendarId: p.google_calendar_id,
    bio: p.bio,
    isActive: p.is_active,
    createdAt: p.created_at
  }));
};

export const upsertProfessional = async (pData: Partial<Professional>) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const payload = {
    user_id: user.id,
    agent_id: pData.agentId,
    name: pData.name,
    specialties: pData.specialties,
    google_calendar_id: pData.googleCalendarId,
    bio: pData.bio,
    is_active: pData.isActive ?? true
  };

  if (pData.id) {
    const { error } = await supabase
      .from('professionals')
      .update(payload)
      .eq('id', pData.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('professionals')
      .insert(payload);
    if (error) throw error;
  }
};

export const deleteProfessional = async (id: string) => {
  const { error } = await supabase
    .from('professionals')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const createContact = async (contactData: Omit<Contact, 'id' | 'userId' | 'data_criacao' | 'primeiroContato' | 'totalMensagens'>) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const cleanPhone = contactData.telefone.replace(/\D/g, '');
  const { data, error } = await supabase
    .from('contacts')
    .upsert({
      user_id: user.id,
      nome: contactData.nome,
      telefone: cleanPhone,
      status_funil: contactData.status_funil || 'Lead',
      source: contactData.source || 'manual',
      data_criacao: new Date().toISOString(),
      primeiro_contato: new Date().toISOString(),
      total_mensagens: 0
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const listContactAppointments = async (phone: string): Promise<Appointment[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const cleanPhone = phone.replace(/\D/g, '');
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .eq('client_phone', cleanPhone)
    .eq('status', 'confirmed');

  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id,
    userId: a.user_id,
    clientName: a.client_name,
    clientPhone: a.client_phone,
    date: a.data,
    time: a.time,
    duration: 30,
    niche: '',
    summary: a.summary,
    agentId: a.agent_id,
    agentName: '',
    createdAt: a.created_at
  }));
};

export const updateContactFunilStatus = async (contactId: string, status: Contact['status_funil']) => {
  const { error } = await supabase
    .from('contacts')
    .update({ status_funil: status })
    .eq('id', contactId);
  
  if (error) throw error;
};

export const deleteContact = async (contactId: string) => {
  // Note: threads would need to be deleted too if we want parity
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId);
  
  if (error) throw error;
};

/**
 * Profiles
 */
export const getUserProfile = async (passedUserId?: string): Promise<UserProfile | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Admin mestre: retorna perfil direto sem consultar banco
    if (user.email === 'ieqmur@gmail.com') {
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || 'Admin';
      return {
        id: user.id,
        email: user.email,
        nome_completo: fullName,
        name: fullName,
        role: 'admin',
        whatsapp_status: 'connected'
      };
    }

    // Para clientes: busca por email (resiliente a user_id mismatch pós-OAuth)
    const { data, error } = await supabase.rpc('get_my_profile');

    if (error) {
      console.error('[getUserProfile] Erro no RPC:', error.message);
    }

    const profile = Array.isArray(data) ? data[0] : data;

    if (profile) {
      const finalFullName = profile.nome_completo || profile.full_name || '';
      return {
        id: profile.id,
        email: profile.email,
        nome_completo: finalFullName,
        name: finalFullName,
        role: profile.role,
        whatsapp_status: profile.whatsapp_status,
        google_calendar_active: profile.google_calendar_active ?? false,
        google_calendar_email: profile.google_calendar_email,
        selected_calendar_id: profile.selected_calendar_id,
        nome_empresa: profile.nome_empresa,
        plano: profile.plano,
        notification_phone: profile.notification_phone,
        nicho: profile.nicho,
        trial_ends_at: profile.trial_ends_at
      };
    }

    // Fallback se perfil ainda não existe no banco
    const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || '';
    return {
      id: user.id,
      email: user.email || '',
      nome_completo: fallbackName,
      name: fallbackName,
      role: 'client',
      whatsapp_status: 'disconnected',
      google_calendar_active: false
    };
  } catch (err) {
    console.error('[getUserProfile] Erro:', err);
    return null;
  }
};

export const updateUserProfile = async (profileData: Partial<UserProfile> & { google_refresh_token?: string, google_calendar_active?: boolean, google_calendar_email?: string | null }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Remover campos que não existem na tabela
  const { ...cleanData } = profileData;
  delete (cleanData as any).id;
  delete (cleanData as any).created_at;
  delete (cleanData as any).whatsapp_instance_id;

  console.log('[updateUserProfile] Salvando:', Object.keys(cleanData));

  // Buscar o profile id real pelo email (resiliente a user_id mismatch pós-OAuth)
  const { data: profileData2 } = await supabase.rpc('get_my_profile');
  const realProfile = Array.isArray(profileData2) ? profileData2[0] : profileData2;
  const profileId = realProfile?.id || user.id;

  const { error } = await supabase
    .from('profiles')
    .update(cleanData)
    .eq('id', profileId);

  if (error) {
    console.error('[updateUserProfile] Erro:', error.message);
    throw error;
  }
};

/**
 * Availability
 */
export const getAvailability = async (): Promise<AvailabilityConfig | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('availability')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data ? { userId: data.user_id, weekly: data.config.weekly, specificDates: data.config.specificDates } : null;
};

export const saveAvailability = async (config: Omit<AvailabilityConfig, 'userId'>) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('availability')
    .upsert({
      user_id: user.id,
      config: config
    });

  if (error) throw error;
};

/**
 * Appointments
 */
export const listAppointments = async (): Promise<Appointment[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Admin Bypass via role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  let query = supabase.from('appointments').select('*').eq('status', 'confirmed');
  
  if (!isAdmin) {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[SupabaseService] listAppointments error:', error);
    throw error;
  }
  return (data || []).map(a => ({
    id: a.id,
    userId: a.user_id,
    clientName: a.client_name,
    clientPhone: a.client_phone,
    date: a.data,
    time: a.time,
    duration: a.duration || 30,
    niche: a.niche || '',
    summary: a.summary,
    agentId: a.agent_id,
    agentName: a.agent_name || 'IA',
    createdAt: a.created_at
  }));
};

export const deleteAppointment = async (id: string) => {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
  const mapping: any = {};
  if (updates.clientName) mapping.client_name = updates.clientName;
  if (updates.clientPhone) mapping.client_phone = updates.clientPhone;
  if (updates.date) mapping.data = updates.date;
  if (updates.time) mapping.time = updates.time;
  if (updates.niche) mapping.niche = updates.niche;
  if (updates.summary) mapping.summary = updates.summary;
  
  const { error } = await supabase
    .from('appointments')
    .update(mapping)
    .eq('id', id);
  if (error) throw error;
};

/**
 * Channels
 */
export const listChannels = async (): Promise<Channel[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  let query = supabase.from('channels').select('*');
  
  if (!isAdmin) {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id,
    user_id: c.user_id,
    nome: c.nome,
    agentId: c.agent_id,
    tipo: c.tipo as any,
    status: c.status as any,
    created_at: c.created_at
  }));
};

export const createChannel = async (channelData: Omit<Channel, 'id' | 'user_id' | 'created_at'>) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('channels')
    .insert({
      user_id: user.id,
      nome: channelData.nome,
      agent_id: channelData.agentId,
      tipo: channelData.tipo,
      status: channelData.status
    })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    agentId: data.agent_id // Map back to camelCase for frontend consistency
  };
};

export const deleteChannel = async (channelId: string) => {
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);
  
  if (error) throw error;
};

/**
 * Dashboard & Analytics
 */
export const getDashboardStats = async (passedUserId?: string) => {
  let userId = passedUserId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { contacts: 0, appointments: 0, messages: 0, qualified: 0, conversionRate: 0, avgScore: 0 };
    userId = user.id;
  }

  const [contactsCount, qualifiedCount, appointmentsCount] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_funil', 'Qualificado'),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'confirmed')
  ]);

  if (contactsCount.error) console.error('[DashboardStats] Contacts fetch error:', contactsCount.error);
  if (appointmentsCount.error) console.error('[DashboardStats] Appts fetch error:', appointmentsCount.error);

  const totalLeads = contactsCount.count || 0;
  const totalAppts = appointmentsCount.count || 0;

  return {
    contacts: totalLeads,
    qualified: qualifiedCount.count || 0,
    appointments: totalAppts,
    conversionRate: totalLeads > 0 ? Math.round((totalAppts / totalLeads) * 100) : 0,
    avgScore: 0,
    messages: 0 
  };
};

export const getGlobalDashboardStats = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { contacts: 0, appointments: 0, messages: 0, qualified: 0, conversionRate: 0, avgScore: 0 };

  const [contactsCount, qualifiedCount, appointmentsCount] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status_funil', 'Qualificado'),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'confirmed')
  ]);

  const totalLeads = contactsCount.count || 0;
  const totalAppts = appointmentsCount.count || 0;

  return {
    contacts: totalLeads,
    qualified: qualifiedCount.count || 0,
    appointments: totalAppts,
    conversionRate: totalLeads > 0 ? Math.round((totalAppts / totalLeads) * 100) : 0,
    avgScore: 0,
    messages: 0 
  };
};

export const getRecentActivities = async (passedUserId?: string) => {
  let userId = passedUserId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    userId = user.id;
  }

  const [contacts, appointments] = await Promise.all([
    supabase.from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('data_criacao', { ascending: false })
      .limit(5),
    supabase.from('appointments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(5)
  ]);

  const activities = [
    ...(contacts.data || []).map(c => ({
      type: 'contact',
      title: 'Novo Lead',
      description: `${c.nome} entrou em contato`,
      time: c.data_criacao,
      name: c.nome,
      phone: c.telefone
    })),
    ...(appointments.data || []).map(a => ({
      type: 'appointment',
      title: 'Novo Agendamento',
      description: `Agendamento marcado com ${a.client_name}`,
      time: a.created_at,
      name: a.client_name,
      phone: a.client_phone
    }))
  ];

  return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);
};

export const getGlobalRecentActivities = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const [contacts, appointments] = await Promise.all([
    supabase.from('contacts')
      .select('*')
      .order('data_criacao', { ascending: false })
      .limit(10),
    supabase.from('appointments')
      .select('*')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  const activities = [
    ...(contacts.data || []).map(c => ({
      type: 'contact',
      title: 'Novo Lead (Global)',
      description: `${c.nome} entrou em contato`,
      time: c.data_criacao,
      name: c.nome,
      phone: c.telefone
    })),
    ...(appointments.data || []).map(a => ({
      type: 'appointment',
      title: 'Novo Agendamento (Global)',
      description: `Agendamento marcado com ${a.client_name}`,
      time: a.created_at,
      name: a.client_name,
      phone: a.client_phone
    }))
  ];

  return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);
};

/**
 * Quick Replies
 */
export const listQuickReplies = async (): Promise<QuickReply[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('quick_replies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id,
    userId: d.user_id,
    title: d.title,
    content: d.content,
    createdAt: d.created_at
  }));
};

export const createQuickReply = async (replyData: { title: string, content: string }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('quick_replies')
    .insert({
      user_id: user.id,
      title: replyData.title,
      content: replyData.content
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteQuickReply = async (id: string) => {
  const { error } = await supabase
    .from('quick_replies')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

export const getUpcomingAppointments = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .gte('data', today)
    .order('data', { ascending: true })
    .order('time', { ascending: true })
    .limit(5);

  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id,
    type: 'appointment',
    title: 'Agendamento Confirmado',
    description: `${a.summary || 'Consulta'} com ${a.client_name}`,
    date: a.data,
    time: a.time,
    name: a.client_name,
    phone: a.client_phone,
    summary: a.summary || a.niche || 'Sem resumo adicional',
    created_at: a.created_at
  }));
};

/**
 * Google Calendar OAuth
 */
export const signInWithGoogleCalendar = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      },
      redirectTo: window.location.origin + '/integrations'
    }
  });

  if (error) throw error;
  return data;
};

export const listGoogleCalendars = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  let accessToken = session?.provider_token;

  // Se não há provider_token na sessão (expirou após F5),
  // tenta usar o refresh_token salvo no banco para obter um novo
  if (!accessToken) {
    const { data: profileData } = await supabase.rpc('get_my_profile');
    const profile = Array.isArray(profileData) ? profileData[0] : profileData;
    const refreshToken = profile?.google_refresh_token;

    if (!refreshToken) {
      throw new Error('Sessão do Google expirou. Reconecte o Google Calendar.');
    }

    // Trocar refresh_token por novo access_token via Google OAuth
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!tokenRes.ok) {
      throw new Error('Sessão do Google expirou. Clique em Desconectar e reconecte.');
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  }

  if (!accessToken) {
    throw new Error('Token do Google não disponível. Reconecte o Google Calendar.');
  }

  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Falha ao buscar agendas');
  }

  const data = await response.json();
  return data.items.map((item: any) => ({
    id: item.id,
    summary: item.summary,
    primary: item.primary || false
  }));
};

export const disconnectGoogleCalendar = async () => {
  // Usa updateUserProfile (já resiliente a user_id mismatch pós-OAuth)
  await updateUserProfile({
    google_calendar_active: false,
    google_calendar_email: null,
    google_refresh_token: null as any
  });
};
