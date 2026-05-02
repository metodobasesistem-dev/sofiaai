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

export interface AgentKnowledge {
  id: string;
  user_id: string;
  agent_id: string;
  type: 'audio' | 'text' | 'document';
  title?: string;
  content: string;
  metadata?: any;
  is_active: boolean;
  created_at: string;
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
    extraPrompt?: string;
    type: 'static' | 'ai';
    message?: string;
  }[];
  reminders?: {
    mode: string;
    hoursBefore: number;
    message: string;
    sendAfterTime: boolean;
  }[];
  appointmentDuration?: number;
  response_delay?: number;
  training_mode?: 'text' | 'audio';
  whatsapp_provider?: 'evolution' | 'uazapi' | 'meta_official';
  whatsapp_provider_config?: {
    phone_number_id?: string;
    instance_name?: string;
    [key: string]: any;
  };
}

export interface AgentSecret {
  id?: string;
  agent_id: string;
  user_id: string;
  secret_key: string;
  secret_value: string;
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
  llm_provider?: string;
  openai_api_key?: string;
  gemini_api_key?: string;
  default_ai_model?: string;
}

export interface AvailabilityConfig {
  userId: string;
  professionalId?: string;
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

/**
 * Helper para obter sessão e token de forma centralizada
 */
const getAuthSession = async () => {
  try {
    // Try to get the session. If it fails, retry once after a short delay.
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      // Small delay and retry to handle transient lock issues
      await new Promise(r => setTimeout(r, 500));
      const retry = await supabase.auth.getSession();
      session = retry.data.session;
    }
    
    return session;
  } catch (err) {
    console.error('[getAuthSession] Failed to get session:', err);
    return null;
  }
};

/**
 * Sistema de Log de Erros (Observabilidade Fase 2)
 */
export const logSystemError = async (module: string, message: string, metadata: any = {}) => {
  try {
    const session = await getAuthSession();
    await supabase.from('sys_logs').insert({
      user_id: session?.user?.id,
      level: 'error',
      module,
      message,
      metadata: {
        ...metadata,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    // Falha silenciosa para não quebrar o app se o log falhar
    console.error('[logSystemError] Critical Failure:', err);
  }
};

/**
 * Wrapper de Fetch padronizado com timeout e headers de auth
 */
const standardFetch = async (url: string, options: RequestInit = {}, timeoutMs = 8000) => {
  const session = await getAuthSession();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${session?.access_token || ''}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    throw err;
  }
};

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
    appointmentDuration: a.appointment_duration,
    response_delay: a.response_delay
  }));

export const listAgents = async (): Promise<Agent[]> => {
  const session = await getAuthSession();
  if (!session) return [];

  const cachedResult = session.user?.email ? getCachedAgents(session.user.email) : [];

  try {
    const res = await standardFetch('/api/v2/agents');
    
    if (!res.ok) {
      const errorText = await res.text();
      console.warn('[listAgents] API non-ok response:', errorText);
      return cachedResult;
    }

    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    const agents = mapAgents(result.data || []);
    if (session.user?.email) setCachedAgents(session.user.email, agents);
    return agents;
  } catch (err: any) {
    console.warn('[listAgents] Using cache due to error:', err.message);
    logSystemError('frontend:agents', 'Falha ao listar agentes, usando cache.', { error: err.message });
    return cachedResult;
  }
};


/**
 * Cria agente via INSERT direto na tabela agents
 */
export const createAgent = async (agentData: Omit<Agent, 'id' | 'userId'>) => {
  try {
    const payload = {
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
      appointment_duration: agentData.appointmentDuration || 30,
      response_delay: agentData.response_delay || 15,
      knowledge_base: agentData.knowledgeBase,
      follow_ups: agentData.followUps,
      reminders: agentData.reminders,
      whatsapp_provider: agentData.whatsapp_provider,
      whatsapp_provider_config: agentData.whatsapp_provider_config
    };

    const res = await standardFetch('/api/v2/agents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
  } catch (err: any) {
    logSystemError('frontend:agents:create', err.message);
    throw err;
  }
};


/**
 * Atualiza agente via UPDATE direto na tabela agents
 */
export const updateAgent = async (agentId: string, agentData: Partial<Agent>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Usuário não autenticado');

  const res = await fetch(`/api/v2/agents/${agentId}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
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
      response_delay: agentData.response_delay,
      knowledge_base: agentData.knowledgeBase,
      follow_ups: agentData.followUps,
      reminders: agentData.reminders,
      whatsapp_provider: agentData.whatsapp_provider,
      whatsapp_provider_config: agentData.whatsapp_provider_config
    })
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const toggleAgentStatus = async (agentId: string, currentStatus: boolean) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/agents/${agentId}/toggle`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ status_ativo: !currentStatus })
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const deleteAgent = async (agentId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/agents/${agentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

/**
 * Agent Knowledge (Audio Training)
 */
export const listAgentKnowledge = async (agentId: string): Promise<AgentKnowledge[]> => {
  try {
    const res = await standardFetch(`/api/v2/agents/${agentId}/knowledge`);
    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    return result.data || [];
  } catch (err: any) {
    logSystemError('frontend:knowledge:list', err.message);
    return [];
  }
};

export const createAgentKnowledge = async (agentId: string, data: Partial<AgentKnowledge>) => {
  const res = await standardFetch(`/api/v2/agents/${agentId}/knowledge`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const updateAgentKnowledge = async (agentId: string, knowledgeId: string, data: Partial<AgentKnowledge>) => {
  const res = await standardFetch(`/api/v2/agents/${agentId}/knowledge/${knowledgeId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const deleteAgentKnowledge = async (agentId: string, knowledgeId: string) => {
  const res = await standardFetch(`/api/v2/agents/${agentId}/knowledge/${knowledgeId}`, {
    method: 'DELETE'
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const res = await fetch('/api/v2/agents/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.text;
};

/**
 * Contacts
 */
export const listContacts = async (): Promise<Contact[]> => {
  try {
    const res = await standardFetch('/api/v2/contacts');
    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    
    return (result.data || []).map((c: any) => ({
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
  } catch (err: any) {
    logSystemError('frontend:contacts', err.message);
    return [];
  }
};

/**
 * Professionals
 */
export const listProfessionals = async (): Promise<Professional[]> => {
  try {
    const session = await getAuthSession();
    if (!session?.user) return [];

    const { data, error } = await supabase
      .from('professionals')
      .select('*')
      .eq('user_id', session.user.id);
    
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
  } catch (err: any) {
    logSystemError('frontend:professionals', err.message);
    return [];
  }
};

export const upsertProfessional = async (pData: Partial<Professional>) => {
  try {
    const session = await getAuthSession();
    if (!session?.user) throw new Error('Not authenticated');

    const payload = {
      user_id: session.user.id,
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
  } catch (err: any) {
    logSystemError('frontend:professionals:upsert', err.message);
    throw err;
  }
};

export const deleteProfessional = async (id: string) => {
  try {
    const { error } = await supabase
      .from('professionals')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (err: any) {
    logSystemError('frontend:professionals:delete', err.message);
    throw err;
  }
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

export const updateContact = async (contactId: string, data: Partial<Contact>) => {
  const payload: any = {};
  if (data.nome) payload.nome = data.nome;
  if (data.telefone) payload.telefone = data.telefone.replace(/\D/g, '');
  
  const { error } = await supabase
    .from('contacts')
    .update(payload)
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
    const res = await standardFetch('/api/v2/profile');
    if (!res.ok) return null;

    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    const profile = result.data;

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
        trial_ends_at: profile.trial_ends_at,
        llm_provider: profile.llm_provider,
        openai_api_key: profile.openai_api_key,
        gemini_api_key: profile.gemini_api_key,
        default_ai_model: profile.default_ai_model
      };
    }
    return null;
  } catch (err: any) {
    console.error('[getUserProfile] API Erro:', err.message);
    logSystemError('frontend:profile:get', err.message);
    return null;
  }
};

export const updateUserProfile = async (profileData: Partial<UserProfile>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/profile', {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(profileData)
  });

  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

/**
 * Availability
 */
export const getAvailability = async (professionalId?: string): Promise<AvailabilityConfig | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let query = supabase
    .from('availability')
    .select('*')
    .eq('user_id', user.id);

  if (professionalId) {
    query = query.eq('professional_id', professionalId);
  } else {
    query = query.is('professional_id', null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data ? { userId: data.user_id, professionalId: data.professional_id, weekly: data.config.weekly, specificDates: data.config.specificDates } : null;
};

export const saveAvailability = async (config: Omit<AvailabilityConfig, 'userId'>, professionalId?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('availability')
    .upsert({
      user_id: user.id,
      professional_id: professionalId || null,
      config: config
    }, {
      onConflict: 'user_id, professional_id'
    });

  if (error) throw error;
};

/**
 * Appointments
 */
export const listAppointments = async (): Promise<Appointment[]> => {
  try {
    const session = await getAuthSession();
    if (!session?.user) return [];

    // Admin Bypass via role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const isAdmin = profile?.role === 'admin';

    let query = supabase.from('appointments').select('*').eq('status', 'confirmed');
    
    if (!isAdmin) {
      query = query.eq('user_id', session.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

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
  } catch (err: any) {
    logSystemError('frontend:appointments', err.message);
    return [];
  }
};

export const deleteAppointment = async (id: string) => {
  try {
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) throw error;
  } catch (err: any) {
    logSystemError('frontend:appointments:delete', err.message);
    throw err;
  }
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
  try {
    const res = await standardFetch('/api/v2/quick-replies');
    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    
    return (result.data || []).map((d: any) => ({
      id: d.id,
      userId: d.user_id,
      title: d.title,
      content: d.content,
      createdAt: d.created_at
    }));
  } catch (err: any) {
    logSystemError('frontend:quick-replies', err.message);
    return [];
  }
};

export const createQuickReply = async (replyData: { title: string, content: string }) => {
  try {
    const res = await standardFetch('/api/v2/quick-replies', {
      method: 'POST',
      body: JSON.stringify(replyData)
    });

    const result = await res.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
  } catch (err: any) {
    logSystemError('frontend:quick-replies:create', err.message);
    throw err;
  }
};

export const deleteQuickReply = async (id: string) => {
  try {
    const res = await standardFetch(`/api/v2/quick-replies/${id}`, {
      method: 'DELETE'
    });

    const result = await res.json();
    if (!result.success) throw new Error(result.error);
  } catch (err: any) {
    logSystemError('frontend:quick-replies:delete', err.message);
    throw err;
  }
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

/**
 * Admin API (v2 Backend Proxy)
 */
export const getAdminStats = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/stats', {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const listAdminUsers = async (): Promise<UserProfile[]> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/users', {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const updateAdminUser = async (userId: string, data: Partial<UserProfile>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const resetAdminUserWhatsApp = async (userId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/admin/users/${userId}/reset-whatsapp`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const getAdminUserActivity = async (userId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/admin/users/${userId}/activity`, {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const getGlobalSettings = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/settings', {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const updateGlobalSettings = async (data: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/settings', {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
};

export const getAdminFinanceStats = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/finance/stats', {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const getAdminActivity = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/activity', {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

/**
 * Agent Secrets (Vault)
 */
export const saveAgentSecret = async (agentId: string, userId: string, key: string, value: string) => {
  const { error } = await supabase
    .from('agent_secrets')
    .upsert({
      agent_id: agentId,
      user_id: userId,
      secret_key: key,
      secret_value: value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'agent_id,secret_key' });

  if (error) throw error;
};

export const getAgentSecret = async (agentId: string, key: string) => {
  const { data, error } = await supabase
    .from('agent_secrets')
    .select('secret_value')
    .eq('agent_id', agentId)
    .eq('secret_key', key)
    .maybeSingle();

  if (error) throw error;
  return data?.secret_value || '';
};
export const getDashboardGrowth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/dashboard/growth', {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};


