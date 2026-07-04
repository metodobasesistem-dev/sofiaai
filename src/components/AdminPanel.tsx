import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Shield, 
  Settings, 
  Database, 
  Activity, 
  Zap, 
  CheckCircle2, 
  XCircle,
  Clock,
  BarChart3,
  Search,
  RefreshCw,
  MoreVertical,
  ExternalLink,
  MessageSquare,
  Key,
  CreditCard,
  Layers,
  FileText,
  ChevronRight,
  TrendingUp,
  Bot,
  Rocket,
  Globe,
  LayoutDashboard,
  Server,
  Lock,
  ArrowRight,
  Info,
  Smartphone,
  Save,
  Star,
  ToggleLeft,
  ChevronLeft,
  Calendar,
  Trash2,
  Send,
  Mail
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { type UserProfile, getAdminStats, listAdminUsers, updateAdminUser, deleteAdminUser, resetAdminUserWhatsApp, getAdminUserActivity, getGlobalSettings, updateGlobalSettings, getAdminFinanceStats, getAdminActivity, getTenantSecret, saveTenantSecret, testMetaConnection, saveAdminMetaCredentials, disconnectAdminMeta, type MetaPhoneInfo, standardFetch, listMetaTemplates, type MetaTemplate, getMetaStatus } from '../services/supabaseService';
import MetaSetupHelpModal from './MetaSetupHelpModal';
import WhatsAppDiagnosticModal from './WhatsAppDiagnosticModal';
import AdminTemplatesTab from './AdminTemplatesTab';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type AdminTab = 'overview' | 'users' | 'config' | 'billing' | 'flags' | 'meta_activator' | 'lead_radar';

function AutopilotCountdown({ nextSendAt }: { nextSendAt: number }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((nextSendAt - Date.now()) / 1000)));
  useEffect(() => {
    const iv = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextSendAt - Date.now()) / 1000));
      setSecs(remaining);
      if (remaining === 0) clearInterval(iv);
    }, 1000);
    return () => clearInterval(iv);
  }, [nextSendAt]);
  return <span>Próximo envio em <span className="text-white font-bold">{secs}s</span></span>;
}

interface AdminPanelProps {
  initialView?: 'hub' | 'standard';
  initialTab?: AdminTab;
  onTabChange?: (tab: string) => void;
  role?: string | null;
  user?: User | null;
}

export default function AdminPanel({ initialView = 'standard', initialTab, onTabChange, role, user }: AdminPanelProps) {
  const [currentView, setCurrentView] = useState<'hub' | 'standard'>(initialView);
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab || 'overview');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanLeadsFound, setScanLeadsFound] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [isAutopilotModalOpen, setIsAutopilotModalOpen] = useState(false);
  const [autopilotTemplateName, setAutopilotTemplateName] = useState('prospeccao_fria');
  const [autopilotInjectVar, setAutopilotInjectVar] = useState(true);
  const [isTestInputVisible, setIsTestInputVisible] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);
  const [senderName, setSenderName] = useState<string | null>(null);
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [radarNiche, setRadarNiche] = useState('');
  const [radarCity, setRadarCity] = useState('');
  const [radarContext, setRadarContext] = useState('');
  const [radarLimit, setRadarLimit] = useState(10);
  const [radarSource, setRadarSource] = useState<'google' | 'instagram'>('google');
  const [validatingLeadId, setValidatingLeadId] = useState<string | null>(null);
  const [radarLeads, setRadarLeads] = useState<any[]>([]);
  const [radarStatusFilter, setRadarStatusFilter] = useState<string>('todos');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignEditingId, setCampaignEditingId] = useState<string | null>(null);
  const [campaignEditingName, setCampaignEditingName] = useState('');
  const [radarSearchOpen, setRadarSearchOpen] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isBulkActing, setIsBulkActing] = useState(false);
  // Piloto automático - progresso em tempo real
  const [autopilotProgress, setAutopilotProgress] = useState<{
    active: boolean; total: number; sent: number; errors: number;
    currentLead: string | null; jobStatus: string; nextSendAt: number | null;
    log: Array<{ name: string; phone: string; status: string; time: string }>;
  } | null>(null);
  const autopilotPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Modal de envio individual
  const [sendModalLead, setSendModalLead] = useState<any | null>(null);
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [sendModalTemplate, setSendModalTemplate] = useState('');
  const [sendModalTemplates, setSendModalTemplates] = useState<MetaTemplate[]>([]);
  const [loadingSendTemplates, setLoadingSendTemplates] = useState(false);
  const [sendMode, setSendMode] = useState<'text' | 'template'>('text');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSessions: 0,
    totalMessages: 0,
    totalAgents: 0
  });
  const [customMessage, setCustomMessage] = useState('');

  // Modal & Action states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [isMetaTesting, setIsMetaTesting] = useState(false);
  const [metaTestResult, setMetaTestResult] = useState<{ ok: boolean; phone?: MetaPhoneInfo; error?: string } | null>(null);
  const [metaHelpOpen, setMetaHelpOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  const [globalSettings, setGlobalSettings] = useState<any>({
    openai_api_key: '',
    gemini_api_key: '',
    default_ai_model: 'gpt-4o',
    llm_provider: 'openai',
    usd_brl_rate: 5.30,
    maintenance_mode: false,
    allow_signups: true,
    admin_notification_phone: '',
    admin_notification_user_id: '',
    support_whatsapp: '',
    knowledge_analysis_prompt: '',
    google_maps_api_key: '',
    updated_at: ''
  });
  const [financeStats, setFinanceStats] = useState<any>({
    totalCostBrl: 0,
    totalTokens: 0,
    userCosts: {}
  });
  const [activityData, setActivityData] = useState<any[]>([]);
  const [featureFlags, setFeatureFlags] = useState<any[]>([]);

  const fetchFeatureFlags = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select(`
          *,
          profiles:updated_by (email)
        `)
        .order('label');
      if (error) throw error;
      setFeatureFlags(data || []);
    } catch (err) {
      console.error('Error fetching flags:', err);
    }
  };

  const toggleFeatureFlag = async (key: string, enabled: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getSession();
      const { error } = await supabase
        .from('feature_flags')
        .update({ 
          enabled: !enabled,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        })
        .eq('key', key);

      if (error) throw error;
      toast.success(`Funcionalidade ${!enabled ? 'ativada' : 'desativada'}!`);
      fetchFeatureFlags();
    } catch (err) {
      console.error('Error toggling flag:', err);
      toast.error('Erro ao atualizar funcionalidade.');
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      if (role === 'admin') {
        const [statsData, usersData, settingsData, financeData, activityData] = await Promise.all([
          getAdminStats(),
          listAdminUsers(),
          getGlobalSettings(),
          getAdminFinanceStats(),
          getAdminActivity()
        ]);

        setStats(statsData);
        setProfiles(usersData);
        if (settingsData) setGlobalSettings(settingsData);
        if (financeData) setFinanceStats(financeData);
        if (activityData) setActivityData(activityData);
        await fetchFeatureFlags();
      } else {
        try {
          const status = await getMetaStatus();
          if (status && status.success) {
            setGlobalSettings(prev => ({
              ...prev,
              whatsapp_provider: status.provider
            }));
          }
        } catch (err) {
          console.error('Error fetching meta status:', err);
        }
      }
      await fetchCampaigns();
      await fetchLeads();
    } catch (error: any) {
      console.error('Fetch Error:', error);
      toast.error('Erro ao carregar dados.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const r = await standardFetch('/api/v2/radar/campaigns');
      const res = await r.json();
      if (res.success) setCampaigns(res.data || []);
    } catch (err) { console.error('Error fetching campaigns:', err); }
  };

  const fetchLeads = async (campaignId?: string | null) => {
    try {
      const cid = campaignId !== undefined ? campaignId : selectedCampaignId;
      const url = cid ? `/api/v2/radar/leads?campaign_id=${cid}` : '/api/v2/radar/leads';
      const response = await standardFetch(url);
      const res = await response.json();
      if (res.success) setRadarLeads(res.data);
    } catch (err) { console.error('Error fetching leads:', err); }
  };

  const selectCampaign = async (id: string | null) => {
    setSelectedCampaignId(id);
    setRadarStatusFilter('todos');
    setSelectedLeadIds(new Set());
    await fetchLeads(id);
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (visibleIds: string[]) => {
    setSelectedLeadIds(prev =>
      prev.size === visibleIds.length ? new Set() : new Set(visibleIds)
    );
  };

  const bulkUpdateStatus = async (status: string) => {
    const ids = [...selectedLeadIds];
    if (!ids.length) return;
    setIsBulkActing(true);
    try {
      const r = await standardFetch('/api/v2/radar/leads/bulk-status', {
        method: 'POST', body: JSON.stringify({ ids, status })
      });
      const res = await r.json();
      if (res.success) {
        toast.success(`${res.updated} leads marcados como "${status}"`);
        setSelectedLeadIds(new Set());
        await fetchLeads();
      } else toast.error(res.error);
    } catch { toast.error('Erro ao atualizar status'); }
    finally { setIsBulkActing(false); }
  };

  const bulkDeleteLeads = async () => {
    const ids = [...selectedLeadIds];
    if (!ids.length) return;
    if (!window.confirm(`Deletar ${ids.length} leads selecionados?`)) return;
    setIsBulkActing(true);
    try {
      const r = await standardFetch('/api/v2/radar/leads/bulk-delete', {
        method: 'DELETE', body: JSON.stringify({ ids })
      });
      const res = await r.json();
      if (res.success) {
        toast.success(`${res.deleted} leads removidos`);
        setSelectedLeadIds(new Set());
        fetchCampaigns();
        await fetchLeads();
      } else toast.error(res.error);
    } catch { toast.error('Erro ao deletar leads'); }
    finally { setIsBulkActing(false); }
  };

  const deleteCampaign = async (id: string) => {
    if (!window.confirm('Deletar campanha e todos os seus leads? Esta ação não pode ser desfeita.')) return;
    try {
      const r = await standardFetch(`/api/v2/radar/campaigns/${id}`, { method: 'DELETE' });
      const res = await r.json();
      if (res.success) {
        toast.success('Campanha deletada');
        if (selectedCampaignId === id) { setSelectedCampaignId(null); setRadarLeads([]); }
        fetchCampaigns();
      }
    } catch { toast.error('Erro ao deletar campanha'); }
  };

  const saveCampaignName = async (id: string) => {
    if (!campaignEditingName.trim()) return;
    try {
      const r = await standardFetch(`/api/v2/radar/campaigns/${id}`, {
        method: 'PATCH', body: JSON.stringify({ name: campaignEditingName.trim() })
      });
      const res = await r.json();
      if (res.success) { fetchCampaigns(); setCampaignEditingId(null); }
    } catch { toast.error('Erro ao renomear'); }
  };

  const openSendModal = async (lead: any) => {
    setSendModalLead(lead);
    setSendModalTemplate('');
    setCustomMessage('');
    setTemplateParams([]);
    setLoadingSendTemplates(true);
    try {
      const templates = await listMetaTemplates('APPROVED');
      setSendModalTemplates(templates);
      if (globalSettings.whatsapp_provider === 'meta_official' && templates.length > 0) {
        setSendMode('template');
      } else {
        setSendMode('text');
      }
    } catch {
      setSendModalTemplates([]);
      setSendMode('text');
    } finally {
      setLoadingSendTemplates(false);
    }
  };

  const sendToLead = async () => {
    if (!sendModalLead) return;
    setSendingLeadId(sendModalLead.id);
    try {
      const body: any = {};
      if (sendMode === 'template') {
        if (sendModalTemplate) {
          body.templateName = sendModalTemplate;
          body.templateLanguage = 'pt_BR';
          body.templateParams = templateParams;
        }
      } else {
        body.customMessage = customMessage;
      }
      const r = await standardFetch(`/api/v2/radar/leads/${sendModalLead.id}/send`, {
        method: 'POST', body: JSON.stringify(body)
      }, 30000);
      const res = await r.json();
      if (res.success) {
        toast.success(`Mensagem enviada para ${sendModalLead.name}!`);
        setSendModalLead(null);
        // Atualiza o lead na lista local
        setRadarLeads(prev => prev.map(l => l.id === sendModalLead.id ? { ...l, status: 'contatado' } : l));
      } else {
        toast.error(res.error || 'Erro ao enviar');
      }
    } catch { toast.error('Erro de conexão ao enviar'); }
    finally { setSendingLeadId(null); }
  };

  const startScan = async () => {
    if (!radarNiche || !radarCity) return toast.error('Nicho e Cidade são obrigatórios');

    setIsScanning(true);
    setScanLeadsFound(0);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    let newCampaignId: string | null = null;

    try {
      const response = await standardFetch('/api/v2/radar/leads/scan', {
        method: 'POST',
        body: JSON.stringify({ niche: radarNiche, city: radarCity, limit: radarLimit, context: radarContext, source: radarSource })
      }, 15000);
      const res = await response.json();
      if (!res.success) { toast.error(res.error || 'Erro ao iniciar busca'); setIsScanning(false); return; }
      // Backend agora retorna o campaign_id criado — auto-seleciona
      if (res.campaign_id) {
        newCampaignId = res.campaign_id;
        setSelectedCampaignId(res.campaign_id);
        setRadarStatusFilter('todos');
        setRadarLeads([]);
        fetchCampaigns();
        toast(`📁 Campanha "${res.campaign_name}" criada. Buscando leads...`);
      }
    } catch { /* Timeout ou rede — backend pode estar rodando */ }

    // Polling: verifica a cada 5s se novos leads da campanha apareceram (atualização live)
    let attempts = 0;
    let lastLeadsCount = 0;
    let unchangedCount = 0;
    let foundAny = false;

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const cid = newCampaignId || selectedCampaignId;
        const url = cid ? `/api/v2/radar/leads?campaign_id=${cid}` : '/api/v2/radar/leads';
        const r = await standardFetch(url);
        const data = await r.json();
        if (data.success) {
          const newLeads: any[] = data.data || [];
          const currentCount = newLeads.length;
          setScanLeadsFound(currentCount);
          setRadarLeads(newLeads);

          if (currentCount > 0) {
            foundAny = true;
          }

          if (currentCount === lastLeadsCount) {
            if (foundAny) {
              unchangedCount++;
            }
          } else {
            unchangedCount = 0;
            lastLeadsCount = currentCount;
          }

          // Condições de parada da varredura:
          // 1. Chegou no limite máximo solicitado de resultados
          // 2. Os resultados pararam de mudar por 4 verificações seguidas (~20 segundos) e já achamos pelo menos um
          // 3. Timeout geral de 40 tentativas (~3.3 minutos)
          if (
            (radarLimit && currentCount >= radarLimit) ||
            (unchangedCount >= 4) ||
            (attempts >= 40)
          ) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setIsScanning(false);
            fetchCampaigns();
            if (currentCount > 0) {
              toast.success(`✅ Varredura finalizada! ${currentCount} leads encontrados.`);
            } else {
              toast('Busca finalizada. Nenhum lead novo encontrado.');
            }
          }
        }
      } catch { /* ignora erros de rede no polling */ }
    }, 5000);
  };

  const startAutopilotPolling = () => {
    if (autopilotPollRef.current) clearInterval(autopilotPollRef.current);
    autopilotPollRef.current = setInterval(async () => {
      try {
        const r = await standardFetch('/api/v2/radar/leads/autopilot/progress', { method: 'GET' });
        const data = await r.json();
        setAutopilotProgress(data);
        if (!data.active || (data.jobStatus !== 'running')) {
          clearInterval(autopilotPollRef.current!);
          autopilotPollRef.current = null;
          setIsAutopilotRunning(false);
          if (data.jobStatus === 'done') {
            toast.success(`Piloto concluído! ${data.sent} enviados, ${data.errors} erros.`);
            fetchLeads(selectedCampaignId);
          } else if (data.jobStatus === 'cancelled') {
            toast(`Piloto cancelado. ${data.sent} mensagens já enviadas.`);
            fetchLeads(selectedCampaignId);
          }
        }
      } catch { /* silently ignore poll errors */ }
    }, 2000);
  };

  const confirmAutopilot = async () => {
    if (!autopilotTemplateName) return toast.error('Nome do template é obrigatório');
    if (selectedLeadIds.size === 0) {
      return toast.error('Selecione pelo menos um lead para iniciar o Piloto Automático');
    }
    setIsAutopilotModalOpen(false);
    setIsAutopilotRunning(true);
    setAutopilotProgress(null);
    try {
      const response = await standardFetch('/api/v2/radar/leads/autopilot', {
        method: 'POST',
        body: JSON.stringify({
          leadIds: Array.from(selectedLeadIds),
          limit: 40, minDelay: 60, maxDelay: 180,
          templateName: autopilotTemplateName,
          injectVariable: autopilotInjectVar
        })
      });
      const res = await response.json();
      if (res.success) {
        toast.success(`Piloto iniciado para ${res.count} leads!`);
        startAutopilotPolling();
      } else {
        toast.error(res.error || 'Erro ao iniciar Piloto Automático');
        setIsAutopilotRunning(false);
      }
    } catch (err: any) {
      toast.error(err.message);
      setIsAutopilotRunning(false);
    }
  };

  const cancelAutopilot = async () => {
    try {
      await standardFetch('/api/v2/radar/leads/autopilot', { method: 'DELETE' });
    } catch { /* ignore */ }
  };

  const fetchMyProfilePhone = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();
      if (!error && data?.phone) {
        setTestPhone(data.phone.replace(/\D/g, ''));
      }
    } catch (e) {
      console.warn('Erro ao carregar telefone do perfil:', e);
    }
  };

  const sendTestMessage = async () => {
    if (!testPhone) return toast.error('O número de telefone é obrigatório para o teste.');
    if (!autopilotTemplateName) return toast.error('Selecione um template para testar.');

    // Usa o nome do primeiro lead selecionado para preencher {{1}} na mensagem de teste
    const firstSelectedId = [...selectedLeadIds][0];
    const firstLead = radarLeads.find((l: any) => l.id === firstSelectedId);
    const leadName = firstLead?.name || undefined;

    // Corpo do template já disponível no frontend (para armazenar texto legível no chat)
    const selectedTemplate = metaTemplates.find(t => t.name === autopilotTemplateName);
    const templateBodyText = selectedTemplate?.components?.find((c: any) => c.type === 'BODY')?.text || undefined;

    setIsTestSending(true);
    try {
      const response = await standardFetch('/api/v2/radar/leads/test-send', {
        method: 'POST',
        body: JSON.stringify({
          phone: testPhone,
          templateName: autopilotTemplateName,
          leadName,
          templateBodyText
        })
      });
      const res = await response.json();
      if (res.success) {
        toast.success(res.message || 'Mensagem de teste enviada!');
        setIsTestInputVisible(false);
      } else {
        toast.error(res.error || 'Erro ao enviar mensagem de teste.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro de rede ao enviar teste.');
    } finally {
      setIsTestSending(false);
    }
  };

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      const response = await standardFetch(`/api/v2/radar/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const res = await response.json();
      if (res.success) {
        setRadarLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
        toast.success('Status atualizado!');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const deleteLead = async (id: string) => {
    if (!confirm('Tem certeza?')) return;
    try {
      const response = await standardFetch(`/api/v2/radar/leads/${id}`, { method: 'DELETE' });
      const res = await response.json();
      if (res.success) {
        setRadarLeads(prev => prev.filter(l => l.id !== id));
        toast.success('Lead removido');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const updateLeadNotes = async (id: string, notes: string) => {
    try {
      const response = await standardFetch(`/api/v2/radar/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes })
      });
      const res = await response.json();
      if (res.success) {
        setRadarLeads(prev => prev.map(l => l.id === id ? { ...l, notes } : l));
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const updateLeadContactName = async (id: string, contact_name: string) => {
    try {
      const response = await standardFetch(`/api/v2/radar/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ contact_name })
      });
      const res = await response.json();
      if (res.success) {
        setRadarLeads(prev => prev.map(l => l.id === id ? { ...l, contact_name } : l));
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const validateWhatsApp = async (leadId: string) => {
    setValidatingLeadId(leadId);
    try {
      const response = await standardFetch(`/api/v2/radar/leads/${leadId}/validate-phone`, {
        method: 'POST'
      });
      const res = await response.json();
      if (res.success) {
        if (res.exists) {
          toast.success(res.message || 'WhatsApp ativo!');
        } else {
          toast.error(res.message || 'Número não possui WhatsApp.');
        }
        setRadarLeads(prev => prev.map(lead => 
          lead.id === leadId ? { ...lead, whatsapp_exists: res.exists } : lead
        ));
      } else {
        toast.error(res.error || 'Erro ao validar WhatsApp');
      }
    } catch (err: any) {
      toast.error('Erro na conexão para validação');
    } finally {
      setValidatingLeadId(null);
    }
  };

  const exportLeadsCSV = async () => {
    // 1. Gera e baixa o arquivo CSV contendo Nome, Responsável e Telefone
    const headers = ['Nome', 'Responsável', 'Telefone'];
    const rows = radarLeads.map(l => [
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.contact_name || '').replace(/"/g, '""')}"`,
      l.phone || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_radar_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // 2. Salva a planilha na aba de Campanhas automaticamente
    if (!user?.id) return;
    try {
      toast.loading('Enviando dados para a seção de Campanhas...');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();
      
      const tenantId = profile?.tenant_id || user.id;

      let campaignName = 'Importação Radar';
      if (selectedCampaignId) {
        const selectedC = campaigns.find(c => c.id === selectedCampaignId);
        if (selectedC?.name) {
          campaignName = `Radar: ${selectedC.name}`;
        }
      }

      // Filtra e formata os contatos da lista de radar
      const uploadedContacts = radarLeads
        .map(l => ({
          nome: l.contact_name || l.name || '',
          telefone: (l.phone || '').replace(/\D/g, '')
        }))
        .filter(c => c.telefone);

      if (uploadedContacts.length === 0) {
        toast.dismiss();
        toast.warning('Nenhum contato com telefone válido para criar campanha.');
        return;
      }

      const { error } = await supabase.from('campaigns').insert({
        tenant_id: tenantId,
        name: campaignName,
        template_name: 'prospeccao_fria', // Nome temporário do template
        status: 'pending',
        target_type: 'upload',
        uploaded_contacts: uploadedContacts,
        total_contacts: uploadedContacts.length,
        variables: {},
        sent_count: 0,
        error_count: 0
      });

      toast.dismiss();
      if (error) {
        console.error('[ExportToCampaign] DB Error:', error);
        toast.error('Erro ao salvar na seção de campanhas: ' + error.message);
      } else {
        toast.success(`Planilha importada em Campanhas como "${campaignName}"!`, {
          action: onTabChange ? {
            label: 'Ir para Campanhas',
            onClick: () => onTabChange('campaigns')
          } : undefined,
          duration: 6000
        });
      }
    } catch (err: any) {
      toast.dismiss();
      console.error('[ExportToCampaign] Error:', err);
      toast.error('Erro ao salvar campanha: ' + err.message);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsActionLoading(true);
      await updateGlobalSettings(globalSettings);
      toast.success('Configurações globais salvas!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('name, nome_completo').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          const oauthName = user?.user_metadata?.full_name || user?.user_metadata?.name || null;
          const fullName = (data as any)?.nome_completo || (data as any)?.name || oauthName || null;
          setSenderName(fullName ? fullName.trim().split(/\s+/)[0] : null);
        });
    }
  }, [user?.id]);

  useEffect(() => {
    if (isAutopilotModalOpen) {
      setLoadingTemplates(true);
      listMetaTemplates('APPROVED')
        .then(t => setMetaTemplates(t))
        .catch(e => console.error('Erro ao buscar templates:', e))
        .finally(() => setLoadingTemplates(false));
      setIsTestInputVisible(false);
      setIsTestSending(false);
      setTestPhone('');
    } else {
      setMetaTemplates([]);
      setIsTestInputVisible(false);
      setIsTestSending(false);
      setTestPhone('');
    }
  }, [isAutopilotModalOpen]);

  // Carrega credenciais Meta quando seleciona usuário. Lê do profile (novas colunas)
  // com fallback para tenant_secrets (legacy) caso o admin ainda não tenha migrado.
  useEffect(() => {
    if (isEditModalOpen && selectedUser?.id) {
      setMetaPhoneId((selectedUser as any).meta_phone_id || (selectedUser as any).whatsapp_phone_number_id || '');
      setMetaWabaId((selectedUser as any).meta_waba_id || '');
      // App secret intentionally never echoed back — admin types only to set a new value
      setMetaAppSecret('');
      const fromProfile = (selectedUser as any).meta_access_token as string | undefined;
      if (fromProfile) {
        setMetaAccessToken(fromProfile);
      } else {
        getTenantSecret(selectedUser.id, 'meta_access_token')
          .then(token => setMetaAccessToken(token || ''))
          .catch(() => setMetaAccessToken(''));
      }
      setMetaTestResult(null);
    } else if (!isEditModalOpen) {
      setMetaAccessToken('');
      setMetaPhoneId('');
      setMetaWabaId('');
      setMetaAppSecret('');
      setMetaTestResult(null);
    }
  }, [isEditModalOpen, selectedUser?.id]);

  const filteredProfiles = profiles.filter(p => 
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleResetWhatsApp = async (userId: string) => {
    if (!window.confirm('Resetar sessão? O cliente precisará escanear o QR novamente.')) return;
    try {
      setIsActionLoading(true);
      await resetAdminUserWhatsApp(userId);
      toast.success('Sessão resetada!');
      fetchData();
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'users', label: 'Inquilinos', icon: <Users size={20} /> },
    { id: 'config', label: 'Configurações', icon: <Server size={20} /> },
    { id: 'billing', label: 'Financeiro', icon: <CreditCard size={20} /> },
    { id: 'meta_activator', label: 'Ativador Meta', icon: <Zap size={20} className="text-amber-500" /> },
    { id: 'flags', label: 'Features', icon: <ToggleLeft size={20} /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'flags':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featureFlags.map(flag => (
                <motion.div 
                  key={flag.key}
                  whileHover={{ y: -4 }}
                  className="bg-white rounded-[2rem] p-7 border border-slate-100 shadow-sm hover:shadow-xl hover:border-teal-100 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between mb-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                        flag.enabled ? 'bg-teal-500 text-white shadow-lg shadow-teal-100' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {flag.key === 'leo_ai' ? <Bot size={24} /> : 
                         flag.key === 'agendas' ? <Calendar size={24} /> :
                         flag.key === 'crm' ? <Layers size={24} /> :
                         flag.key === 'analytics' ? <BarChart3 size={24} /> :
                         flag.key === 'chat' ? <MessageSquare size={24} /> :
                         flag.key === 'agent_training_audio' ? <Smartphone size={24} /> :
                         flag.key === 'ai_followup_questions' ? <Zap size={24} /> :
                         flag.key === 'meta_official' ? <Globe size={24} /> :
                         flag.key === 'campaigns' ? <Send size={24} /> :
                         <Zap size={24} className={flag.enabled ? 'animate-pulse' : ''} />}
                      </div>
                      <button 
                        onClick={() => toggleFeatureFlag(flag.key, flag.enabled)}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 ${
                          flag.enabled ? 'bg-teal-500 shadow-inner' : 'bg-slate-200'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                          flag.enabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight mb-2">{flag.label}</h3>
                    <p className="text-slate-500 text-xs font-medium leading-relaxed mb-6">{flag.description}</p>
                  </div>
                  
                  <div className="pt-6 border-t border-slate-50 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</span>
                       <span className={`text-[10px] font-black uppercase tracking-widest ${flag.enabled ? 'text-teal-600' : 'text-slate-400'}`}>
                          {flag.enabled ? 'Ativo' : 'Inativo'}
                       </span>
                    </div>
                    {flag.updated_at && (
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold italic">
                        <Activity size={10} />
                        Modificado {new Date(flag.updated_at).toLocaleDateString('pt-BR')} por {flag.profiles?.email || 'Sistema'}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-10 border border-slate-800 text-center relative overflow-hidden">
               <div className="absolute right-0 top-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl"></div>
               <Shield size={40} className="mx-auto text-teal-500 mb-6" />
               <h4 className="text-xl font-black text-white mb-2">Controle de Engenharia</h4>
               <p className="text-sm text-slate-400 max-w-md mx-auto">As Feature Flags permitem habilitar funcionalidades em tempo real para todos os usuários. Use com responsabilidade durante lançamentos faseados.</p>
            </div>
          </div>
        );
      case 'lead_radar':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
             <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* ── COLUNA ESQUERDA: Campanhas + Nova Busca ── */}
                <div className="lg:col-span-1 space-y-4">

                  {/* Lista de Campanhas */}
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">Campanhas</h3>
                      <span className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded-lg text-[9px] font-black">{campaigns.length}</span>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                      {campaigns.length === 0 && (
                        <p className="px-6 py-8 text-center text-[11px] text-slate-400 font-medium">Nenhuma campanha ainda.<br/>Inicie uma busca abaixo.</p>
                      )}
                      {campaigns.map(c => (
                        <div
                          key={c.id}
                          onClick={() => selectCampaign(c.id)}
                          className={`px-5 py-3.5 cursor-pointer transition-all flex items-center justify-between gap-2 group ${selectedCampaignId === c.id ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
                        >
                          {campaignEditingId === c.id ? (
                            <input
                              autoFocus
                              className="flex-1 text-xs font-bold bg-white border border-primary-300 rounded-lg px-2 py-1 outline-none"
                              value={campaignEditingName}
                              onChange={e => setCampaignEditingName(e.target.value)}
                              onBlur={() => saveCampaignName(c.id)}
                              onKeyDown={e => { if (e.key === 'Enter') saveCampaignName(c.id); if (e.key === 'Escape') setCampaignEditingId(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-black truncate ${selectedCampaignId === c.id ? 'text-primary-700' : 'text-slate-700'}`}>{c.name}</p>
                              <p className="text-[9px] text-slate-400 font-medium">{c.leads_count} leads</p>
                            </div>
                          )}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => { setCampaignEditingId(c.id); setCampaignEditingName(c.name); }}
                              className="p-1 text-slate-300 hover:text-primary-500 rounded-md"
                              title="Renomear"
                            ><Settings size={11} /></button>
                            <button
                              onClick={() => deleteCampaign(c.id)}
                              className="p-1 text-slate-300 hover:text-red-500 rounded-md"
                              title="Deletar"
                            ><Trash2 size={11} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Nova Busca (colapsável) */}
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setRadarSearchOpen(v => !v)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center"><Search size={15} /></div>
                        <h3 className="text-sm font-black text-slate-900">Nova Busca</h3>
                      </div>
                      <ChevronRight size={16} className={`text-slate-400 transition-transform ${radarSearchOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {radarSearchOpen && <div className="px-6 pb-6 space-y-4 border-t border-slate-50 pt-4">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Origem da Busca</label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 border border-slate-200/60 rounded-2xl">
                              <button
                                type="button"
                                onClick={() => setRadarSource('google')}
                                className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                  radarSource === 'google'
                                    ? 'bg-white text-slate-900 shadow-sm border border-slate-100'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                🗺️ Google Maps
                              </button>
                              <button
                                type="button"
                                onClick={() => setRadarSource('instagram')}
                                className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                  radarSource === 'instagram'
                                    ? 'bg-white text-slate-900 shadow-sm border border-slate-100'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                📸 Instagram
                              </button>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nicho / Categoria</label>
                            <input
                              type="text"
                              autoComplete="off"
                              placeholder="Ex: Clínicas, Dentistas..."
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-primary-500 transition-all"
                              value={radarNiche}
                              onChange={(e) => setRadarNiche(e.target.value)}
                            />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cidade / Região</label>
                            <input
                              type="text"
                              autoComplete="off"
                              placeholder="Ex: Rio de Janeiro"
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-primary-500 transition-all"
                              value={radarCity}
                              onChange={(e) => setRadarCity(e.target.value)}
                            />
                         </div>

                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Limite de Resultados</label>
                            <select
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-primary-500 transition-all appearance-none"
                              value={radarLimit}
                              onChange={(e) => setRadarLimit(Number(e.target.value))}
                            >
                               <option value={5}>Máximo de 5 leads</option>
                               <option value={10}>Máximo de 10 leads</option>
                               <option value={20}>Máximo de 20 leads</option>
                               <option value={50}>Máximo de 50 leads</option>
                            </select>
                         </div>
                          {role === 'admin' && (
  <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Apify API Token</label>
                             <input
                               type="password"
                               autoComplete="new-password"
                               placeholder="apify_api_..."
                               className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-primary-500 transition-all"
                               value={globalSettings.apify_api_token || ''}
                               onChange={(e) => setGlobalSettings({...globalSettings, apify_api_token: e.target.value})}
                               onBlur={handleSaveSettings}
                             />
                           </div>
                          )}


                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Contexto da Abordagem</label>
                            <textarea
                              autoComplete="off"
                              placeholder="Ex: Focar na dor de quem atende muito convênio..."
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-primary-500 transition-all resize-none h-20"
                              value={radarContext}
                              onChange={(e) => setRadarContext(e.target.value)}
                            />
                         </div>

                         <div className="space-y-2">
                           <button
                             onClick={startScan}
                             disabled={isScanning || isAutopilotRunning}
                             className="w-full py-3.5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2"
                           >
                              {isScanning ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
                              {isScanning ? 'Varrendo...' : 'Iniciar Radar'}
                           </button>

                           <button
                             onClick={() => {
                               if (selectedLeadIds.size === 0) {
                                 toast.error('Por favor, selecione pelo menos um lead para o Piloto Automático.');
                                 return;
                               }
                               setIsAutopilotModalOpen(true);
                             }}
                             disabled={isScanning || isAutopilotRunning}
                             className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                           >
                              {isAutopilotRunning ? <RefreshCw size={15} className="animate-spin text-green-400" /> : <Rocket size={15} className="text-green-400" />}
                              {isAutopilotRunning ? `Enviando... ${autopilotProgress?.sent ?? 0}/${autopilotProgress?.total ?? '?'}` : 'Piloto Automático'}
                           </button>
                         </div>

                         {/* Painel de progresso do Piloto Automático */}
                         {autopilotProgress && autopilotProgress.active && (
                           <div className="bg-slate-900 rounded-2xl p-4 flex flex-col gap-3">
                             <div className="flex items-center justify-between">
                               <span className="text-[9px] font-black text-green-400 uppercase tracking-widest flex items-center gap-1.5">
                                 <Rocket size={10} /> Piloto Automático
                               </span>
                               {autopilotProgress.jobStatus === 'running' && (
                                 <button onClick={cancelAutopilot} className="text-[9px] font-black text-red-400 hover:text-red-300 uppercase tracking-widest">
                                   Cancelar
                                 </button>
                               )}
                             </div>

                             {/* Barra de progresso */}
                             <div>
                               <div className="flex justify-between mb-1">
                                 <span className="text-[9px] text-slate-400">{autopilotProgress.sent} enviados</span>
                                 <span className="text-[9px] text-slate-400">{autopilotProgress.total} total</span>
                               </div>
                               <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                 <div
                                   className="h-full bg-green-400 rounded-full transition-all duration-500"
                                   style={{ width: `${autopilotProgress.total > 0 ? Math.round((autopilotProgress.sent + autopilotProgress.errors) / autopilotProgress.total * 100) : 0}%` }}
                                 />
                               </div>
                             </div>

                             {/* Lead atual / countdown */}
                             {autopilotProgress.jobStatus === 'running' && (
                               <div className="text-[9px] text-slate-400">
                                 {autopilotProgress.nextSendAt ? (
                                   <AutopilotCountdown nextSendAt={autopilotProgress.nextSendAt} />
                                 ) : autopilotProgress.currentLead ? (
                                   <span>Enviando para <span className="text-white font-bold">{autopilotProgress.currentLead}</span>...</span>
                                 ) : null}
                               </div>
                             )}
                             {autopilotProgress.jobStatus === 'done' && (
                               <span className="text-[9px] font-black text-green-400">Concluído!</span>
                             )}
                             {autopilotProgress.jobStatus === 'cancelled' && (
                               <span className="text-[9px] font-black text-amber-400">Cancelado</span>
                             )}

                             {/* Erros */}
                             {autopilotProgress.errors > 0 && (
                               <span className="text-[9px] text-red-400">{autopilotProgress.errors} erro(s)</span>
                             )}

                             {/* Log dos últimos envios */}
                             {autopilotProgress.log.length > 0 && (
                               <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                                 {autopilotProgress.log.slice(0, 8).map((entry, idx) => (
                                   <div key={idx} className="flex items-center gap-1.5">
                                     <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.status === 'sent' ? 'bg-green-400' : 'bg-red-400'}`} />
                                     <span className="text-[9px] text-slate-300 truncate flex-1">{entry.name}</span>
                                     <span className="text-[9px] text-slate-500 flex-shrink-0">{entry.time}</span>
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                         )}
                    </div>}
                  </div>
                </div>

                {/* ── COLUNA DIREITA: Leads da Campanha Selecionada ── */}
                <div className="lg:col-span-3 space-y-4">
                   <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden min-h-[600px]">
                      {/* Header */}
                      <div className="p-6 border-b border-slate-50 flex items-center justify-between flex-wrap gap-4">
                         <div>
                            <div className="flex items-center gap-3">
                              {selectedCampaignId
                                ? <h2 className="text-xl font-black text-slate-900">{campaigns.find(c => c.id === selectedCampaignId)?.name || 'Campanha'}</h2>
                                : <h2 className="text-xl font-black text-slate-900">Todos os Leads</h2>
                              }
                              {isScanning && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                  {radarSource === 'instagram' ? 'Varrendo Instagram' : 'Varrendo Google Maps'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                              {isScanning 
                                ? 'Os leads estão sendo adicionados ao vivo. Aguarde a finalização da busca.' 
                                : selectedCampaignId ? 'Leads desta campanha' : 'Selecione uma campanha ou inicie uma busca'
                              }
                            </p>
                         </div>
                         <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-primary-50 text-primary-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                               {radarLeads.length} Total
                            </span>
                            {radarLeads.length > 0 && (
                              <button
                                onClick={exportLeadsCSV}
                                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-1.5"
                              >
                                <FileText size={12} /> Exportar CSV
                              </button>
                            )}
                         </div>
                      </div>

                      {/* Filtros por status */}
                      <div className="px-8 py-4 border-b border-slate-50 flex items-center gap-2 flex-wrap">
                        {(['todos', 'novo', 'qualificado', 'contatado', 'descartado'] as const).map(s => {
                          const counts: Record<string, number> = { todos: radarLeads.length, novo: 0, qualificado: 0, contatado: 0, descartado: 0 };
                          radarLeads.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });
                          const labels: Record<string, string> = { todos: 'Todos', novo: 'Novo', qualificado: 'Qualificado', contatado: 'Contatado', descartado: 'Descartado' };
                          return (
                            <button
                              key={s}
                              onClick={() => setRadarStatusFilter(s)}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                                radarStatusFilter === s
                                  ? 'bg-primary-600 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {labels[s]}
                              <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${radarStatusFilter === s ? 'bg-white/20' : 'bg-slate-200 text-slate-400'}`}>
                                {counts[s]}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* ── Barra de Ações em Massa ── */}
                      {selectedLeadIds.size > 0 && (
                        <div className="px-6 py-3 bg-primary-50 border-b border-primary-100 flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-black text-primary-700">{selectedLeadIds.size} selecionado{selectedLeadIds.size > 1 ? 's' : ''}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {['qualificado', 'contatado', 'descartado', 'novo'].map(s => (
                              <button
                                key={s}
                                onClick={() => bulkUpdateStatus(s)}
                                disabled={isBulkActing}
                                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 ${
                                  s === 'qualificado' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' :
                                  s === 'contatado'   ? 'bg-primary-50 text-primary-600 border-primary-200 hover:bg-primary-100' :
                                  s === 'descartado'  ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100' :
                                  'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                → {s}
                              </button>
                            ))}
                            <div className="w-px h-4 bg-primary-200" />
                            <button
                              onClick={bulkDeleteLeads}
                              disabled={isBulkActing}
                              className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              <Trash2 size={11} /> Deletar
                            </button>
                            <button
                              onClick={() => setSelectedLeadIds(new Set())}
                              className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto">
                         <table className="w-full text-left">
                            <thead>
                              {(() => {
                                const visibleLeads = radarStatusFilter === 'todos' ? radarLeads : radarLeads.filter(l => l.status === radarStatusFilter);
                                const allSelected = visibleLeads.length > 0 && selectedLeadIds.size === visibleLeads.length;
                                return (
                                <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                  <th className="px-4 py-4 w-10">
                                    <input
                                      type="checkbox"
                                      checked={allSelected}
                                      onChange={() => toggleSelectAll(visibleLeads.map(l => l.id))}
                                      className="w-4 h-4 rounded accent-primary-600 cursor-pointer"
                                    />
                                  </th>
                                  <th className="px-4 py-4">Estabelecimento</th>
                                  <th className="px-4 py-4">Contato & Rating</th>
                                  <th className="px-4 py-4 text-center">Score</th>
                                  <th className="px-4 py-4 text-center">Ações de Contato</th>
                                  <th className="px-4 py-4">Status</th>
                                  <th className="px-4 py-4 text-right">Ações</th>
                                </tr>
                                );
                              })()}
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                               {(radarStatusFilter === 'todos' ? radarLeads : radarLeads.filter(l => l.status === radarStatusFilter)).map((lead) => {
                                 const phoneDigits = (lead.phone || '').replace(/\D/g, '');
                                 const waPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
                                 const painScore = lead.pain_score || 0;
                                 const oppScore = lead.opportunity_score || 0;
                                 const isHot = painScore >= 3 && oppScore >= 2;
                                 const isSelected = selectedLeadIds.has(lead.id);
                                 return (
                                 <tr key={lead.id} className={`hover:bg-slate-50/50 transition-colors group ${isSelected ? 'bg-primary-50/40' : ''}`}>
                                   {/* Checkbox */}
                                   <td className="px-4 py-4 w-10" onClick={e => e.stopPropagation()}>
                                     <input
                                       type="checkbox"
                                       checked={isSelected}
                                       onChange={() => toggleLeadSelection(lead.id)}
                                       className="w-4 h-4 rounded accent-primary-600 cursor-pointer"
                                     />
                                   </td>
                                   {/* Estabelecimento */}
                                   <td className="px-4 py-4">
                                      <div className="flex flex-col gap-1 max-w-[200px]">
                                         <div className="flex items-start gap-1.5">
                                           <span className="text-sm font-black text-slate-900 leading-tight">{lead.name}</span>
                                           {isHot && <span className="text-base leading-none mt-0.5" title="Hot Lead">🔥</span>}
                                         </div>
                                         {/* Nome próprio do responsável — usado como {{1}} no template */}
                                         <input
                                           type="text"
                                           placeholder="Nome do responsável..."
                                           className={`w-full px-2 py-1 rounded-md text-[10px] border outline-none transition-all ${lead.contact_name ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold' : 'bg-slate-50 border-slate-100 text-slate-500'} focus:border-primary-300 focus:bg-white`}
                                           defaultValue={lead.contact_name || ''}
                                           title="Nome próprio para usar no template WhatsApp (variável {{1}})"
                                           onBlur={(e) => {
                                             const val = e.target.value.trim();
                                             if (val !== (lead.contact_name || '')) {
                                               updateLeadContactName(lead.id, val);
                                             }
                                           }}
                                         />
                                         {lead.niche && (
                                           <span className="inline-flex w-fit px-2 py-0.5 bg-primary-50 text-primary-600 rounded-md text-[9px] font-black uppercase tracking-widest">{lead.niche}</span>
                                         )}
                                         <span className="text-[10px] text-slate-400 font-medium truncate">{lead.address}</span>
                                         <div className="flex gap-2 mt-0.5">
                                            {lead.instagram && (
                                              <a href={lead.instagram.startsWith('http') ? lead.instagram : `https://instagram.com/${lead.instagram}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-600 text-[10px] font-bold flex items-center gap-0.5">
                                                <ExternalLink size={9} /> Instagram
                                              </a>
                                            )}
                                            {lead.email && (
                                              <a href={`mailto:${lead.email}`} className="text-slate-400 hover:text-slate-600 text-[10px] font-bold flex items-center gap-0.5">
                                                <Mail size={9} /> Email
                                              </a>
                                            )}
                                         </div>
                                      </div>
                                   </td>

                                   {/* Contato & Rating */}
                                   <td className="px-4 py-4">
                                      <div className="flex flex-col gap-1.5">
                                         <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-slate-700 hover:text-[#25D366] transition-colors flex items-center gap-1">
                                           <Smartphone size={10} /> {lead.phone || 'Sem Telefone'}
                                         </a>
                                         {lead.place_id?.startsWith('ig_') ? (
                                           <span className="text-[10px] text-pink-500 font-bold flex items-center gap-1">
                                             📸 Perfil Instagram
                                           </span>
                                         ) : (
                                           <>
                                             <div className="flex items-center gap-1">
                                                {[1,2,3,4,5].map(i => (
                                                  <Star key={i} size={9} className={i <= Math.round(lead.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
                                                ))}
                                                <span className="text-[10px] font-black text-slate-500 ml-1">{lead.rating}</span>
                                             </div>
                                             <span className="text-[10px] text-slate-400">{lead.user_rating_count} avaliações</span>
                                           </>
                                         )}
                                         {lead.website && (
                                           <a href={lead.website} target="_blank" rel="noreferrer" className="text-[10px] text-primary-500 hover:text-primary-600 flex items-center gap-0.5 truncate max-w-[140px]">
                                             <Globe size={9} /> Site
                                           </a>
                                         )}
                                      </div>
                                   </td>

                                   {/* Score visual */}
                                   <td className="px-4 py-4">
                                      <div className="flex flex-col gap-2 items-center min-w-[90px]">
                                         <div className="w-full">
                                           <div className="flex justify-between mb-1">
                                             <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Dor</span>
                                             <span className="text-[9px] font-black text-red-500">{painScore}/5</span>
                                           </div>
                                           <div className="flex gap-0.5">
                                             {[1,2,3,4,5].map(i => (
                                               <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= painScore ? 'bg-red-400' : 'bg-slate-100'}`} />
                                             ))}
                                           </div>
                                         </div>
                                         <div className="w-full">
                                           <div className="flex justify-between mb-1">
                                             <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Potencial</span>
                                             <span className="text-[9px] font-black text-emerald-500">{oppScore}/3</span>
                                           </div>
                                           <div className="flex gap-0.5">
                                             {[1,2,3].map(i => (
                                               <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= oppScore ? 'bg-emerald-400' : 'bg-slate-100'}`} />
                                             ))}
                                           </div>
                                         </div>
                                      </div>
                                   </td>

                                   {/* Ações de Contato */}
                                   <td className="px-4 py-4">
                                      <div className="flex flex-col gap-2 items-center justify-center min-w-[180px]">
                                         {/* Validação de WhatsApp */}
                                         {lead.whatsapp_exists === true ? (
                                           <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-wider w-full justify-center">
                                             ✅ WhatsApp Ativo
                                           </span>
                                         ) : lead.whatsapp_exists === false ? (
                                           <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-wider w-full justify-center">
                                             ❌ Sem WhatsApp
                                           </span>
                                         ) : (
                                           <button
                                             onClick={() => validateWhatsApp(lead.id)}
                                             disabled={validatingLeadId === lead.id}
                                             className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-all border border-slate-200/60 disabled:opacity-50"
                                           >
                                             🔍 {validatingLeadId === lead.id ? 'Validando...' : 'Validar WhatsApp'}
                                           </button>
                                         )}

                                         {/* Enviar Mensagem */}
                                         {lead.phone && (
                                            <button
                                              onClick={() => openSendModal(lead)}
                                              disabled={sendingLeadId === lead.id}
                                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#25D366] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#128C7E] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                               <MessageSquare size={11} /> {sendingLeadId === lead.id ? 'Enviando...' : 'Enviar Mensagem'}
                                            </button>
                                         )}
                                      </div>
                                   </td>

                                   {/* Status */}
                                   <td className="px-4 py-4">
                                      <select
                                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border outline-none cursor-pointer ${
                                          lead.status === 'qualificado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                          lead.status === 'contatado'   ? 'bg-primary-50 text-primary-600 border-primary-100' :
                                          lead.status === 'descartado'  ? 'bg-red-50 text-red-500 border-red-100' :
                                          'bg-slate-100 text-slate-500 border-slate-200'
                                        }`}
                                        value={lead.status}
                                        onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                                      >
                                         <option value="novo">Novo</option>
                                         <option value="qualificado">Qualificado</option>
                                         <option value="contatado">Contatado</option>
                                         <option value="descartado">Descartado</option>
                                      </select>
                                   </td>

                                   {/* Ações */}
                                   <td className="px-4 py-4 text-right">
                                      <button
                                         onClick={() => deleteLead(lead.id)}
                                         className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                         title="Remover lead"
                                      >
                                         <Trash2 size={16} />
                                      </button>
                                   </td>
                                 </tr>
                                 );
                               })}
                               {radarLeads.length === 0 && (
                                 <tr>
                                    <td colSpan={7} className="px-8 py-20 text-center">
                                       {isScanning ? (
                                         <div className="flex flex-col items-center gap-4">
                                            <div className="relative">
                                              <div className="w-16 h-16 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin" />
                                              <div className="absolute inset-0 flex items-center justify-center">
                                                <Search size={22} className="text-primary-600 animate-pulse" />
                                              </div>
                                            </div>
                                            <div className="space-y-1">
                                              <p className="text-sm font-black text-slate-800 uppercase tracking-widest animate-pulse">Varrendo o Google Maps...</p>
                                              <p className="text-xs text-slate-400 font-medium">Buscando e analisando estabelecimentos locais. Pode levar de 1 a 2 minutos.</p>
                                            </div>
                                         </div>
                                       ) : (
                                         <div className="flex flex-col items-center gap-4 opacity-30">
                                            <Search size={48} />
                                            <p className="text-sm font-bold uppercase tracking-widest">
                                              {selectedCampaignId ? 'Nenhum lead nessa campanha ainda.' : 'Selecione uma campanha ou inicie uma nova busca.'}
                                            </p>
                                         </div>
                                       )}
                                    </td>
                                 </tr>
                               )}
                               {radarLeads.length > 0 && (radarStatusFilter === 'todos' ? radarLeads : radarLeads.filter(l => l.status === radarStatusFilter)).length === 0 && (
                                 <tr>
                                    <td colSpan={7} className="px-8 py-16 text-center">
                                       <div className="flex flex-col items-center gap-3 opacity-40">
                                          <Search size={32} />
                                          <p className="text-sm font-bold uppercase tracking-widest">Nenhum lead com status "{radarStatusFilter}"</p>
                                       </div>
                                    </td>
                                 </tr>
                               )}
                            </tbody>
                         </table>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        );
      case 'meta_activator':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 max-w-4xl mx-auto">
            <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all"><Globe size={120} /></div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Ativador de API Oficial</h3>
                    <p className="text-slate-400 text-xs">Ative números e configure webhooks da Meta sem precisar de ferramentas externas.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Access Token (Meta Admin)</label>
                      <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                          type="password" 
                          placeholder="EAA..." 
                          className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-amber-500 outline-none transition-all"
                          value={metaAccessToken}
                          onChange={(e) => setMetaAccessToken(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Phone Number ID</label>
                      <div className="relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                          type="text" 
                          placeholder="ID do número..." 
                          className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-amber-500 outline-none transition-all"
                          value={metaPhoneId}
                          onChange={(e) => setMetaPhoneId(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">WABA ID / Business ID</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                          type="text" 
                          placeholder="ID do WABA..." 
                          className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-amber-500 outline-none transition-all"
                          value={metaWabaId}
                          onChange={(e) => setMetaWabaId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">PIN de Segurança (Opcional)</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input 
                          type="text" 
                          placeholder="Padrão: 123456" 
                          className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-amber-500 outline-none transition-all"
                          value={metaAppSecret} // Reusing this field as temporary PIN for this UI
                          onChange={(e) => setMetaAppSecret(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 mt-8">
                    <button 
                      onClick={async () => {
                        if (!metaAccessToken || !metaPhoneId) return toast.error('Preencha o Token e o Phone ID');
                        setIsActionLoading(true);
                        try {
                          const { registerMetaNumber } = await import('../services/supabaseService');
                          const r = await registerMetaNumber(metaAccessToken, metaPhoneId, metaAppSecret || '123456');
                          if (r.success) toast.success('Número ativado com sucesso! ✓');
                          else toast.error(r.error || 'Erro ao ativar número');
                        } catch (e: any) {
                          toast.error(e.message);
                        } finally {
                          setIsActionLoading(false);
                        }
                      }}
                      disabled={isActionLoading}
                      className="flex-1 py-5 bg-amber-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-amber-700 transition-all flex items-center justify-center gap-2 group shadow-xl"
                    >
                      {isActionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                      1. Ativar Número na API
                    </button>

                    <button 
                      onClick={async () => {
                        if (!metaAccessToken || !metaWabaId) return toast.error('Preencha o Token e o WABA ID');
                        setIsActionLoading(true);
                        try {
                          const { subscribeMetaApp } = await import('../services/supabaseService');
                          const r = await subscribeMetaApp(metaAccessToken, metaWabaId);
                          if (r.success) toast.success('Webhook inscrito com sucesso! ✓');
                          else toast.error(r.error || 'Erro ao inscrever webhook');
                        } catch (e: any) {
                          toast.error(e.message);
                        } finally {
                          setIsActionLoading(false);
                        }
                      }}
                      disabled={isActionLoading}
                      className="flex-1 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 group shadow-xl"
                    >
                      {isActionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Globe size={16} />}
                      2. Inscrever Webhook no App
                    </button>
                  </div>

                  <div className="bg-black/30 rounded-3xl p-6 mt-10 border border-white/5">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-4">Instruções de Onboarding</h4>
                    <ul className="space-y-3">
                      {[
                        'Certifique-se de que o Token de Acesso tenha as permissões whatsapp_business_management e whatsapp_business_messaging.',
                        'O Phone Number ID é encontrado nas configurações de API do WhatsApp no Meta Developers.',
                        'Após ativar o número, aguarde 30 segundos antes de realizar a inscrição no App.',
                        'Uma vez inscrito, as mensagens do cliente começarão a chegar automaticamente.'
                      ].map((text, i) => (
                        <li key={i} className="flex gap-3 text-[11px] text-slate-400 leading-relaxed">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5 shrink-0"></div>
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'overview':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Inquilinos', value: stats.totalUsers, icon: <Globe />, color: 'from-primary-600 to-primary-600', trend: '+5%' },
                { label: 'Sessões Ativas', value: stats.activeSessions, icon: <Zap />, color: 'from-emerald-500 to-teal-500', trend: 'Saudável' },
                { label: 'Mensagens / Mês', value: stats.totalMessages, icon: <MessageSquare />, color: 'from-purple-600 to-violet-600', trend: '+12%' },
                { label: 'Agentes Online', value: stats.totalAgents, icon: <Bot />, color: 'from-amber-500 to-orange-500', trend: 'Estável' }
              ].map((stat, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={stat.label}
                  className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all"
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} text-white flex items-center justify-center mb-4 shadow-lg shadow-primary-500/10`}>
                    {stat.icon}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                  <div className="flex items-end gap-2">
                    <h4 className="text-3xl font-black text-slate-900">{stat.value.toLocaleString()}</h4>
                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full mb-1">{stat.trend}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Atividade Global</h3>
                    <p className="text-sm text-slate-500">Monitoramento de interações em tempo real.</p>
                  </div>
                  <div className="h-64 bg-white rounded-2xl">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData}>
                      <defs>
                        <linearGradient id="colorAdminIA" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="hour" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                        interval={4}
                      />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="ia" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorAdminIA)" />
                      <Area type="monotone" dataKey="human" stroke="#10b981" strokeWidth={3} fillOpacity={0.1} fill="#10b981" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

              <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><CheckCircle2 size={120} /></div>
                <div className="relative z-10">
                  <h3 className="text-xl font-black mb-1">Status do Sistema</h3>
                  <p className="text-slate-400 text-xs mb-8">Tudo operando normalmente.</p>
                  
                  <div className="space-y-4">
                    {[
                      { l: 'Base de Dados', s: 'Online', c: 'bg-emerald-500' },
                      { l: 'Motor de IA', s: 'Estável', c: 'bg-emerald-500' },
                      { l: 'WhatsApp Bridge', s: 'Ativo', c: 'bg-emerald-500' },
                      { l: 'Redis Cache', s: 'Online', c: 'bg-emerald-500' }
                    ].map(item => (
                      <div key={item.l} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-xs font-bold text-slate-300">{item.l}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">{item.s}</span>
                          <div className={`w-2 h-2 ${item.c} rounded-full`}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'users':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
             <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden min-h-[500px]">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <div>
                      <h2 className="text-2xl font-black text-slate-900">Inquilinos</h2>
                      <p className="text-sm text-slate-500">Gerencie todos os clientes e suas instâncias.</p>
                   </div>
                   <div className="flex items-center gap-3 w-full md:w-auto">
                      <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          placeholder="Pesquisar por nome ou email..."
                          className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-inner"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const r = await standardFetch('/api/v2/admin/sync-instances', { method: 'POST' }, 60000);
                            const d = await r.json();
                            if (d.success) { toast.success('WhatsApp sincronizado!'); fetchData(); }
                            else toast.error(d.error);
                          } catch { toast.error('Erro ao sincronizar'); }
                        }}
                        className="flex items-center gap-2 px-4 py-3.5 bg-emerald-500 text-white rounded-2xl text-sm font-bold hover:bg-emerald-600 transition-all whitespace-nowrap shadow-sm"
                      >
                        <RefreshCw size={16} />
                        Sincronizar WPP
                      </button>
                   </div>
                </div>

                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead>
                         <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                            <th className="px-8 py-5">Perfil</th>
                            <th className="px-8 py-5">WhatsApp</th>
                            <th className="px-8 py-5">Plano</th>
                            <th className="px-8 py-5">Cargo</th>
                            <th className="px-8 py-5 text-center">Consumo</th>
                            <th className="px-8 py-5 text-right">Ações</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {filteredProfiles.map((user) => (
                           <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                             <td className="px-8 py-5">
                                <div className="flex items-center gap-4">
                                   <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-black border border-slate-200 shadow-sm">
                                      {user.photo_url ? <img src={user.photo_url} alt="" className="w-full h-full object-cover rounded-2xl" /> : user.email[0].toUpperCase()}
                                   </div>
                                   <div>
                                      <p className="text-sm font-black text-slate-900">{user.nome_completo || user.full_name || user.name || 'Sem nome'}</p>
                                      <p className="text-[11px] text-slate-400 font-medium">{user.email}</p>
                                   </div>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                                   user.whatsapp_status === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                                }`}>
                                   <div className={`w-2 h-2 rounded-full ${user.whatsapp_status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                   <span className="text-[10px] font-black uppercase tracking-widest">{user.whatsapp_status === 'connected' ? 'Conectado' : 'Desconectado'}</span>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                                  user.plano === 'Elite' ? 'bg-primary-50 text-primary-600 border-primary-100' :
                                  user.plano === 'Pro' ? 'bg-violet-50 text-violet-600 border-violet-100' :
                                  'bg-slate-50 text-slate-500 border-slate-100'
                                }`}>
                                   {user.plano || 'Starter'}
                                </span>
                             </td>
                             <td className="px-8 py-5">
                                <button
                                  onClick={() => {
                                    const normalized = { ...user, role: ((user as any).role === 'admin' ? 'admin' : 'client') as any };
                                    setSelectedUser(normalized);
                                    setIsEditModalOpen(true);
                                  }}
                                  title="Clique para alterar o cargo"
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all hover:opacity-80 ${
                                    (user as any).role === 'admin'
                                      ? 'bg-amber-50 text-amber-600 border-amber-100'
                                      : 'bg-slate-50 text-slate-500 border-slate-100'
                                  }`}
                                >
                                  {(user as any).role === 'admin' ? 'Admin' : 'Cliente'}
                                </button>
                             </td>
                             <td className="px-8 py-5 text-center">
                                <p className="text-sm font-black text-emerald-600">R$ {(financeStats.userCosts[user.id] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                             </td>
                             <td className="px-8 py-5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                   <button 
                                      onClick={() => handleViewActivity(user.id)}
                                      className="p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                                      title="Logs"
                                   >
                                      <FileText size={18} />
                                   </button>
                                   <button 
                                      onClick={() => handleResetWhatsApp(user.id)}
                                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                      title="Resetar"
                                   >
                                      <RefreshCw size={18} />
                                   </button>
                                   <button 
                                      onClick={() => {
                                        const normalized = { ...user, role: ((user as any).role === 'admin' ? 'admin' : 'client') as any };
                                        setSelectedUser(normalized);
                                        setIsEditModalOpen(true);
                                      }}
                                      className="p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                                      title="Editar"
                                   >
                                      <Settings size={18} />
                                   </button>
                                </div>
                             </td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        );

      case 'config':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="lg:col-span-2 space-y-8">
              {/* Master AI Card */}
              <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all"><Bot size={120} /></div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
                      <Zap size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black">Provedores de Inteligência</h3>
                      <p className="text-slate-400 text-xs">Configure as chaves mestras e o modelo padrão do sistema.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    {[
                      { id: 'openai', label: 'OpenAI (ChatGPT)', icon: 'O', desc: 'Melhor para lógica complexa' },
                      { id: 'gemini', label: 'Google Gemini 1.5', icon: 'G', desc: 'Rápido e multimodal' }
                    ].map(p => (
                      <button 
                        key={p.id}
                        onClick={() => setGlobalSettings({...globalSettings, llm_provider: p.id})}
                        className={`p-5 rounded-3xl border transition-all text-left flex items-start gap-4 ${
                          globalSettings.llm_provider === p.id 
                            ? 'bg-primary-600 border-primary-400' 
                            : 'bg-slate-800 border-white/5 opacity-40 hover:opacity-100 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${p.id === 'openai' ? 'bg-white text-black' : 'bg-primary-500 text-white'}`}>
                          {p.icon}
                        </div>
                        <div>
                          <p className="text-sm font-black tracking-tight">{p.label}</p>
                          <p className="text-[10px] text-white/60 font-medium uppercase tracking-widest">{p.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">OpenAI Secret Key</label>
                        <div className="relative">
                          <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                          <input 
                            type="password" 
                            placeholder="sk-..." 
                            className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-primary-500 outline-none transition-all"
                            value={globalSettings.openai_api_key || ''}
                            onChange={(e) => setGlobalSettings({...globalSettings, openai_api_key: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Gemini Secret Key</label>
                        <div className="relative">
                          <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                          <input 
                            type="password" 
                            placeholder="AIza..." 
                            className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-primary-500 outline-none transition-all"
                            value={globalSettings.gemini_api_key || ''}
                            onChange={(e) => setGlobalSettings({...globalSettings, gemini_api_key: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        {/* Google Maps API Key was moved to Lead Radar tab */}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Modelo Ativo ({globalSettings.llm_provider?.toUpperCase()})</label>
                        <div className="relative">
                          <Bot className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                          <select 
                            className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-primary-500 outline-none transition-all appearance-none"
                            value={globalSettings.default_ai_model}
                            onChange={(e) => setGlobalSettings({...globalSettings, default_ai_model: e.target.value})}
                          >
                            {globalSettings.llm_provider === 'openai' ? (
                              <>
                                <option value="gpt-4.1-mini">GPT-4.1 Mini (Recomendado — usado no n8n)</option>
                                <option value="gpt-4.1">GPT-4.1 (Robusto Premium)</option>
                                <option value="gpt-4o">GPT-4o (Robusto)</option>
                                <option value="gpt-4o-mini">GPT-4o Mini (Econômico)</option>
                                <option value="o1-preview">o1-preview (Raciocínio Avançado)</option>
                                <option value="o1-mini">o1-mini (Raciocínio Rápido)</option>
                                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                <option value="gpt-4">GPT-4</option>
                              </>
                            ) : (
                              <>
                                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                <option value="gemini-1.5-flash-8b">Gemini 1.5 Flash-8b (Ultra Econômico)</option>
                                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
                              </>
                            )}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Câmbio USD → BRL</label>
                        <div className="relative">
                          <TrendingUp className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                          <input 
                            type="number" 
                            step="0.01"
                            className="w-full bg-slate-800 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-200 focus:border-primary-500 outline-none transition-all"
                            value={globalSettings.usd_brl_rate}
                            onChange={(e) => setGlobalSettings({...globalSettings, usd_brl_rate: parseFloat(e.target.value)})}
                          />
                        </div>
                      </div>
                    </div>

                  </div>

                  <button 
                    onClick={handleSaveSettings}
                    disabled={isActionLoading}
                    className="w-full mt-8 py-5 bg-primary-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-primary-700 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-primary-500/10"
                  >
                    {isActionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                    Salvar Configurações de IA
                  </button>
                </div>
              </div>

              {/* WhatsApp Infrastructure Card */}
              <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-100">
                      <MessageSquare size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Infraestrutura WhatsApp</h3>
                      <p className="text-slate-500 text-xs">Defina o provedor global de mensagens para toda a plataforma.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    {[
                      { id: 'evolution', label: 'Evolution API', desc: 'QR Code / Baileys', active: true },
                      { id: 'uazapi', label: 'UazAPI', desc: 'Alta Performance', active: true },
                      { id: 'meta_official', label: 'API Oficial (Meta)', desc: 'Cloud API', active: true }
                    ].map(p => (
                      <button 
                        key={p.id}
                        type="button"
                        onClick={() => setGlobalSettings({...globalSettings, whatsapp_provider: p.id})}
                        className={`p-5 rounded-3xl border-2 text-left transition-all relative group flex flex-col gap-2 ${
                          globalSettings.whatsapp_provider === p.id 
                            ? 'border-primary-600 bg-primary-50/30' 
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Provedor</span>
                          {globalSettings.whatsapp_provider === p.id && (
                            <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse"></div>
                          )}
                        </div>
                        <div>
                          <p className={`text-sm font-black ${globalSettings.whatsapp_provider === p.id ? 'text-primary-900' : 'text-slate-700'}`}>{p.label}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">{p.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <p className="text-[9px] text-slate-400 font-medium px-1 mb-8 italic">
                    * Esta configuração define qual adaptador o sistema usará para enviar mensagens quando não houver uma configuração específica no agente.
                  </p>

                  <button 
                    onClick={handleSaveSettings}
                    disabled={isActionLoading}
                    className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2 group shadow-xl"
                  >
                    {isActionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                    Salvar Infraestrutura
                  </button>
                </div>
              </div>

              {/* Support Settings Card */}
              <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-sm border border-primary-100">
                      <Smartphone size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Suporte Técnico</h3>
                      <p className="text-slate-500 text-xs">Configure o número de WhatsApp para ajudar usuários com dificuldade de login.</p>
                    </div>
                  </div>

                  <div className="space-y-6 mb-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">WhatsApp de Suporte</label>
                      <div className="relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="text" 
                          placeholder="Ex: 5511999999999" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-700 focus:border-primary-500 outline-none transition-all"
                          value={globalSettings.support_whatsapp || ''}
                          onChange={(e) => setGlobalSettings({...globalSettings, support_whatsapp: e.target.value})}
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 font-medium px-1">Este número será usado no link "Falar com o suporte" na tela de login.</p>
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveSettings}
                    disabled={isActionLoading}
                    className="w-full py-5 bg-primary-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-primary-700 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-primary-500/10"
                  >
                    {isActionLoading ? <RefreshCw className="animate-spin" size={20} /> : (
                      <>
                        <Save size={18} /> Salvar Configuração de Suporte
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Monitoring Alerts Card */}
              <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm border border-amber-100">
                      <Activity size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Alertas de Monitoramento</h3>
                      <p className="text-slate-500 text-xs">Configure quem recebe e quem envia os alertas de saúde do sistema.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">WhatsApp de Destino (Admin)</label>
                      <div className="relative">
                        <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="text" 
                          placeholder="Ex: 5511999999999" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-700 focus:border-primary-500 outline-none transition-all"
                          value={globalSettings.admin_notification_phone || ''}
                          onChange={(e) => setGlobalSettings({...globalSettings, admin_notification_phone: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">ID do Usuário Remetente (UUID)</label>
                      <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="text" 
                          placeholder="UUID do usuário que enviará o alerta" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-700 focus:border-primary-500 outline-none transition-all"
                          value={globalSettings.admin_notification_user_id || ''}
                          onChange={(e) => setGlobalSettings({...globalSettings, admin_notification_user_id: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveSettings}
                    disabled={isActionLoading}
                    className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group"
                  >
                    {isActionLoading ? <RefreshCw className="animate-spin" size={20} /> : (
                      <>
                        <Shield size={18} /> Salvar Configurações de Alerta
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* System Prompts Card */}
              <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-sm border border-primary-100">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Prompts do Sistema</h3>
                      <p className="text-slate-500 text-xs">Configure como a IA processa o conhecimento dos agentes.</p>
                    </div>
                  </div>

                  <div className="space-y-6 mb-8">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Análise de Lacunas (Áudio/Treinamento)</label>
                        {globalSettings.updated_at && (
                          <span className="text-[9px] text-slate-400 font-bold">
                            Última edição: {new Date(globalSettings.updated_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <textarea 
                          rows={12}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-700 focus:border-primary-500 outline-none transition-all font-mono leading-relaxed"
                          value={globalSettings.knowledge_analysis_prompt || ''}
                          onChange={(e) => setGlobalSettings({...globalSettings, knowledge_analysis_prompt: e.target.value})}
                          placeholder="Digite o prompt do sistema aqui..."
                        />
                      </div>
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex gap-3">
                        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                          <b>Nota explicativa:</b> Este prompt define como a IA analisa as transcrições dos clientes e gera perguntas de refinamento. Edite com cuidado para não quebrar a lógica de retorno JSON.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveSettings}
                    disabled={isActionLoading}
                    className="w-full py-5 bg-primary-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-primary-700 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-primary-500/10"
                  >
                    {isActionLoading ? <RefreshCw className="animate-spin" size={20} /> : (
                      <>
                        <Save size={18} /> Salvar Prompt de Análise
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
                 <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-3">
                   <Shield size={20} className="text-emerald-500" /> Segurança & Acesso
                 </h3>
                 
                 <div className="space-y-4">
                    {[
                      { id: 'maintenance_mode', label: 'Manutenção Global', desc: 'Bloqueia acesso de todos clientes', icon: <Lock />, color: 'red' },
                      { id: 'allow_signups', label: 'Novas Inscrições', desc: 'Permitir novos usuários via Login', icon: <Users />, color: 'emerald' }
                    ].map(item => (
                      <div key={item.id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-${item.color}-500 transition-colors border border-slate-100`}>
                            {item.icon}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{item.label}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{item.desc}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setGlobalSettings({...globalSettings, [item.id]: !globalSettings[item.id as any]})}
                          className={`w-12 h-6 rounded-full relative transition-all shadow-inner ${globalSettings[item.id as any] ? (item.id === 'maintenance_mode' ? 'bg-red-500' : 'bg-emerald-500') : 'bg-slate-200'}`}
                        >
                          <div className={`absolute w-4.5 h-4.5 bg-white rounded-full top-0.75 shadow-sm transition-all ${globalSettings[item.id as any] ? 'right-0.75' : 'left-0.75'}`}></div>
                        </button>
                      </div>
                    ))}

                    {/* Novo Campo: Dias de Teste */}
                    <div className="p-5 bg-sofia-purple/5 border border-sofia-purple/10 rounded-3xl group">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-sofia-purple text-white flex items-center justify-center shadow-lg shadow-sofia-purple/20">
                             <Clock size={20} />
                          </div>
                          <div>
                             <p className="text-sm font-black text-slate-900">Dias de Teste Grátis</p>
                             <p className="text-[10px] text-sofia-purple font-bold uppercase tracking-widest">Regra de Novos Leads</p>
                          </div>
                       </div>
                       <div className="relative">
                          <input 
                            type="number" 
                            min="1"
                            max="90"
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-700 focus:border-sofia-purple outline-none transition-all pr-12"
                            value={globalSettings.trial_days || 10}
                            onChange={(e) => setGlobalSettings({...globalSettings, trial_days: parseInt(e.target.value) || 0})}
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Dias</span>
                       </div>
                    </div>

                    <button 
                       onClick={handleSaveSettings}
                       disabled={isActionLoading}
                       className="w-full mt-8 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2 group shadow-xl"
                     >
                       {isActionLoading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                       Aplicar Segurança
                     </button>
                 </div>
              </div>

              <div className="bg-primary-50/50 rounded-[2rem] p-8 border border-primary-100 border-dashed">
                 <h4 className="text-xs font-black text-primary-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <Info size={14} /> Nota Técnica
                 </h4>
                 <p className="text-[11px] text-primary-700 font-medium leading-relaxed italic">
                   Estas configurações são aplicadas instantaneamente a todos os inquilinos que não possuem chaves API próprias configuradas. O modo de manutenção desativa as APIs externas para controle de custos ou reparos emergenciais.
                 </p>
              </div>
            </div>
          </div>
        );

      case 'billing':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
             <div className="bg-primary-600 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-all"><CreditCard size={180} /></div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary-200 mb-2">Gasto Consolidado (Mês)</p>
                      <h2 className="text-6xl font-black mb-6 flex items-baseline gap-2 tabular-nums">
                        <span className="text-2xl opacity-50">R$</span>{financeStats.totalCostBrl?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </h2>
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widst border border-white/10">
                          {financeStats.totalTokens?.toLocaleString()} Tokens
                        </div>
                        <div className="text-primary-200 text-xs font-medium italic underline">Ver relatório detalhado</div>
                      </div>
                   </div>
                   
                   <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                      <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-70">Top 3 Consumidores</h4>
                      <div className="space-y-4">
                         {profiles.filter(p => (financeStats.userCosts[p.id] || 0) > 0).sort((a, b) => financeStats.userCosts[b.id] - financeStats.userCosts[a.id]).slice(0, 3).map((u, i) => (
                           <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black text-[10px]">{u.email[0].toUpperCase()}</div>
                                  <span className="text-xs font-bold">{u.nome_completo || u.full_name || u.name || u.email.split('@')[0]}</span>

                              </div>
                              <span className="text-sm font-black text-primary-100">R$ {financeStats.userCosts[u.id]?.toLocaleString('pt-BR')}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
             </div>

             <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                <h3 className="text-xl font-black text-slate-900 mb-6 px-2">Detalhamento por Inquilino</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profiles.filter(p => (financeStats.userCosts[p.id] || 0) > 0).map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-primary-200 transition-all hover:bg-white group cursor-default">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-300 group-hover:text-primary-500 transition-colors">
                            {u.email[0].toUpperCase()}
                          </div>
                          <div>
                             <p className="text-sm font-black text-slate-900">{u.nome_completo || u.full_name || u.name || 'Sem nome'}</p>

                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{u.plano || 'Starter'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-primary-600">R$ {financeStats.userCosts[u.id]?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <ArrowRight className="text-slate-200 inline-block group-hover:translate-x-1 group-hover:text-primary-400 transition-all" size={16} />
                        </div>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        );
    }
  };

  const renderHub = () => (
    <div className="p-6 md:p-10 space-y-10 pb-32 overflow-y-auto h-screen custom-scrollbar">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Administração</h2>
        <p className="text-slate-500 font-medium">Gestão centralizada da plataforma Sofia.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { id: 'overview_global', label: 'Dashboard Global', icon: <Activity size={24} />, desc: 'Status e atividade em tempo real', color: 'bg-primary-600', tab: 'overview', type: 'external' },
          { id: 'users', label: 'Gestão de Inquilinos', icon: <Users size={24} />, desc: 'Controle de usuários e instâncias', color: 'bg-emerald-600', tab: 'users', type: 'internal' },
          { id: 'reports', label: 'Relatórios de Uso', icon: <BarChart3 size={24} />, desc: 'Analytics e performance da rede', color: 'bg-primary-600', tab: 'reports', type: 'external' },
          { id: 'config', label: 'Configurações Globais', icon: <Settings size={24} />, desc: 'API Keys, Modelos e Prompts', color: 'bg-amber-500', tab: 'config', type: 'internal' },
          { id: 'clients', label: 'Carteira Master', icon: <Star size={24} />, desc: 'Visão CRM de toda a base', color: 'bg-pink-500', tab: 'clients', type: 'external' },
          { id: 'flags_hub', label: 'Funcionalidades', icon: <ToggleLeft size={24} />, desc: 'Feature Flags & Releases', color: 'bg-teal-500', tab: 'flags', type: 'internal' },
          { id: 'billing', label: 'Consumo & Billing', icon: <CreditCard size={24} />, desc: 'Tokens, custos e faturamento', color: 'bg-slate-900', tab: 'billing', type: 'internal' },
        ].map((item) => (
          <motion.div
            key={item.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (item.type === 'external' && onTabChange) {
                onTabChange(item.tab);
              } else {
                setActiveTab(item.tab as AdminTab);
                setCurrentView('standard');
              }
            }}
            className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-5 hover:border-primary-200 transition-all cursor-pointer group"
          >
            <div className={`w-16 h-16 rounded-[1.25rem] ${item.color} text-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-110`}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-lg text-slate-900 leading-tight">{item.label}</h3>
              <p className="text-[10px] text-slate-400 font-bold truncate uppercase tracking-widest mt-1.5">{item.desc}</p>
            </div>
            <ChevronRight size={20} className="text-slate-300 group-hover:text-primary-500 transition-colors" />
          </motion.div>
        ))}
      </div>
      
      <div className="bg-slate-900 rounded-[2.5rem] p-10 border border-slate-800 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center text-white shadow-sm mb-6 relative z-10">
           <Shield size={40} />
        </div>
        <h4 className="text-xl font-black text-white relative z-10">Segurança da Plataforma</h4>
        <p className="text-sm text-slate-400 mt-2 max-w-[280px] relative z-10">Acesso restrito ao nível Master. Todas as operações administrativas são monitoradas em tempo real.</p>
      </div>
    </div>
  );

  if (currentView === 'hub') {
    return renderHub();
  }

  return (
    <div className="min-h-screen pb-12 animate-in fade-in duration-700 custom-scrollbar overflow-y-auto">

      {/* O progresso da Varredura agora é exibido de forma não-bloqueante no topo da tabela de leads e na tabela vazia */}

      {/* Page Header */}
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 px-2 pt-4">
        <div className="flex items-center gap-4">
          {initialView === 'hub' && (
             <button 
              onClick={() => setCurrentView('hub')}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-100 text-slate-400 flex items-center justify-center shadow-sm hover:bg-slate-50 transition-all active:scale-90"
             >
                <ChevronLeft size={24} />
             </button>
          )}
          <div>
             {activeTab !== 'lead_radar' && (
               <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest mb-4 border border-slate-200">
                 Restrito: Administrador
               </div>
             )}
             <h1 className="text-4xl font-black text-slate-900 tracking-tight">
               {activeTab === 'lead_radar' ? 'Radar de Leads' : <>Painel do <span className="text-primary-600">Ecossistema</span>.</>}
             </h1>
             <p className="text-slate-500 mt-2 font-medium">
               {activeTab === 'lead_radar' ? 'Encontre clientes em potencial e use IA para prospectar.' : 'Controle central de instâncias, usuários e provedores de IA.'}
             </p>
          </div>
        </div>
        
        {/* Sub-Nav Bar */}
        {activeTab !== 'lead_radar' && (
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as AdminTab)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === item.id 
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' 
                  : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className={activeTab === item.id ? 'scale-110 transition-transform' : ''}>
                  {item.icon}
                </div>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      <div className="space-y-12">
        {isLoading ? (
          <div className="h-[400px] flex items-center justify-center bg-white rounded-[2.5rem] border border-slate-100">
             <div className="flex flex-col items-center gap-4">
                <RefreshCw size={32} className="text-primary-600 animate-spin" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Sincronizando Ecossistema...</p>
             </div>
          </div>
        ) : (
          renderContent()
        )}
      </div>

      {/* MODAL: EDIT USER (Already implemented but can be updated slightly for same style) */}
      <AnimatePresence>
        {isEditModalOpen && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative z-10 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="p-10 border-b border-slate-50 shrink-0">
                  <h3 className="text-2xl font-black text-slate-900">Editar Inquilino</h3>
                  <p className="text-xs text-slate-500 font-medium">Você está gerenciando as permissões de <b>{selectedUser.email}</b></p>
              </div>

              <div className="p-10 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Plano da Assinatura</label>
                  <div className="grid grid-cols-4 gap-3">
                    {['Trial', 'Starter', 'Pro', 'Elite'].map(p => (
                      <button 
                        key={p}
                        onClick={() => setSelectedUser({ ...selectedUser, plano: p })}
                        className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          selectedUser.plano === p 
                            ? 'bg-primary-600 text-white border-primary-600 shadow-xl shadow-primary-100' 
                            : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-white hover:border-slate-200'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cargo no Sistema</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['client', 'admin'].map(r => (
                      <button 
                        key={r}
                        onClick={() => setSelectedUser({ ...selectedUser, role: r as any })}
                        className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          selectedUser.role === r 
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xl' 
                            : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-white'
                        }`}
                      >
                        {r === 'admin' ? 'Administrador' : 'Cliente'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* WhatsApp Infrastructure Section */}
                <div className="pt-8 border-t border-slate-100 space-y-6">
                  <div className="flex items-center gap-2 text-slate-900">
                    <Smartphone size={20} className="text-primary-600" />
                    <h4 className="text-sm font-black uppercase tracking-tight">Infraestrutura WhatsApp</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'evolution', label: 'Evolution API', desc: 'QR Code / Baileys', active: true },
                      { id: 'uazapi', label: 'UazAPI', desc: 'Alta Performance', active: true },
                      { id: 'meta_official', label: 'API Oficial (Meta)', desc: 'Cloud API Oficial', active: true }
                    ].map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setSelectedUser({...selectedUser, whatsapp_provider: provider.id as any})}
                        className={`p-4 rounded-2xl border-2 text-left transition-all relative group flex flex-col gap-1 ${
                          selectedUser.whatsapp_provider === provider.id 
                            ? 'border-primary-600 bg-primary-50/30' 
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${selectedUser.whatsapp_provider === provider.id ? 'text-primary-600' : 'text-slate-400'}`}>
                            {provider.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">{provider.desc}</p>
                        {selectedUser.whatsapp_provider === provider.id && (
                          <div className="absolute top-4 right-4 text-primary-600">
                            <CheckCircle2 size={16} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {selectedUser.whatsapp_provider === 'meta_official' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4"
                    >
                      <button
                        type="button"
                        onClick={() => setMetaHelpOpen(true)}
                        className="w-full text-left px-4 py-2.5 rounded-xl bg-white border border-primary-200 text-primary-700 text-[11px] font-bold hover:bg-primary-50 transition-all flex items-center justify-between"
                      >
                        <span>Não sabe onde achar esses dados? Veja o guia passo-a-passo</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Abrir</span>
                      </button>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phone Number ID</label>
                        <input
                          type="text"
                          value={metaPhoneId}
                          onChange={e => { setMetaPhoneId(e.target.value); setMetaTestResult(null); }}
                          placeholder="Ex: 1029384756..."
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">WABA ID <span className="text-slate-400 font-bold normal-case tracking-normal">(necessário para templates)</span></label>
                        <input
                          type="text"
                          value={metaWabaId}
                          onChange={e => { setMetaWabaId(e.target.value); setMetaTestResult(null); }}
                          placeholder="Ex: 5678901234..."
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                          Access Token
                          <Lock size={12} className="text-slate-400" />
                        </label>
                        <input
                          type="password"
                          value={metaAccessToken}
                          onChange={e => { setMetaAccessToken(e.target.value); setMetaTestResult(null); }}
                          placeholder="EAA..."
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                          App Secret <span className="text-slate-400 font-bold normal-case tracking-normal">(opcional — só se cliente trouxer a própria app)</span>
                          <Lock size={12} className="text-slate-400" />
                        </label>
                        <input
                          type="password"
                          value={metaAppSecret}
                          onChange={e => setMetaAppSecret(e.target.value)}
                          placeholder="Deixe vazio para usar o App Secret global da plataforma"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm"
                        />
                        <p className="text-[10px] text-slate-400 italic font-medium">
                          Por segurança, o valor atual nunca é exibido. Preencha apenas para definir um novo.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isMetaTesting || !metaAccessToken || !metaPhoneId}
                        onClick={async () => {
                          setIsMetaTesting(true);
                          setMetaTestResult(null);
                          try {
                            const r = await testMetaConnection(metaAccessToken, metaPhoneId, metaWabaId || undefined);
                            if (r.success) {
                              setMetaTestResult({ ok: true, phone: r.phone });
                              toast.success('Credenciais válidas');
                            } else {
                              setMetaTestResult({ ok: false, error: r.error || 'Falha na validação' });
                              toast.error(r.error || 'Credenciais inválidas');
                            }
                          } catch (e: any) {
                            setMetaTestResult({ ok: false, error: e.message });
                            toast.error(e.message);
                          } finally {
                            setIsMetaTesting(false);
                          }
                        }}
                        className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        {isMetaTesting ? 'Validando...' : 'Testar Conexão'}
                      </button>

                      {metaTestResult && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`p-4 rounded-2xl border text-xs ${metaTestResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}
                        >
                          {metaTestResult.ok && metaTestResult.phone ? (
                            <div className="space-y-1">
                              <div className="font-black uppercase tracking-widest text-[10px]">✓ Conexão OK</div>
                              <div><strong>Número:</strong> {metaTestResult.phone.display_phone_number || '—'}</div>
                              <div><strong>Nome verificado:</strong> {metaTestResult.phone.verified_name || '—'}</div>
                              <div><strong>Qualidade:</strong> {metaTestResult.phone.quality_rating || '—'}</div>
                              {metaTestResult.phone.verification_status && (
                                <div><strong>Verificação:</strong> {metaTestResult.phone.verification_status}</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="font-black uppercase tracking-widest text-[10px] mb-1">✗ Falha</div>
                              <div>{metaTestResult.error}</div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                  <p className="text-[10px] text-slate-400 italic font-medium">
                    * Esta configuração sobrescreve o padrão global para este inquilino específico.
                  </p>
                </div>

                <div className="pt-8 border-t border-slate-100 space-y-3">
                   <button
                    type="button"
                    onClick={() => setDiagnosticOpen(true)}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95"
                   >
                     <Activity size={16} /> Diagnóstico Completo
                   </button>
                   <button
                    onClick={async () => {
                      if (!window.confirm(`Tem certeza que deseja excluir permanentemente o usuário ${selectedUser.email}? Esta ação não pode ser desfeita.`)) return;
                      try {
                        setIsActionLoading(true);
                        await deleteAdminUser(selectedUser.id);
                        toast.success('Usuário excluído com sucesso!');
                        setIsEditModalOpen(false);
                        fetchData();
                      } catch (e: any) {
                        toast.error('Erro ao excluir: ' + e.message);
                      } finally {
                        setIsActionLoading(false);
                      }
                    }}
                    disabled={isActionLoading}
                    className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-red-100 transition-all active:scale-95 border border-red-100"
                   >
                     <Trash2 size={16} /> Excluir Usuário Permanentemente
                   </button>
                </div>
              </div>

              <div className="p-10 bg-slate-50 flex gap-4 shrink-0">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-5 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    try {
                      setIsActionLoading(true);

                      // 1. Campos gerais via PATCH (whitelist no backend)
                      await updateAdminUser(selectedUser.id, {
                        plano: selectedUser.plano,
                        role: selectedUser.role,
                        trial_ends_at: selectedUser.trial_ends_at,
                        whatsapp_provider: selectedUser.whatsapp_provider,
                      } as Partial<UserProfile>);

                      // 2. Se o provider escolhido é Meta e há credenciais novas,
                      //    valida + persiste via endpoint dedicado (anti-colisão de phone_id).
                      if (selectedUser.whatsapp_provider === 'meta_official' && metaAccessToken && metaPhoneId) {
                        const r = await saveAdminMetaCredentials(selectedUser.id, metaAccessToken, metaPhoneId, metaWabaId || undefined, metaAppSecret || undefined);
                        if (!r.success) {
                          toast.error(r.error || 'Falha ao salvar credenciais Meta');
                          setIsActionLoading(false);
                          return;
                        }
                      }

                      // 3. Se mudou de meta_official para outro provider, limpa credenciais.
                      if (selectedUser.whatsapp_provider !== 'meta_official' && (selectedUser as any).meta_phone_id) {
                        await disconnectAdminMeta(selectedUser.id).catch(() => {});
                      }

                      toast.success('Inquilino atualizado!');
                      setIsEditModalOpen(false);
                      fetchData();
                    } catch (e: any) {
                      toast.error(e.message);
                    } finally {
                      setIsActionLoading(false);
                    }
                  }}
                  disabled={isActionLoading}
                  className="flex-1 py-5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-primary-700 shadow-xl shadow-primary-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isActionLoading ? <RefreshCw className="animate-spin mx-auto" /> : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ACTIVITY LOGS */}
      <AnimatePresence>
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsActivityModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              className="bg-white h-full w-full max-w-xl shadow-2xl relative z-10 flex flex-col shadow-[-40px_0_60px_-15px_rgba(0,0,0,0.1)]"
            >
              <div className="p-10 border-b border-slate-50">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Logs do Ecossistema</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Sincronizado com os últimos 50 eventos.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/30 custom-scrollbar">
                {userActivity.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                     <FileText size={48} className="mb-4" />
                     <p className="text-sm font-black uppercase tracking-widest">Sem eventos registrados</p>
                  </div>
                ) : (
                  userActivity.map((log, i) => (
                    <div key={i} className="flex gap-4">
                       <div className="flex flex-col items-center gap-2">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${log.role === 'assistant' ? 'bg-primary-600 text-white border-primary-500' : 'bg-white text-slate-400 border-slate-200'}`}>
                             {log.role === 'assistant' ? <Bot size={20} /> : <Users size={20} />}
                          </div>
                          <div className="w-0.5 flex-1 bg-slate-200 rounded-full"></div>
                       </div>
                       <div className="flex-1 pb-8">
                          <div className="flex items-center justify-between mb-2">
                             <span className={`text-[10px] font-black uppercase tracking-widest ${log.role === 'assistant' ? 'text-primary-600' : 'text-slate-400'}`}>
                               {log.role === 'assistant' ? '🤖 Sofia (IA)' : '👤 Cliente'}
                             </span>
                             <span className="text-[10px] text-slate-400 font-bold">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-sm text-slate-700 leading-relaxed">
                             {log.content}
                          </div>
                       </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-10 border-t border-slate-50 bg-slate-50/50">
                 <button 
                  onClick={() => setIsActivityModalOpen(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
                 >
                   Fechar Visualização
                 </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Autopilot Modal */}
        {isAutopilotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsAutopilotModalOpen(false)}></div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-10 border-b border-slate-50 relative">
                 <button onClick={() => setIsAutopilotModalOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600">
                    <XCircle size={24} />
                 </button>
                 <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-inner mb-6">
                    <Rocket size={32} />
                 </div>
                 <h3 className="text-2xl font-black text-slate-900 mb-2">Configurar Disparo</h3>
                 <p className="text-sm text-slate-500 font-medium">Como as mensagens são enviadas via API Oficial, o primeiro contato deve ser feito através de um <b>Template Aprovado</b> pela Meta.</p>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/30 custom-scrollbar">
                 <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center justify-between">
                     Nome do Template (Meta)
                     {loadingTemplates && <RefreshCw size={12} className="animate-spin" />}
                   </label>
                   {metaTemplates.length > 0 ? (
                     <select 
                       className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none"
                       value={autopilotTemplateName}
                       onChange={(e) => setAutopilotTemplateName(e.target.value)}
                     >
                       <option value="">Selecione um template aprovado...</option>
                       {metaTemplates.map(t => (
                         <option key={`${t.name}_${t.language}`} value={t.name}>
                           {t.name} ({t.language}) · {t.category || 'GENERAL'}
                         </option>
                       ))}
                     </select>
                   ) : (
                     <input 
                       type="text" 
                       className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                       placeholder="Ex: prospeccao_fria"
                       value={autopilotTemplateName}
                       onChange={(e) => setAutopilotTemplateName(e.target.value)}
                     />
                   )}
                   <p className="text-xs text-slate-400 px-1">
                     {metaTemplates.length > 0 
                       ? 'Templates aprovados carregados automaticamente da sua conta Meta.' 
                       : 'Deve ser exatamente o nome configurado no seu Gerenciador do WhatsApp.'}
                   </p>
                 </div>

                 {metaTemplates.length > 0 && autopilotTemplateName && (
                   <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pré-visualização do Template</label>
                     <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow-sm">
                       {(() => {
                         const t = metaTemplates.find(x => x.name === autopilotTemplateName);
                         if (!t) return <span className="text-slate-400 italic">Template não encontrado...</span>;
                         const body = t.components.find((c: any) => c.type === 'BODY')?.text || '';
                         if (!body) return <span className="text-slate-400 italic">Template sem corpo de texto.</span>;
                         
                         if (body.includes('{{1}}') || body.includes('{{2}}')) {
                           const firstSelId = [...selectedLeadIds][0];
                           const firstSelLead = radarLeads.find((l: any) => l.id === firstSelId);
                           const rawLeadName = firstSelLead?.name || '[Nome do Estabelecimento]';
                           // Usa o nome próprio editado (contact_name) se disponível, senão encurta o nome do negócio
                           const previewLeadName = firstSelLead?.contact_name || rawLeadName.split(/\s*[|–-]\s*/)[0].trim().substring(0, 40) || rawLeadName;
                           const previewSender = senderName || '[Seu Nome]';
                           return body
                             .replace(/\{\{1\}\}/g, previewLeadName)
                             .replace(/\{\{2\}\}/g, previewSender);
                         }
                         return body;
                       })()}
                     </div>
                     <p className="text-[10px] text-slate-400 font-medium px-1">
                       O nome do estabelecimento será injetado na variável <code className="bg-slate-100 px-1 rounded font-mono">{'{{1}}'}</code> e o seu nome de perfil na variável <code className="bg-slate-100 px-1 rounded font-mono">{'{{2}}'}</code>.
                       {!senderName && (
                         <span className="ml-1 text-amber-500 font-bold">⚠ Seu nome não está configurado — vá em Configurações → Conta e preencha o campo Nome Completo.</span>
                       )}
                     </p>
                   </div>
                 )}
              </div>

              <div className="p-10 border-t border-slate-50 bg-slate-50/50 flex flex-col gap-4">
                 {isTestInputVisible ? (
                   <div className="flex gap-2 items-center w-full animate-in slide-in-from-bottom-2 duration-200">
                     <input
                       type="text"
                       placeholder="Telefone de teste (com DDI e DDD)"
                       value={testPhone}
                       onChange={e => setTestPhone(e.target.value)}
                       className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 font-bold"
                     />
                     <button
                       onClick={sendTestMessage}
                       disabled={isTestSending || !testPhone}
                       className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all disabled:opacity-50 disabled:grayscale"
                     >
                       {isTestSending ? 'Enviando...' : 'Enviar'}
                     </button>
                     <button
                       onClick={() => setIsTestInputVisible(false)}
                       className="px-3 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all"
                     >
                       Voltar
                     </button>
                   </div>
                 ) : (
                   <div className="flex gap-3 w-full">
                     <button 
                      onClick={() => setIsAutopilotModalOpen(false)}
                      className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all"
                     >
                       Cancelar
                     </button>
                     <button 
                      onClick={() => {
                        fetchMyProfilePhone();
                        setIsTestInputVisible(true);
                      }}
                      className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                     >
                       Enviar Teste
                     </button>
                     <button 
                      onClick={confirmAutopilot}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
                     >
                       Iniciar Disparos
                     </button>
                   </div>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MetaSetupHelpModal
        isOpen={metaHelpOpen}
        onClose={() => setMetaHelpOpen(false)}
      />

      <WhatsAppDiagnosticModal
        isOpen={diagnosticOpen}
        onClose={() => setDiagnosticOpen(false)}
        targetUserId={selectedUser?.id || null}
        targetUserEmail={selectedUser?.email}
      />

      {/* Send Modal - envio individual de lead */}
      <AnimatePresence>
        {sendModalLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSendModalLead(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-2xl bg-[#25D366]/10 flex items-center justify-center">
                    <MessageSquare size={18} className="text-[#25D366]" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">Enviar Abordagem</h3>
                    <p className="text-xs text-slate-400">{sendModalLead.name}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4 border-b border-slate-50">
                {/* Seletor de Tipo de Envio */}
                {sendModalTemplates.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Envio</label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 border border-slate-200/60 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setSendMode('text')}
                        className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                          sendMode === 'text'
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        📝 Mensagem de Texto
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendMode('template')}
                        className={`py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                          sendMode === 'template'
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-100'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🤖 Template Meta
                      </button>
                    </div>
                  </div>
                )}

                {/* Conteúdo Dinâmico */}
                {sendMode === 'template' ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Template Aprovado pela Meta</label>
                      {loadingSendTemplates ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <div className="w-4 h-4 border-2 border-primary-300 border-t-transparent rounded-full animate-spin" />
                          Carregando templates...
                        </div>
                      ) : sendModalTemplates.length === 0 ? (
                        <p className="text-xs text-red-400">Nenhum template aprovado encontrado.</p>
                      ) : (
                        <select
                          value={sendModalTemplate}
                          onChange={e => {
                            const tName = e.target.value;
                            setSendModalTemplate(tName);
                            
                            // Computar parâmetros padrão
                            const t = sendModalTemplates.find(x => x.name === tName);
                            const body = t?.components.find((c: any) => c.type === 'BODY')?.text || '';
                            const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
                            const indexes = matches.map(m => parseInt(m[1], 10));
                            const maxIndex = indexes.length > 0 ? Math.max(...indexes) : 0;
                            
                            const defaults = Array(maxIndex).fill('');
                            if (maxIndex >= 1) {
                              const rawLeadName = sendModalLead?.name || '';
                              defaults[0] = sendModalLead?.contact_name || rawLeadName.split(/\s*[|–-]\s*/)[0].trim().substring(0, 40) || rawLeadName;
                            }
                            if (maxIndex >= 2) {
                              defaults[1] = senderName || '';
                            }
                            setTemplateParams(defaults);
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 outline-none focus:border-primary-300 font-bold"
                        >
                          <option value="">Selecione um template...</option>
                          {sendModalTemplates.map(t => (
                            <option key={t.name} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Inputs de variáveis do template */}
                    {sendModalTemplate && templateParams.length > 0 && (
                      <div className="flex flex-col gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Variáveis do Template</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {templateParams.map((val, idx) => (
                            <div key={idx} className="flex flex-col gap-1.5">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider px-1">
                                Variável {'{{' + (idx + 1) + '}}'}
                              </label>
                              <input
                                type="text"
                                value={val}
                                onChange={e => {
                                  const newVal = e.target.value;
                                  setTemplateParams(prev => {
                                    const next = [...prev];
                                    next[idx] = newVal;
                                    return next;
                                  });
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:border-primary-400 font-bold shadow-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pré-visualização do Template */}
                    {sendModalTemplate && (
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Pré-visualização da Mensagem</label>
                        <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-sm">
                          {(() => {
                            const t = sendModalTemplates.find(x => x.name === sendModalTemplate);
                            if (!t) return <span className="text-slate-400 italic">Template não encontrado...</span>;
                            const body = t.components.find((c: any) => c.type === 'BODY')?.text || '';
                            if (!body) return <span className="text-slate-400 italic">Template sem corpo de texto.</span>;
                            
                            let preview = body;
                            templateParams.forEach((val, idx) => {
                              const placeholder = new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g');
                              preview = preview.replace(placeholder, val || `{{${idx + 1}}}`);
                            });
                            return preview;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Mensagem a enviar</label>
                    <textarea
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      placeholder="Escreva a mensagem personalizada aqui..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 outline-none focus:border-primary-500 transition-all resize-none h-24"
                    />
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50/50 flex gap-3 flex-shrink-0">
                <button
                  onClick={() => setSendModalLead(null)}
                  className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={sendToLead}
                  disabled={
                    sendingLeadId === sendModalLead.id ||
                    (sendMode === 'template' && !sendModalTemplate) ||
                    (sendMode === 'text' && !customMessage.trim())
                  }
                  className="flex-1 py-3.5 bg-[#25D366] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-[#128C7E] shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sendingLeadId === sendModalLead.id ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <><MessageSquare size={12} /> Confirmar Envio</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
