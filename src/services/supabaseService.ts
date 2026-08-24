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
  ecommerce_api_url?: string;
  ecommerce_api_type?: string;
  ecommerce_api_use_nlp?: boolean;
  // Fase 2 — qualidade de resposta
  tone_of_voice?: 'formal' | 'casual' | 'tecnico' | 'amigavel' | 'consultivo' | null;
  forbidden_topics?: string;
  conversation_examples?: string;
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
  email?: string;
  instagram?: string;
  website?: string;
  /** 'Cliente' não existe: quem é cliente tem is_client = true. */
  status_funil: 'Lead' | 'Qualificado' | 'Agendado' | 'Resolvido';
  data_criacao: string;
  ultimaMensagem?: string;
  ultimaInteracao?: string;
  primeiroContato?: string;
  totalMensagens?: number;
  source?: 'whatsapp' | 'manual';
  is_client?: boolean;
  priority?: string;
  profile_picture_url?: string;
  profile_picture_updated_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  nome_completo?: string;
  full_name?: string;
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
  google_refresh_token?: string;
  whatsapp_provider?: string;
  whatsapp_provider_config?: any;
  whatsapp_phone_number_id?: string;
  sofia_prompt?: string;
  sofia_active?: boolean;
  subscription_ends_at?: string;
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

export interface SofiaMessage {
  id: string;
  tenant_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: any;
  created_at: string;
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
export const getAuthSession = async () => {
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
export const standardFetch = async (url: string, options: RequestInit = {}, timeoutMs = 8000) => {
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
    response_delay: a.response_delay,
    ecommerce_api_url: a.ecommerce_api_url,
    ecommerce_api_type: a.ecommerce_api_type,
    ecommerce_api_use_nlp: a.ecommerce_api_use_nlp,
    tone_of_voice: a.tone_of_voice,
    forbidden_topics: a.forbidden_topics,
    conversation_examples: a.conversation_examples,
    training_mode: a.training_mode,
    whatsapp_provider: a.whatsapp_provider,
    whatsapp_provider_config: a.whatsapp_provider_config
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
      whatsapp_provider_config: agentData.whatsapp_provider_config,
      ecommerce_api_url: agentData.ecommerce_api_url,
      ecommerce_api_type: agentData.ecommerce_api_type,
      ecommerce_api_use_nlp: agentData.ecommerce_api_use_nlp,
      tone_of_voice: agentData.tone_of_voice || null,
      forbidden_topics: agentData.forbidden_topics || null,
      conversation_examples: agentData.conversation_examples || null,
      training_mode: agentData.training_mode || 'text',
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
      whatsapp_provider_config: agentData.whatsapp_provider_config,
      ecommerce_api_url: agentData.ecommerce_api_url,
      ecommerce_api_type: agentData.ecommerce_api_type,
      ecommerce_api_use_nlp: agentData.ecommerce_api_use_nlp,
      tone_of_voice: agentData.tone_of_voice || null,
      forbidden_topics: agentData.forbidden_topics || null,
      conversation_examples: agentData.conversation_examples || null,
      training_mode: agentData.training_mode || 'text',
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
      source: c.source as any,
      is_client: c.is_client
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

  // Sincroniza o nome na tabela threads se o nome mudou para manter consistência no CRM
  if (data.nome) {
    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('user_id, telefone')
        .eq('id', contactId)
        .single();
        
      if (contact) {
        const threadId = `${contact.user_id}_${contact.telefone}`;
        await supabase
          .from('threads')
          .update({ contact_name: data.nome })
      }
    } catch (err) {
      console.warn('[updateContact] Falha ao sincronizar nome na thread:', err);
    }
  }
};

/**
 * Sofia Chat History
 */
export const listSofiaMessages = async (limit = 50): Promise<SofiaMessage[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No session');

    // Get tenant_id from profile - using a more robust approach
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*') // Buscamos tudo para ser flexível se o nome da coluna mudar
      .eq('id', session.user.id)
      .maybeSingle();

    // Fallback: se tenant_id não existir na tabela profiles ainda, usamos o id do usuário
    const tenantId = profile?.tenant_id || session.user.id;

    const { data, error } = await supabase
      .from('sofia_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Error listing Sofia messages:', error.message);
    return []; // Retorna vazio em vez de estourar erro na UI
  }
};

export const deleteSofiaInteraction = async (messageId: string, assistantMessageId?: string) => {
  try {
    const idsToDelete = [messageId];
    if (assistantMessageId) idsToDelete.push(assistantMessageId);

    const { error } = await supabase
      .from('sofia_messages')
      .delete()
      .in('id', idsToDelete);

    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error('Error deleting Sofia interaction:', error.message);
    throw error;
  }
};

export const deleteContact = async (contactId: string) => {
  // Deletar os logs de campanha vinculados a este contato primeiro para evitar erros de chave estrangeira
  await supabase
    .from('campaign_logs')
    .delete()
    .eq('contact_id', contactId);

  // Note: threads would need to be deleted too if we want parity
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId);
  
  if (error) throw error;
  return { success: true };
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
      const finalFullName = profile.nome_completo || profile.full_name || profile.name || '';
      return {
        id: profile.id,
        email: profile.email,
        nome_completo: finalFullName,
        name: finalFullName,
        role: profile.role,
        whatsapp_status: profile.whatsapp_status,
        whatsapp_instance_id: profile.whatsapp_instance_id,
        whatsapp_provider: profile.whatsapp_provider,
        whatsapp_provider_config: profile.whatsapp_provider_config,
        whatsapp_phone_number_id: profile.whatsapp_phone_number_id,
        google_calendar_active: profile.google_calendar_active ?? false,
        google_calendar_email: profile.google_calendar_email,
        selected_calendar_id: profile.selected_calendar_id,
        // Dados da organização
        nome_empresa: profile.nome_empresa || profile.company_name || '',
        whatsapp_organizacao: profile.whatsapp_organizacao || '',
        descricao_empresa: profile.descricao_empresa || '',
        produtos_servicos: profile.produtos_servicos || '',
        faq: profile.faq || '',
        links_importantes: profile.links_importantes || '',
        // Plano e assinatura
        plano: profile.plano,
        trial_ends_at: profile.trial_ends_at,
        subscription_ends_at: profile.subscription_ends_at,
        nicho: profile.nicho,
        // Contato e notificações
        notification_phone: profile.notification_phone || '',
        // IA
        llm_provider: profile.llm_provider || '',
        openai_api_key: profile.openai_api_key || '',
        gemini_api_key: profile.gemini_api_key || '',
        default_ai_model: profile.default_ai_model || '',
        sofia_prompt: profile.sofia_prompt || '',
        sofia_active: profile.sofia_active ?? true,
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

  // onConflict com coluna nullable (professional_id) não funciona via PostgREST.
  // Fazemos select → update se existir, insert se não existir.
  let existingQuery = supabase
    .from('availability')
    .select('id')
    .eq('user_id', user.id);

  if (professionalId) {
    existingQuery = existingQuery.eq('professional_id', professionalId);
  } else {
    existingQuery = existingQuery.is('professional_id', null);
  }

  const { data: existing, error: selErr } = await existingQuery.maybeSingle();
  if (selErr) throw selErr;

  if (existing?.id) {
    const { error } = await supabase
      .from('availability')
      .update({ config })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('availability')
      .insert({
        user_id: user.id,
        professional_id: professionalId || null,
        config
      });
    if (error) throw error;
  }
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

  const [contactsCount, qualifiedCount, resolvedCount, messagesCount] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_funil', 'Qualificado'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_funil', 'Resolvido'),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  ]);

  if (contactsCount.error) console.error('[DashboardStats] Contacts fetch error:', contactsCount.error);

  const totalLeads = contactsCount.count || 0;
  const totalResolved = resolvedCount.count || 0;
  const totalMessages = messagesCount.count || 0;

  // Cálculo real do tempo médio de resposta
  let avgResponseTimeStr = '---';
  let avgFirstResponseIA = '---';
  let avgFirstResponseHuman = '---';

  try {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('thread_id, direction, created_at, is_ai, whatsapp_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (recentMessages && recentMessages.length > 0) {
      // Ordenar por data crescente para o cálculo
      const msgs = [...recentMessages].reverse();
      
      // Para o tempo médio GERAL (de todas as interações)
      const lastInboundByThread: Record<string, number> = {};
      let totalDiff = 0;
      let count = 0;

      // Para o tempo médio de PRIMEIRA RESPOSTA (da conversa)
      const firstInboundByThread: Record<string, number> = {};
      const firstResponseByThread: Record<string, { time: number, is_ai: boolean }> = {};
      
      let totalFirstDiffIA = 0;
      let countFirstIA = 0;
      let totalFirstDiffHuman = 0;
      let countFirstHuman = 0;

      msgs.forEach(msg => {
        const time = new Date(msg.created_at).getTime();
        const isAI = msg.is_ai || msg.whatsapp_id?.startsWith('ai-');
        
        // Lógica Geral (Tempo Médio de todas as respostas)
        if (msg.direction === 'inbound') {
          if (!lastInboundByThread[msg.thread_id]) {
            lastInboundByThread[msg.thread_id] = time;
          }
          if (!firstInboundByThread[msg.thread_id]) {
            firstInboundByThread[msg.thread_id] = time;
          }
        } else if (msg.direction === 'outbound') {
          // Geral
          if (lastInboundByThread[msg.thread_id]) {
            const diff = time - lastInboundByThread[msg.thread_id];
            if (diff < 2 * 60 * 60 * 1000) {
              totalDiff += diff;
              count++;
            }
            delete lastInboundByThread[msg.thread_id];
          }
          if (firstInboundByThread[msg.thread_id] && !firstResponseByThread[msg.thread_id]) {
            const diff = time - firstInboundByThread[msg.thread_id];
            
            // Ignorar outliers (mensagens respondidas após muito tempo, ex: > 2 horas)
            // para não distorcer a média de performance real da IA
            if (diff < 2 * 60 * 60 * 1000) {
              firstResponseByThread[msg.thread_id] = { time, is_ai: isAI };
              
              if (isAI) {
                totalFirstDiffIA += diff;
                countFirstIA++;
              } else {
                totalFirstDiffHuman += diff;
                countFirstHuman++;
              }
            }
          }
        }
      });

      const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
      };

      // Formata tempo GERAL
      if (count > 0) avgResponseTimeStr = formatTime(totalDiff / count);

      // Formata tempos de PRIMEIRA RESPOSTA
      if (countFirstIA > 0) avgFirstResponseIA = formatTime(totalFirstDiffIA / countFirstIA);
      if (countFirstHuman > 0) avgFirstResponseHuman = formatTime(totalFirstDiffHuman / countFirstHuman);
    }
  } catch (err) {
    console.error('[DashboardStats] Error calculating response times:', err);
    avgResponseTimeStr = '---';
    avgFirstResponseIA = '---';
    avgFirstResponseHuman = '---';
  }

  return {
    contacts: totalLeads,
    qualified: qualifiedCount.count || 0,
    appointments: totalResolved, 
    conversionRate: totalLeads > 0 ? Math.round((totalResolved / totalLeads) * 100) : 0,
    avgScore: 0,
    messages: totalMessages,
    avgResponseTime: avgResponseTimeStr,
    avgFirstResponseIA,
    avgFirstResponseHuman
  };
};

export const getGlobalDashboardStats = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { contacts: 0, appointments: 0, messages: 0, qualified: 0, conversionRate: 0, avgScore: 0 };

  const [contactsCount, qualifiedCount, resolvedCount, messagesCount] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status_funil', 'Qualificado'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status_funil', 'Resolvido'),
    supabase.from('messages').select('*', { count: 'exact', head: true })
  ]);

  const totalLeads = contactsCount.count || 0;
  const totalResolved = resolvedCount.count || 0;
  const totalMessages = messagesCount.count || 0;

  // Cálculo real do tempo médio de resposta Global
  let avgResponseTimeStr = '0s';
  try {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('thread_id, direction, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (recentMessages && recentMessages.length > 0) {
      const msgs = [...recentMessages].reverse();
      const lastInboundByThread: Record<string, number> = {};
      let totalDiff = 0;
      let count = 0;

      msgs.forEach(msg => {
        const time = new Date(msg.created_at).getTime();
        if (msg.direction === 'inbound') {
          if (!lastInboundByThread[msg.thread_id]) {
            lastInboundByThread[msg.thread_id] = time;
          }
        } else if (msg.direction === 'outbound') {
          if (lastInboundByThread[msg.thread_id]) {
            totalDiff += (time - lastInboundByThread[msg.thread_id]);
            count++;
            delete lastInboundByThread[msg.thread_id];
          }
        }
      });

      if (count > 0) {
        const avgMs = totalDiff / count;
        const totalSeconds = Math.floor(avgMs / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        avgResponseTimeStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
      }
    }
  } catch (err) {
    console.error('[GlobalStats] Error calculating real response time:', err);
    avgResponseTimeStr = '---';
  }

  return {
    contacts: totalLeads,
    qualified: qualifiedCount.count || 0,
    appointments: totalResolved,
    conversionRate: totalLeads > 0 ? Math.round((totalResolved / totalLeads) * 100) : 0,
    avgScore: 0,
    messages: totalMessages,
    avgResponseTime: avgResponseTimeStr
  };
};

/**
 * Retorna histórico de mensagens para gráficos de volume
 */
export const getReportsHistory = async (days: number = 30) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Em um cenário real, faríamos um RPC ou agregação pesada no banco.
  // Para manter performance e compatibilidade, vamos buscar o volume dos últimos dias.
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Tenta buscar as mensagens com a nova coluna is_ai, caso não exista, busca sem.
  let messages;
  const { data: messagesWithAI, error: errorWithAI } = await supabase
    .from('messages')
    .select('created_at, direction, is_ai')
    .gt('created_at', startDate.toISOString())
    .eq('user_id', user.id);

  if (errorWithAI && errorWithAI.code === 'PGRST204') {
    // Coluna is_ai não existe ainda (fallback para migração pendente)
    const { data: fallbackMessages, error: fallbackError } = await supabase
      .from('messages')
      .select('created_at, direction')
      .gt('created_at', startDate.toISOString())
      .eq('user_id', user.id);
      
    if (fallbackError) throw fallbackError;
    messages = fallbackMessages;
  } else if (errorWithAI) {
    // Tenta fallback genérico por precaução
    const { data: fallbackMessages } = await supabase
      .from('messages')
      .select('created_at, direction')
      .gt('created_at', startDate.toISOString())
      .eq('user_id', user.id);
    messages = fallbackMessages || [];
  } else {
    messages = messagesWithAI;
  }

  // Verifica se o agente está ativo (fallback caso is_ai seja null)
  const { data: agent } = await supabase.from('agents').select('status').eq('user_id', user.id).maybeSingle();
  const isAgentActive = agent?.status === 'active';

  // Agrupar por dia
  const groups: Record<string, { name: string, total: number, ia: number, humano: number }> = {};
  
  messages?.forEach((msg: any) => {
    const day = msg.created_at.split('T')[0];
    if (!groups[day]) {
      groups[day] = { name: day, total: 0, ia: 0, humano: 0 };
    }
    groups[day].total++;
    
    if (msg.direction === 'outbound') {
      const isBeforeMigration = new Date(msg.created_at) < new Date('2026-05-06T00:00:00Z');
      
      if (msg.is_ai === true) {
        groups[day].ia++;
      } else if (msg.is_ai === false && !isBeforeMigration) {
        groups[day].humano++;
      } else {
        // Fallback para mensagens antigas que receberam FALSE por causa do DEFAULT FALSE do banco,
        // ou que não têm a coluna is_ai. Mantém o comportamento original para não zerar o histórico.
        if (isAgentActive) groups[day].ia++;
        else groups[day].humano++;
      }
    } else {
      // Inbound = Leads (Não deve somar em Humano pois Humano = Equipe)
      // Vamos manter a estrutura para não quebrar o gráfico, mas o correto seria o gráfico mostrar "Equipe vs Sofia"
      // Como o gráfico soma IA + Humano = Total Outbound, não vamos somar inbound aqui se o foco é quem atendeu.
      // Vou ajustar para que o gráfico seja realmente "Atendimento Sofia vs Atendimento Humano"
    }
  });

  return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
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
      description: `${c.nome || c.telefone || 'Desconhecido'} entrou em contato`,
      time: c.data_criacao || c.ultima_interacao,
      name: c.nome || c.telefone,
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
      description: `${c.nome || c.telefone || 'Desconhecido'} entrou em contato`,
      time: c.data_criacao || c.ultima_interacao,
      name: c.nome || c.telefone,
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
    description: `${a.summary || 'Agendamento'} com ${a.client_name}`,
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
        client_id: (import.meta as any).env.VITE_GOOGLE_CLIENT_ID || '',
        client_secret: (import.meta as any).env.VITE_GOOGLE_CLIENT_SECRET || '',
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

export const createAdminUser = async (data: { email: string; password?: string; name?: string; role?: string; plano?: string; }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/v2/admin/users', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}` 
    },
    body: JSON.stringify(data)
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

/**
 * Exclui o inquilino e todos os dados dele. `confirm` precisa ser a palavra
 * EXCLUIR — o backend revalida, então não adianta pular a digitação aqui.
 * Retorna o resumo do que foi apagado por tabela.
 */
export const deleteAdminUser = async (
  userId: string,
  confirm: string
): Promise<{ deleted: Record<string, number>; errors: string[] }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ confirm })
  });

  if (res.status === 404) {
    throw new Error('Rota de exclusão não encontrada no servidor. O backend precisa ser atualizado.');
  }

  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao excluir usuário');
  return { deleted: result.deleted || {}, errors: result.errors || [] };
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

export const getPublicSettings = async () => {
  const res = await fetch('/api/v2/admin/settings/public');
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

export interface AdminTemplateRow {
  user_id: string;
  tenant_email: string;
  template_name: string;
  language_code: string;
  status: string;
  reason: string | null;
  last_event: string | null;
  last_event_at: string | null;
  sends_30d: number;
  sent_ok_30d: number;
  warnings_30d: number;
  quality_score: string | null;
}

export interface AdminTemplatesOverview {
  rows: AdminTemplateRow[];
  stats: { total: number; approved: number; paused: number; rejected: number; sends_30d: number };
}

export const getAdminTemplatesOverview = async (): Promise<AdminTemplatesOverview> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch('/api/v2/admin/templates', {
    headers: { 'Authorization': `Bearer ${session.access_token}` },
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Falha ao carregar templates');
  return { rows: body.rows, stats: body.stats };
};

export const syncAdminTemplates = async (): Promise<{ synced: number; tenants: number }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch('/api/v2/admin/templates/sync', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}` },
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Falha ao sincronizar templates');
  return { synced: body.synced, tenants: body.tenants };
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
export const getDashboardGrowth = async (days = 7) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`/api/v2/profile/growth?days=${days}`, {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};


/**
 * Tenant Secrets (Vault)
 */
/**
 * Meta Cloud API admin helpers (S6).
 * All endpoints require an authenticated admin Supabase session.
 */
export interface MetaPhoneInfo {
  phone_id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  verification_status?: string;
}

export interface MetaTestResult {
  success: boolean;
  phone?: MetaPhoneInfo;
  error?: string;
  errorInfo?: { code?: string | number; is24hWindowClosed?: boolean; isAuthError?: boolean };
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

/** Stateless test — does NOT persist. Use before saving to validate input. */
export const testMetaConnection = async (
  access_token: string,
  phone_id: string,
  waba_id?: string
): Promise<MetaTestResult> => {
  const res = await fetch('/api/v2/whatsapp/meta/test-connection', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ access_token, phone_id, waba_id }),
  });
  return res.json();
};

/**
 * Admin saves credentials for a target tenant (validated + anti-collision on backend).
 * Optionally accepts a per-tenant `app_secret` for white-label setups where each
 * tenant brings their own Meta app. Omit to use the global WHATSAPP_APP_SECRET.
 */
export const saveAdminMetaCredentials = async (
  targetUserId: string,
  access_token: string,
  phone_id: string,
  waba_id?: string,
  app_secret?: string
): Promise<MetaTestResult & { provider?: string }> => {
  const res = await fetch(`/api/v2/admin/users/${targetUserId}/meta-credentials`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ access_token, phone_id, waba_id, app_secret }),
  });
  return res.json();
};

/** Activates/Registers a phone number on the Meta Cloud API. */
export const registerMetaNumber = async (access_token: string, phone_id: string, pin?: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch('/api/v2/admin/meta/register', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ access_token, phone_id, pin }),
  });
  return res.json();
};

/** Subscribes the WABA/App to webhook events. */
export const subscribeMetaApp = async (access_token: string, waba_id: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch('/api/v2/admin/meta/subscribe', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ access_token, waba_id }),
  });
  return res.json();
};

/**
 * Meta template (S5+S7) helpers — used by the Inbox when the 24h window closes.
 */
export interface MetaTemplate {
  name: string;
  status: string;
  category?: string;
  language: string;
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | string;
    text?: string;
    format?: string;
    buttons?: any[];
    example?: any;
  }>;
  quality_score?: { score?: string };
}

export const listMetaTemplates = async (status: 'APPROVED' | 'PENDING' | 'REJECTED' | '' = 'APPROVED'): Promise<MetaTemplate[]> => {
  const params = status ? `?status=${status}&limit=100` : '?limit=100';
  const res = await fetch(`/api/v2/whatsapp/meta/templates${params}`, {
    headers: await authHeaders(),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Falha ao listar templates');
  return body.templates as MetaTemplate[];
};

export const sendMetaTemplate = async (
  to: string,
  template_name: string,
  language_code: string,
  components?: any[]
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  const res = await fetch('/api/v2/whatsapp/meta/send-template', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ to, template_name, language_code, components }),
  });
  return res.json();
};

export interface TemplateMetric {
  template_name: string;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  with_warnings: number;
  last_sent: string;
}

export const getTemplateMetrics = async (days = 30): Promise<TemplateMetric[]> => {
  const res = await fetch(`/api/v2/whatsapp/meta/templates/metrics?days=${days}`, {
    headers: await authHeaders(),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Falha ao carregar métricas');
  return body.metrics as TemplateMetric[];
};

export interface TemplateGenerateResult {
  success: boolean;
  body_text: string;
  var_count: number;
  example_values: string[];
  notes: string;
  warnings: string[];
  error?: string;
}

export const generateMetaTemplate = async (params: {
  template_name: string;
  category: string;
  language: string;
  description: string;
}): Promise<TemplateGenerateResult> => {
  const res = await fetch('/api/v2/whatsapp/meta/templates/generate', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
};

export const submitMetaTemplate = async (params: {
  template_name: string;
  category: string;
  language: string;
  body_text: string;
  example_values: string[];
  header_text?: string;
  header_image_url?: string;
  footer_text?: string;
  buttons?: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }[];
}): Promise<{ success: boolean; meta_id?: string; status?: string; error?: string }> => {
  const res = await fetch('/api/v2/whatsapp/meta/templates/submit', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
};

/** Returns the current Meta provider status for the authed user. */
export const getMetaStatus = async (): Promise<{
  success: boolean;
  provider: string;
  meta?: { configured: boolean; phone_id?: string; live_ok?: boolean; verified_name?: string; quality_rating?: string; error?: string };
}> => {
  const res = await fetch('/api/v2/whatsapp/meta/status', { headers: await authHeaders() });
  return res.json();
};

/**
 * Snapshot completo da saúde da conexão WhatsApp de um tenant.
 * Usado pelo botão "Diagnóstico" do AdminPanel.
 */
export interface WhatsAppDiagnostic {
  profile: {
    id: string;
    email: string;
    provider: string;
    status: string;
    updated_at: string;
  };
  meta?: {
    phone_id: string;
    waba_id: string | null;
    access_token_set: boolean;
    app_secret_set: boolean;
    last_error: string | null;
    last_error_at: string | null;
    live: {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      verification_status?: string;
      name_status?: string;
    } | null;
    live_error: string | null;
    templates: { approved: number; total?: number } | null;
  } | null;
  evolution?: { instance_id: string | null } | null;
  messages_24h: number;
  failed_messages_total: number;
  audit: Array<{
    action: string;
    performed_at: string;
    details: any;
    performed_by: string | null;
  }>;
}

export const getAdminWhatsAppDiagnostic = async (targetUserId: string): Promise<WhatsAppDiagnostic> => {
  const res = await fetch(`/api/v2/admin/users/${targetUserId}/diagnostic`, {
    headers: await authHeaders(),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || 'Falha ao buscar diagnóstico');
  return body.diagnostic as WhatsAppDiagnostic;
};

/** Admin reverts a tenant back to evolution, clearing Meta credentials. */
export const disconnectAdminMeta = async (targetUserId: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch(`/api/v2/admin/users/${targetUserId}/meta-disconnect`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  return res.json();
};

export const saveTenantSecret = async (tenantId: string, key: string, value: string) => {
  const { error } = await supabase
    .from('tenant_secrets')
    .upsert({
      tenant_id: tenantId,
      secret_key: key,
      secret_value: value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,secret_key' });

  if (error) throw error;
};

export const getTenantSecret = async (tenantId: string, key: string) => {
  const { data, error } = await supabase
    .from('tenant_secrets')
    .select('secret_value')
    .eq('tenant_id', tenantId)
    .eq('secret_key', key)
    .maybeSingle();

  if (error) throw error;
  return data?.secret_value || '';
};

// ─── AI Performance Stats ─────────────────────────────────────────────────────
export type AIStats = {
  total_today: number;
  cost_today: number;
  resolution_rate: number;
  avg_duration_ms: number;
  top_tool: string | null;
};

export const getAIStats = async (userId: string): Promise<AIStats | null> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('ai_interaction_logs')
      .select('outcome, cost_brl, duration_ms, tool_names')
      .eq('user_id', userId)
      .gte('created_at', today.toISOString());

    if (error || !data || data.length === 0) return null;

    const total = data.length;
    const cost  = data.reduce((s, r) => s + Number(r.cost_brl || 0), 0);
    const resolved = data.filter(r => r.outcome === 'responded').length;
    const avgDuration = Math.round(data.reduce((s, r) => s + (r.duration_ms || 0), 0) / total);

    const toolCount: Record<string, number> = {};
    data.forEach(r => (r.tool_names || []).forEach((t: string) => { toolCount[t] = (toolCount[t] || 0) + 1; }));
    const topTool = Object.entries(toolCount).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    return {
      total_today: total,
      cost_today: +cost.toFixed(3),
      resolution_rate: Math.round((resolved / total) * 100),
      avg_duration_ms: avgDuration,
      top_tool: topTool
    };
  } catch {
    return null;
  }
};

// Force redeploy to clear asset cache - Zyreo Update

// ─── Carteira de clientes (CRM do inquilino) ──────────────────────────────
// Não confundir com a gestão de inquilinos da plataforma (listAdminUsers).

export interface ClientProfile {
  id?: string;
  contact_id?: string;
  mensalidade?: number | null;
  moeda?: string;
  ciclo?: 'mensal' | 'anual' | 'unico';
  cliente_desde?: string;
  status_contrato?: 'ativo' | 'pausado' | 'cancelado';
  encerrado_em?: string | null;
  observacoes?: string | null;
  custom_fields?: Record<string, any>;
}

export interface ClientRecord {
  id: string;
  nome: string;
  telefone: string;
  email?: string | null;
  instagram?: string | null;
  website?: string | null;
  is_client?: boolean;
  data_criacao?: string;
  ultima_interacao?: string;
  ultima_mensagem?: string;
  total_mensagens?: number;
  profile_picture_url?: string | null;
  profile?: ClientProfile | null;
  appointments?: Array<Record<string, any>>;
  /** LTV realizado: quanto este cliente já pagou até hoje. */
  ltv?: number;
  /** Meses completos desde a entrada (ou até o encerramento). */
  meses?: number;
}

export interface ClientsSummary {
  total: number;
  ativos: number;
  mrr: number;
  ticket_medio: number;
  /** Soma do que toda a carteira já pagou, inclusive quem cancelou. */
  ltv_total: number;
  /** Média entre os clientes que já geraram receita. */
  ltv_medio: number;
}

export const listClients = async (): Promise<{ data: ClientRecord[]; summary: ClientsSummary }> => {
  const res = await standardFetch('/api/v2/clients');
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao carregar clientes');
  return { data: result.data || [], summary: result.summary };
};

/**
 * Cadastro manual de cliente. Se o telefone já existir na base, o backend
 * promove o contato existente em vez de criar outro.
 */
export const createClient = async (
  payload: Partial<ClientRecord & ClientProfile> & { nome: string }
): Promise<{ id: string }> => {
  const res = await standardFetch('/api/v2/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao cadastrar cliente');
  return result.data;
};

export const getClient = async (contactId: string): Promise<ClientRecord> => {
  const res = await standardFetch(`/api/v2/clients/${encodeURIComponent(contactId)}`);
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao carregar a ficha');
  return result.data;
};

export const updateClient = async (contactId: string, payload: Partial<ClientRecord & ClientProfile>) => {
  const res = await standardFetch(`/api/v2/clients/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao salvar');
};

/** Promove um lead a cliente: ele sai da lista de leads e ganha ficha. */
export const promoteToClient = async (contactId: string, profile?: ClientProfile) => {
  const res = await standardFetch(`/api/v2/clients/${encodeURIComponent(contactId)}/promote`, {
    method: 'POST',
    body: JSON.stringify(profile || {}),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao promover');
};

/** Devolve o cliente para a lista de leads (a ficha é preservada). */
export const demoteClient = async (contactId: string) => {
  const res = await standardFetch(`/api/v2/clients/${encodeURIComponent(contactId)}/demote`, {
    method: 'POST',
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao remover da carteira');
};

// ─── Campos personalizados da ficha do cliente ────────────────────────────
// Cada inquilino define os campos do próprio ramo; os valores ficam no
// custom_fields da ficha.

export type TipoCampoCliente = 'texto' | 'numero' | 'data' | 'selecao' | 'multi_selecao' | 'booleano';

export interface CampoCliente {
  id: string;
  chave: string;
  label: string;
  tipo: TipoCampoCliente;
  opcoes: string[];
  ordem: number;
}

export const listClientFields = async (): Promise<CampoCliente[]> => {
  const res = await standardFetch('/api/v2/clients/campos/definicoes');
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao carregar campos');
  return result.data || [];
};

export const createClientField = async (payload: {
  label: string; tipo: TipoCampoCliente; opcoes?: string[];
}): Promise<CampoCliente> => {
  const res = await standardFetch('/api/v2/clients/campos/definicoes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao criar campo');
  return result.data;
};

export const updateClientField = async (id: string, payload: Partial<CampoCliente>) => {
  const res = await standardFetch(`/api/v2/clients/campos/definicoes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao salvar campo');
};

/** Remove a definição. Os valores já preenchidos continuam nas fichas. */
export const deleteClientField = async (id: string) => {
  const res = await standardFetch(`/api/v2/clients/campos/definicoes/${id}`, { method: 'DELETE' });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao remover campo');
};

// ─── Motivos de perda ─────────────────────────────────────────────────────

export interface MotivoPerda {
  id: string;
  nome: string;
  ordem: number;
}

export const listLossReasons = async (): Promise<MotivoPerda[]> => {
  const res = await standardFetch('/api/v2/funnel/loss-reasons');
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao carregar motivos');
  return result.data || [];
};

export const createLossReason = async (nome: string): Promise<MotivoPerda> => {
  const res = await standardFetch('/api/v2/funnel/loss-reasons', {
    method: 'POST',
    body: JSON.stringify({ nome }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao criar motivo');
  return result.data;
};

export const deleteLossReason = async (id: string) => {
  const res = await standardFetch(`/api/v2/funnel/loss-reasons/${id}`, { method: 'DELETE' });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao remover motivo');
};

/** Marca o lead como perdido registrando o porquê. */
export const markLeadAsLost = async (contactId: string, reasonId?: string | null, note?: string) => {
  const res = await standardFetch('/api/v2/funnel/mark-lost', {
    method: 'POST',
    body: JSON.stringify({ contactId, reasonId: reasonId || null, note: note || null }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao marcar como perdido');
};

/** Tira o lead de "Perdido" e limpa o registro da perda. */
export const reopenLead = async (contactId: string, etapa?: string) => {
  const res = await standardFetch('/api/v2/funnel/reopen', {
    method: 'POST',
    body: JSON.stringify({ contactId, etapa }),
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Falha ao reabrir o lead');
};
