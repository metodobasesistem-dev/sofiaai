import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Send, 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
  Edit2,
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  Info,
  Users,
  Layout,
  Layers,
  BarChart3,
  Sparkles,
  Zap,
  RefreshCw,
  Play,
  Pause,
  Loader2,
  Upload,
  FileText,
  ClipboardList,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton } from './common/SkeletonLoader';
import { sendTemplateMessage, getMetaTemplates } from '../services/whatsappService';
import { standardFetch } from '../services/supabaseService';

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: 'pending' | 'sending' | 'completed' | 'failed';
  total_contacts: number;
  sent_count: number;
  error_count: number;
  created_at: string;
  target_type?: 'all' | 'labels' | 'funnel' | 'manual' | 'upload';
  selected_labels?: any;
  selected_funnel_status?: string;
  manual_list?: string;
  uploaded_contacts?: any[];
  template_id?: string;
  variables?: any;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [templateSource, setTemplateSource] = useState<'internal' | 'meta'>('internal');
  const [metaTemplates, setMetaTemplates] = useState<any[]>([]);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [userProvider, setUserProvider] = useState<string>('evolution');
  const [senderName, setSenderName] = useState<string>('');
  const [showContactsList, setShowContactsList] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);
  const [isValidatingNumbers, setIsValidatingNumbers] = useState(false);
  const [validationResults, setValidationResults] = useState<{ validCount: number; invalidCount: number; results: any[] } | null>(null);
  const [isCheckingContact, setIsCheckingContact] = useState(false);
  const [contactCheckResult, setContactCheckResult] = useState<{ found: boolean; name?: string; status?: string } | null>(null);

  const validateSingleContact = async () => {
    if (!campaignData.singleContact.telefone) return;
    
    setIsCheckingContact(true);
    setContactCheckResult(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const cleanPhone = campaignData.singleContact.telefone.replace(/\D/g, '');
      const last8 = cleanPhone.slice(-8);
      
      if (!last8) {
        toast.error('Telefone inválido para busca.');
        return;
      }
      
      const { data, error } = await supabase
        .from('contacts')
        .select('nome, status_funil')
        .eq('user_id', user.id)
        .like('telefone', `%${last8}`)
        .maybeSingle();
        
      if (error && error.code !== 'PGRST116') throw error; // Ignorar erro de 0 rows
      
      if (data) {
        setContactCheckResult({ found: true, name: data.nome, status: data.status_funil });
        toast.warning('Atenção: Contato já existe na sua base!');
      } else {
        setContactCheckResult({ found: false });
        toast.success('Contato inédito na base!');
      }
    } catch (err: any) {
      toast.error('Erro ao buscar contato: ' + err.message);
    } finally {
      setIsCheckingContact(false);
    }
  };

  const validateManualNumbers = async () => {
    const rawNumbers = (campaignData.manualList || '').split('\n').map(n => n.trim()).filter(Boolean);
    if (rawNumbers.length === 0) {
      return toast.error('Insira ao menos um número de telefone na lista.');
    }

    setIsValidatingNumbers(true);
    setValidationResults(null);
    try {
      const response = await standardFetch('/api/v2/campaigns/validate-numbers', {
        method: 'POST',
        body: JSON.stringify({ numbers: rawNumbers })
      });
      const res = await response.json();
      if (res.success) {
        setValidationResults(res);
        if (res.invalidCount === 0) {
          toast.success(`Todos os ${res.validCount} números possuem WhatsApp ativo!`);
        } else {
          toast.warning(`Validação concluída: ${res.validCount} válidos e ${res.invalidCount} sem WhatsApp.`);
        }
      } else {
        toast.error(res.error || 'Erro ao validar números.');
      }
    } catch (err: any) {
      toast.error('Erro ao validar números: ' + err.message);
    } finally {
      setIsValidatingNumbers(false);
    }
  };

  const removeInvalidNumbers = () => {
    if (!validationResults) return;
    const validNumbers = validationResults.results
      .filter((r: any) => r.exists)
      .map((r: any) => r.number);
    setCampaignData({ ...campaignData, manualList: validNumbers.join('\n') });
    setValidationResults(null);
    toast.success('Números sem WhatsApp foram removidos da lista!');
  };
  
  const [newTemplate, setNewTemplate] = useState<{
    id?: string;
    name: string;
    category: string;
    variables_count: number;
    language: string;
    body: string;
  }>({
    name: '',
    category: 'MARKETING',
    variables_count: 0,
    language: 'pt_BR',
    body: ''
  });

  const [campaignData, setCampaignData] = useState({
    name: '',
    targetType: 'all' as 'all' | 'labels' | 'funnel' | 'manual' | 'upload' | 'single_contact',
    selectedLabels: [] as string[],
    selectedFunnelStatus: '',
    manualList: '',
    uploadedContacts: [] as any[],
    singleContact: { nome: '', telefone: '', linkToCampaign: false, linkedCampaignId: '' },
    messageType: 'custom' as 'custom' | 'template',
    customText: '',
    templateId: '',
    templateName: '',
    templateLanguage: 'pt_BR',
    isMetaTemplate: false,
    variables: {} as Record<string, string>
  });

  const [labels, setLabels] = useState<string[]>([]);
  const [funnelStatuses, setFunnelStatuses] = useState<string[]>([]);

  const contactFields = [
    { id: 'full_name', label: 'Nome Completo (Contato)' },
    { id: 'first_name', label: 'Primeiro Nome (Contato)' },
    { id: 'phone', label: 'Telefone (Contato)' },
    { id: 'email', label: 'E-mail (Contato)' },
    { id: 'status_funil', label: 'Status do Funil (Contato)' },
    { id: 'sender_full_name', label: 'Meu Nome (Remetente)' },
    { id: 'sender_first_name', label: 'Meu Primeiro Nome (Remetente)' }
  ];

  const [processingCampaignId, setProcessingCampaignId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch Templates
  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      setTemplates(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar modelos: ' + err.message);
    }
  };

  // Fetch Campaigns
  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar campanhas: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetaTemplates = async () => {
    try {
      setIsFetchingMeta(true);
      const res = await getMetaTemplates();
      if (res.success) {
        setMetaTemplates(res.templates);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar templates Meta:', err.message);
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('whatsapp_provider, whatsapp_organizacao')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('Erro ao carregar perfil do usuário:', error.message);
      }

      setUserProvider(profile?.whatsapp_provider || 'evolution');
      // Get sender name from auth user_metadata (always available from Google OAuth)
      const resolvedName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '';
      setSenderName(resolvedName);
      if (profile?.whatsapp_organizacao) {
        setTestPhone(profile.whatsapp_organizacao.replace(/\D/g, ''));
      }
      if (profile?.whatsapp_provider === 'meta_official') {
        fetchMetaTemplates();
      }
    }
  };

  const startPolling = (campaignId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/v2/campaigns/${campaignId}/status`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        const result = await res.json();
        if (!result.success) return;

        const job = result.data;

        // Update local campaign list with live progress from backend
        setCampaigns(prev => prev.map(c => c.id === campaignId ? {
          ...c,
          sent_count: job.sent,
          error_count: job.errors,
          status: job.jobStatus === 'running'
            ? 'sending'
            : job.jobStatus === 'done'
            ? 'completed'
            : c.status
        } : c));

        // Update countdown display
        if (job.nextSendAt) {
          const remaining = Math.max(0, Math.ceil((job.nextSendAt - Date.now()) / 1000));
          setCountdown(remaining);
          setIsWaiting(remaining > 0);
        } else {
          setCountdown(null);
          setIsWaiting(false);
        }

        // Stop polling when job is done
        if (job.jobStatus !== 'running') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setProcessingCampaignId(null);
          setCountdown(null);
          setIsWaiting(false);
          fetchCampaigns();
          if (job.jobStatus === 'done') {
            toast.success(`Campanha finalizada! Enviadas: ${job.sent}, Erros: ${job.errors}`);
          } else if (job.jobStatus === 'cancelled') {
            toast.info('Campanha cancelada.');
          }
        }
      } catch (pollErr: any) {
        console.warn('[Campaigns] Polling error:', pollErr.message);
      }
    }, 3000);
  };

  const startCampaign = async (campaign: Campaign) => {
    if (processingCampaignId) {
      toast.error('Já existe uma campanha sendo processada.');
      return;
    }
    try {
      setProcessingCampaignId(campaign.id);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/v2/campaigns/${campaign.id}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      toast.success('Campanha iniciada! Você pode fechar esta aba com segurança.');
      fetchCampaigns();
      startPolling(campaign.id);
    } catch (err: any) {
      toast.error('Erro ao iniciar campanha: ' + err.message);
      setProcessingCampaignId(null);
    }
  };

  const cancelCampaign = async (campaignId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/v2/campaigns/${campaignId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      toast.info('Cancelamento solicitado...');
    } catch (err: any) {
      toast.error('Erro ao cancelar: ' + err.message);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
    try {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
      toast.success('Campanha excluída com sucesso!');
      fetchCampaigns();
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message);
    }
  };

  const handleEditCampaign = (campaign: any) => {
    setEditingCampaignId(campaign.id);
    setCampaignData({
      name: campaign.name,
      targetType: campaign.target_type || 'all',
      selectedLabels: Array.isArray(campaign.selected_labels) ? campaign.selected_labels : (campaign.selected_labels ? [campaign.selected_labels] : []),
      selectedFunnelStatus: campaign.selected_funnel_status || '',
      manualList: campaign.manual_list || '',
      uploadedContacts: campaign.uploaded_contacts || [],
      messageType: campaign.message_type || (campaign.custom_text ? 'custom' : 'template'),
      customText: campaign.custom_text || '',
      templateId: campaign.template_id || '',
      templateName: campaign.template_name || '',
      templateLanguage: campaign.template_language || 'pt_BR',
      isMetaTemplate: false,
      singleContact: { nome: '', telefone: '', linkToCampaign: false, linkedCampaignId: '' },
      variables: campaign.variables || {}
    });
    setCurrentStep(1);
    setShowContactsList(false);
    setIsModalOpen(true);
  };

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
    fetchUserProfile();
  }, []);

  // Clean up polling interval on unmount
  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100"><CheckCircle2 size={12}/> Concluído</span>;
      case 'sending':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100 animate-pulse"><Zap size={12}/> Enviando...</span>;
      case 'pending':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-600 text-xs font-bold border border-amber-100"><Clock size={12}/> Pendente</span>;
      case 'failed':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100"><AlertCircle size={12}/> Falhou</span>;
      default:
        return <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-500 text-xs font-bold border border-gray-100">{status}</span>;
    }
  };

  // Load Filters
  useEffect(() => {
    const loadFilters = async () => {
      // Load Labels from threads
      const { data: threadData } = await supabase.from('threads').select('labels');
      // Load Status from contacts
      const { data: contactData } = await supabase.from('contacts').select('status_funil');
      
      if (threadData) {
        const allLabels = new Set<string>();
        threadData.forEach(t => {
          if (t.labels) t.labels.forEach((l: string) => allLabels.add(l));
        });
        setLabels(Array.from(allLabels));
      }

      if (contactData) {
        const allStatuses = new Set<string>();
        contactData.forEach(c => {
          if (c.status_funil) allStatuses.add(c.status_funil);
        });
        setFunnelStatuses(Array.from(allStatuses));
      }
    };
    loadFilters();
  }, []);

  const updateUploadedContact = (index: number, field: 'nome' | 'telefone', value: string) => {
    const newList = [...campaignData.uploadedContacts];
    newList[index] = { ...newList[index], [field]: value };
    setCampaignData({ ...campaignData, uploadedContacts: newList });
  };

  const removeUploadedContact = (index: number) => {
    const newList = campaignData.uploadedContacts.filter((_, i) => i !== index);
    setCampaignData({ ...campaignData, uploadedContacts: newList });
  };

  const sendCampaignTestMessage = async () => {
    if (!testPhone) return toast.error('O número de telefone é obrigatório para o teste.');
    if (!campaignData.templateId) return toast.error('Selecione um template para testar.');

    // Encontra o primeiro contato da lista da campanha como contato de teste.
    // Fallback: se a lista estiver vazia, cria um contato fictício para resolver as variáveis.
    const sampleContact = campaignData.uploadedContacts[0] || {
      nome: 'Cliente Teste',
      telefone: testPhone
    };

    setIsTestSending(true);
    try {
      const response = await standardFetch('/api/v2/campaigns/test-send', {
        method: 'POST',
        body: JSON.stringify({
          phone: testPhone,
          templateId: campaignData.templateId,
          templateName: campaignData.templateName,
          templateLanguage: campaignData.templateLanguage || 'pt_BR',
          isMetaTemplate: campaignData.isMetaTemplate,
          senderName,
          variables: campaignData.variables,
          contact: sampleContact
        })
      });
      const res = await response.json();
      if (res.success) {
        toast.success(res.message || 'Mensagem de teste enviada!');
      } else {
        toast.error(res.error || 'Erro ao enviar mensagem de teste.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro de rede ao enviar teste.');
    } finally {
      setIsTestSending(false);
    }
  };

  // Modal - New Campaign Wizard
  const renderWizard = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            {!(campaignData.targetType === 'single_contact' && campaignData.singleContact.linkToCampaign) && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nome da Campanha</label>
                <input 
                  type="text" 
                  placeholder="Ex: Promoção de Verão 2024"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/5 transition-all font-bold"
                  value={campaignData.name}
                  onChange={e => setCampaignData({...campaignData, name: e.target.value})}
                />
              </div>
            )}

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Quem deve receber?</label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { id: 'all', label: 'Todos', icon: <Users size={18} /> },
                  { id: 'labels', label: 'Etiquetas', icon: <Filter size={18} /> },
                  { id: 'funnel', label: 'Funil', icon: <Layers size={18} /> },
                  { id: 'manual', label: 'Manual', icon: <ClipboardList size={18} /> },
                  { id: 'upload', label: 'Planilha', icon: <Upload size={18} /> },
                  { id: 'single_contact', label: 'Contato Único', icon: <Zap size={18} /> }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setCampaignData({...campaignData, targetType: type.id as any})}
                    className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                      campaignData.targetType === type.id 
                        ? 'border-primary-500 bg-primary-50/30 text-primary-900 shadow-lg shadow-primary-500/10' 
                        : 'border-slate-50 bg-white text-slate-400 hover:border-slate-100'
                    }`}
                  >
                    {type.icon}
                    <span className="text-[10px] font-black uppercase">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {campaignData.targetType === 'single_contact' && (
                <motion.div 
                  key="single_contact"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100"
                >
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhes do Contato</p>
                  <div className="grid grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      placeholder="Nome do contato"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-primary-500 text-sm font-bold"
                      value={campaignData.singleContact.nome}
                      onChange={e => setCampaignData({...campaignData, singleContact: {...campaignData.singleContact, nome: e.target.value}})}
                    />
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Telefone com DDI"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-primary-500 text-sm font-bold font-mono"
                        value={campaignData.singleContact.telefone}
                        onChange={e => {
                          setCampaignData({...campaignData, singleContact: {...campaignData.singleContact, telefone: e.target.value}});
                          setContactCheckResult(null);
                        }}
                      />
                      <button
                        className="px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
                        onClick={validateSingleContact}
                        disabled={isCheckingContact || !campaignData.singleContact.telefone}
                      >
                        {isCheckingContact ? '...' : 'Validar'}
                      </button>
                    </div>
                  </div>
                  
                  {contactCheckResult && (
                    <div className={`p-3 mt-3 rounded-lg text-xs font-bold ${contactCheckResult.found ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
                      {contactCheckResult.found ? (
                        <>⚠️ Contato já existente: {contactCheckResult.name} (Status: {contactCheckResult.status || 'N/A'})</>
                      ) : (
                        <>✅ Contato inédito! Pode seguir com o envio.</>
                      )}
                    </div>
                  )}
                  
                  <div className="pt-2 mt-3 border-t border-slate-200 space-y-3">
                    <label 
                      className="flex items-center gap-2 cursor-pointer group"
                      onClick={() => setCampaignData({...campaignData, singleContact: {...campaignData.singleContact, linkToCampaign: !campaignData.singleContact.linkToCampaign}})}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                        campaignData.singleContact.linkToCampaign ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-slate-300 group-hover:border-primary-400'
                      }`}>
                        {campaignData.singleContact.linkToCampaign && <CheckCircle2 size={14} />}
                      </div>
                      <span className="text-xs font-bold text-slate-700">Vincular a uma campanha existente?</span>
                    </label>

                    {campaignData.singleContact.linkToCampaign && (
                      <select
                        value={campaignData.singleContact.linkedCampaignId}
                        onChange={e => {
                          const id = e.target.value;
                          const camp = campaigns.find(c => c.id === id);
                          if (camp) {
                            setCampaignData({
                              ...campaignData,
                              singleContact: { ...campaignData.singleContact, linkedCampaignId: id },
                              messageType: camp.message_type || (camp.custom_text ? 'custom' : 'template'),
                              templateId: camp.template_id || '',
                              templateName: camp.template_name || '',
                              customText: camp.custom_text || '',
                              variables: camp.variables || {}
                            });
                          } else {
                            setCampaignData({...campaignData, singleContact: { ...campaignData.singleContact, linkedCampaignId: id }});
                          }
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm bg-white font-bold"
                      >
                        <option value="">Selecione a campanha...</option>
                        {campaigns.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({new Date(c.created_at).toLocaleDateString('pt-BR')})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </motion.div>
              )}

              {campaignData.targetType === 'labels' && (
                <motion.div 
                  key="labels"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100"
                >
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecione as Etiquetas</p>
                  <div className="flex flex-wrap gap-2">
                    {labels.map(label => (
                      <button
                        key={label}
                        onClick={() => {
                          const newLabels = campaignData.selectedLabels.includes(label)
                            ? campaignData.selectedLabels.filter(l => l !== label)
                            : [...campaignData.selectedLabels, label];
                          setCampaignData({...campaignData, selectedLabels: newLabels});
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                          campaignData.selectedLabels.includes(label)
                            ? 'bg-primary-500 text-white border-primary-400 shadow-lg shadow-primary-500/20'
                            : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {campaignData.targetType === 'funnel' && (
                <motion.div 
                  key="funnel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100"
                >
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status do Funil</p>
                  <select
                    value={campaignData.selectedFunnelStatus}
                    onChange={e => setCampaignData({...campaignData, selectedFunnelStatus: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm bg-white font-bold"
                  >
                    <option value="">Selecione um status...</option>
                    {funnelStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </motion.div>
              )}

              {campaignData.targetType === 'manual' && (
                <motion.div 
                  key="manual"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100"
                >
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lista de Números (Um por linha)</p>
                    <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-lg">Inclua o DDI (Ex: 55)</span>
                  </div>

                  <textarea 
                    value={campaignData.manualList}
                    onChange={e => {
                      setCampaignData({...campaignData, manualList: e.target.value});
                      setValidationResults(null);
                    }}
                    placeholder="5511999999999&#10;5511888888888"
                    className="w-full h-36 px-4 py-3 rounded-2xl border border-slate-200 focus:border-primary-500 outline-none transition-all text-sm bg-white font-bold resize-none font-mono"
                  />

                  {/* Botão e Resultado de Validação de WhatsApp */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={validateManualNumbers}
                      disabled={isValidatingNumbers || !campaignData.manualList.trim()}
                      className="px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isValidatingNumbers ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-emerald-500" />
                          <span>Validando no WhatsApp...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={14} className="text-emerald-500" />
                          <span>Validar Se Números Têm WhatsApp</span>
                        </>
                      )}
                    </button>

                    {validationResults && (
                      <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm text-xs font-bold">
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={14} /> {validationResults.validCount} Válidos
                        </span>
                        {validationResults.invalidCount > 0 && (
                          <>
                            <span className="text-red-500 flex items-center gap-1">
                              <XCircle size={14} /> {validationResults.invalidCount} Inválidos
                            </span>
                            <button
                              type="button"
                              onClick={removeInvalidNumbers}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-red-100"
                            >
                              Remover Inválidos
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {campaignData.targetType === 'upload' && (
                <motion.div 
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="space-y-4"
                >
                  <div className="relative border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center hover:border-primary-500/50 transition-all bg-white group overflow-hidden">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const text = event.target?.result as string;
                            const lines = text.split('\n').filter(l => l.trim());
                            if (lines.length < 2) {
                              toast.error('Planilha vazia ou inválida.');
                              return;
                            }
                            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                            const data = lines.slice(1).map(line => {
                              const values = line.split(',').map(v => v.trim());
                              const obj: any = {};
                              headers.forEach((h, i) => {
                                if (h.includes('nome') || h.includes('name')) obj.nome = values[i];
                                if (h.includes('fone') || h.includes('phone') || h.includes('number') || h.includes('telefone')) obj.telefone = values[i];
                              });
                              return obj;
                            });
                            setCampaignData({ ...campaignData, uploadedContacts: data });
                            toast.success(`${data.length} contatos carregados com sucesso!`);
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <Upload size={24} />
                      </div>
                      <div className="space-y-1">
                        <p className="font-black text-slate-800">Clique para selecionar .CSV</p>
                        <p className="text-xs text-slate-400 font-medium">Colunas recomendadas: Nome, Telefone</p>
                      </div>
                    </div>
                  </div>
                  
                  {campaignData.uploadedContacts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center">
                            <CheckCircle2 size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-emerald-900">{campaignData.uploadedContacts.length} contatos importados</p>
                            <p className="text-[10px] font-bold text-emerald-600">Pronto para o disparo</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowContactsList(!showContactsList)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            {showContactsList ? 'Ocultar' : 'Visualizar/Editar'}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setCampaignData({...campaignData, uploadedContacts: []})}
                            className="p-2 text-emerald-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {showContactsList && (
                        <div className="border border-slate-100 rounded-3xl p-4 bg-slate-50/50 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                          {campaignData.uploadedContacts.map((contact: any, index: number) => (
                            <div key={index} className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100">
                              <input
                                type="text"
                                value={contact.nome || ''}
                                onChange={(e) => updateUploadedContact(index, 'nome', e.target.value)}
                                className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-primary-500 transition-all text-slate-800"
                                placeholder="Nome"
                              />
                              <input
                                type="text"
                                value={contact.telefone || ''}
                                onChange={(e) => updateUploadedContact(index, 'telefone', e.target.value)}
                                className="w-32 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-primary-500 transition-all text-slate-800"
                                placeholder="Telefone"
                              />
                              <button
                                type="button"
                                onClick={() => removeUploadedContact(index)}
                                className="p-1 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              disabled={(() => {
                if (campaignData.targetType === 'single_contact') {
                  if (!campaignData.singleContact.telefone) return true;
                  if (campaignData.singleContact.linkToCampaign && !campaignData.singleContact.linkedCampaignId) return true;
                  if (!campaignData.singleContact.linkToCampaign && !campaignData.name) return true;
                  return false;
                }
                return !campaignData.name;
              })()}
              onClick={() => setCurrentStep(2)}
              className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2 group shadow-xl disabled:opacity-50 disabled:grayscale"
            >
              Próximo Passo: Escolher Mensagem
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        );
      case 2:
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Seletor de Tipo de Mensagem: Texto Livre vs Modelo */}
            <div className="flex p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => setCampaignData({...campaignData, messageType: 'custom'})}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${
                  campaignData.messageType === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Sparkles size={16} className={campaignData.messageType === 'custom' ? 'text-primary-500' : ''} />
                Mensagem Personalizada
              </button>
              <button
                onClick={() => setCampaignData({...campaignData, messageType: 'template'})}
                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${
                  campaignData.messageType === 'template' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Layout size={16} className={campaignData.messageType === 'template' ? 'text-primary-500' : ''} />
                Usar Modelo Registrado
              </button>
            </div>

            {campaignData.messageType === 'custom' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      Conteúdo da Mensagem (Texto Livre)
                    </label>
                    <span className="text-[10px] font-bold text-slate-400">
                      {campaignData.customText.length} caracteres
                    </span>
                  </div>

                  <textarea
                    value={campaignData.customText}
                    onChange={e => setCampaignData({...campaignData, customText: e.target.value, templateName: 'Mensagem Personalizada'})}
                    placeholder="Digite sua mensagem aqui... Ex: Olá {nome}! Tudo bem? Vi que você tem interesse nos nossos serviços..."
                    className="w-full h-36 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-primary-500 font-medium text-sm text-slate-800 resize-none transition-all"
                  />

                  {/* Variáveis e Emojis rápidos */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Inserir:</span>
                    <button
                      type="button"
                      onClick={() => setCampaignData({...campaignData, customText: campaignData.customText + ' {nome}'})}
                      className="px-2.5 py-1 bg-primary-50 hover:bg-primary-100 text-primary-600 rounded-lg text-xs font-bold transition-all border border-primary-100 flex items-center gap-1"
                    >
                      <span>{'{nome}'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignData({...campaignData, customText: campaignData.customText + ' {telefone}'})}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <span>{'{telefone}'}</span>
                    </button>

                    <span className="text-slate-200">|</span>

                    {['😊', '👋', '✅', '📌', '👉', '🔥'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setCampaignData({...campaignData, customText: campaignData.customText + ' ' + emoji})}
                        className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm transition-all border border-slate-100"
                      >
                        {emoji}
                      </button>
                    ))}
                    <div className="ml-auto">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!campaignData.customText.trim()) return toast.error('Digite uma mensagem primeiro');
                          const modelName = window.prompt('Digite um nome para salvar este modelo (ex: Campanha Dia das Mães):');
                          if (!modelName) return;
                          
                          try {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) return;
                            
                            const { error } = await supabase.from('message_templates').insert({
                              name: modelName,
                              category: 'MARKETING',
                              variables_count: 0,
                              language: 'pt_BR',
                              body: campaignData.customText,
                              tenant_id: user.id
                            });
                            
                            if (error) throw error;
                            toast.success('Modelo salvo com sucesso! Vá na aba "Usar Modelo Registrado".');
                            fetchTemplates();
                          } catch (err: any) {
                            toast.error('Erro ao salvar modelo: ' + err.message);
                          }
                        }}
                        className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-all border border-emerald-100 flex items-center gap-1 shadow-sm"
                      >
                        <FileText size={14} /> Salvar como Modelo
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pré-visualização balão do WhatsApp */}
                {campaignData.customText.trim() && (
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-2">
                    <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                      <Send size={12} /> Pré-visualização da Mensagem no WhatsApp
                    </p>
                    <div className="bg-emerald-100/70 p-3 rounded-2xl text-xs font-medium text-slate-800 max-w-sm border border-emerald-200 shadow-sm leading-relaxed whitespace-pre-wrap">
                      {(() => {
                        let sampleName = 'João';
                        let samplePhone = '5511999999999';
                        
                        if (campaignData.targetType === 'upload' && campaignData.uploadedContacts?.length > 0) {
                          sampleName = campaignData.uploadedContacts[0].nome || campaignData.uploadedContacts[0].name || sampleName;
                          samplePhone = campaignData.uploadedContacts[0].telefone || samplePhone;
                        } else if (campaignData.singleContact?.nome) {
                          sampleName = campaignData.singleContact.nome;
                          samplePhone = campaignData.singleContact.telefone || samplePhone;
                        }
                        
                        return campaignData.customText
                          .replace(/\{nome\}/gi, sampleName)
                          .replace(/\{telefone\}/gi, samplePhone);
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Modo Modelo Registrado */
              <div className="space-y-4">
                {userProvider === 'meta_official' && (
                  <div className="flex p-1 bg-slate-100 rounded-2xl">
                    <button
                      onClick={() => setTemplateSource('internal')}
                      className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
                        templateSource === 'internal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Modelos Internos
                    </button>
                    <button
                      onClick={() => {
                        setTemplateSource('meta');
                        if (metaTemplates.length === 0) fetchMetaTemplates();
                      }}
                      className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${
                        templateSource === 'meta' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Modelos Meta API
                      <ShieldCheck size={14} className={templateSource === 'meta' ? 'text-primary-500' : ''} />
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    {templateSource === 'internal' ? 'Selecione o Modelo Interno' : 'Selecione o Modelo da Meta'}
                  </label>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {templateSource === 'internal' ? (
                      templates.length === 0 ? (
                        <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                          <p className="text-sm font-bold text-slate-400">Nenhum modelo cadastrado.</p>
                          <p className="text-[10px] text-slate-300 uppercase tracking-widest mt-1">Vá em "Gerenciar Modelos" primeiro.</p>
                        </div>
                      ) : templates.map(template => (
                        <button
                          key={template.id}
                          onClick={() => setCampaignData({...campaignData, templateId: template.id, templateName: template.name, isMetaTemplate: false, templateLanguage: 'pt_BR', variables: {}})}
                          className={`py-2 px-3.5 rounded-xl border-2 transition-all text-left flex items-center justify-between ${
                            campaignData.templateId === template.id
                              ? 'border-primary-500 bg-primary-50/30'
                              : 'border-slate-50 bg-white hover:border-slate-100'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-black text-slate-900">{template.name}</p>
                            <div className="flex items-center gap-3">
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{template.category}</p>
                               <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{template.variables_count} Variáveis</p>
                            </div>
                          </div>
                          {campaignData.templateId === template.id && <CheckCircle2 className="text-primary-500" size={18} />}
                        </button>
                      ))
                    ) : (
                      isFetchingMeta ? (
                        <div className="p-10 flex flex-col items-center justify-center gap-4">
                          <Loader2 size={32} className="text-primary-500 animate-spin" />
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando na Meta...</p>
                        </div>
                      ) : metaTemplates.length === 0 ? (
                        <div className="p-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                          <p className="text-sm font-bold text-slate-400">Nenhum template aprovado na Meta.</p>
                          <p className="text-[10px] text-slate-300 uppercase tracking-widest mt-1">Verifique seu Gerenciador de WhatsApp.</p>
                        </div>
                      ) : metaTemplates.map(template => {
                        const body = template.components?.find((c: any) => c.type === 'BODY')?.text || '';
                        const varCount = (body.match(/\{\{\d+\}\}/g) || []).length;

                        return (
                          <button
                            key={template.id}
                            onClick={() => setCampaignData({...campaignData, templateId: template.id, templateName: template.name, isMetaTemplate: true, templateLanguage: template.language || 'pt_BR', variables: {}})}
                            className={`py-2 px-3.5 rounded-xl border-2 transition-all text-left flex items-center justify-between ${
                              campaignData.templateId === template.id
                                ? 'border-primary-500 bg-primary-50/30'
                                : 'border-slate-50 bg-white hover:border-slate-100'
                            }`}
                          >
                            <div>
                              <p className="text-sm font-black text-slate-900">{template.name}</p>
                              <div className="flex items-center gap-3">
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{template.category}</p>
                                 <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                 <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                                   <ShieldCheck size={10} /> {template.status}
                                 </p>
                                 <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{varCount} Variáveis</p>
                              </div>
                            </div>
                            {campaignData.templateId === template.id && <CheckCircle2 className="text-primary-500" size={18} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {campaignData.templateId && (
                  (() => {
                    let varCount = 0;
                    if (templateSource === 'internal') {
                      const selectedTemplate = templates.find(t => t.id === campaignData.templateId);
                      varCount = selectedTemplate?.variables_count || 0;
                    } else {
                      const selectedTemplate = metaTemplates.find(t => t.id === campaignData.templateId);
                      const body = selectedTemplate?.components?.find((c: any) => c.type === 'BODY')?.text || '';
                      varCount = (body.match(/\{\{\d+\}\}/g) || []).length;
                    }

                    if (varCount === 0) return null;
                    
                    return (
                      <div className="p-4 bg-slate-900 rounded-2xl space-y-3 animate-in zoom-in-95 duration-300 shadow-xl border border-white/5">
                        <div className="flex items-center gap-2 text-white">
                           <Sparkles className="text-amber-400" size={18} />
                           <h4 className="text-sm font-black">Personalização da Mensagem</h4>
                        </div>
                        
                        <div className="space-y-3">
                          {Array.from({ length: varCount }).map((_, i) => (
                            <div key={i} className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Variável {"{{"}{i+1}{"}}"}</label>
                              <select
                                value={campaignData.variables[`var${i+1}`] || ''}
                                onChange={e => setCampaignData({
                                  ...campaignData, 
                                  variables: { ...campaignData.variables, [`var${i+1}`]: e.target.value }
                                })}
                                className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-primary-500 outline-none transition-all font-bold"
                              >
                                <option value="">Selecione o campo do contato...</option>
                                {contactFields.map(field => (
                                  <option key={field.id} value={field.id}>{field.label}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            <div className="flex items-center gap-4 pt-4">
              <button 
                onClick={() => setCurrentStep(1)}
                className="px-6 py-3.5 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-all"
              >
                Voltar
              </button>
              <button 
                disabled={campaignData.messageType === 'custom' ? !campaignData.customText.trim() : !campaignData.templateId}
                onClick={() => {
                  if (campaignData.messageType === 'custom' && !campaignData.name) {
                    setCampaignData({...campaignData, name: 'Disparo Manual'});
                  }
                  setCurrentStep(3);
                }}
                className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2 group shadow-xl disabled:opacity-50 disabled:grayscale"
              >
                Revisar Disparo
                <Zap size={18} className="text-amber-400" />
              </button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-5 bg-slate-900 rounded-3xl text-white space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10"><BarChart3 size={80} /></div>
                
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Resumo da Campanha</p>
                   <h3 className="text-xl font-black">{campaignData.name}</h3>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                   <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Público</p>
                      <p className="text-sm font-bold">{campaignData.targetType === 'all' ? 'Todos os contatos' : 'Segmentado'}</p>
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Mensagem</p>
                      <p className="text-sm font-bold truncate">{campaignData.templateName}</p>
                   </div>
                </div>
             </div>

             {(() => {
               let previewBody = '';
               
               if (campaignData.messageType === 'custom' && campaignData.customText.trim()) {
                 previewBody = campaignData.customText;
               } else if (campaignData.messageType === 'template' && campaignData.templateId) {
                 if (campaignData.isMetaTemplate) {
                   const t = metaTemplates.find((x: any) => x.id === campaignData.templateId);
                   previewBody = t?.components?.find((c: any) => c.type === 'BODY')?.text || '';
                 } else {
                   const t = templates.find((x: any) => x.id === campaignData.templateId);
                   previewBody = t?.body || '';
                 }
               }
               
               if (!previewBody) return null;
               
               let sampleName = 'João';
               let samplePhone = '5511999999999';
               
               if (campaignData.targetType === 'upload' && campaignData.uploadedContacts?.length > 0) {
                 sampleName = campaignData.uploadedContacts[0].nome || campaignData.uploadedContacts[0].name || sampleName;
                 samplePhone = campaignData.uploadedContacts[0].telefone || samplePhone;
               } else if (campaignData.singleContact?.nome) {
                 sampleName = campaignData.singleContact.nome;
                 samplePhone = campaignData.singleContact.telefone || samplePhone;
               }
               
               let finalMessage = previewBody
                 .replace(/\{nome\}/gi, sampleName)
                 .replace(/\{telefone\}/gi, samplePhone);
                 
               Object.keys(campaignData.variables).forEach((key) => {
                 const varIndex = key.replace('var', '');
                 const varField = campaignData.variables[key];
                 let varValue = `[${varField}]`;
                 if (varField === 'full_name' || varField === 'first_name') varValue = sampleName;
                 if (varField === 'phone') varValue = samplePhone;
                 finalMessage = finalMessage.replace(new RegExp(`\\{\\{${varIndex}\\}\\}`, 'g'), varValue);
               });
                 
               return (
                 <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-2">
                   <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                     <Send size={12} /> Mensagem Final
                   </p>
                   <div className="bg-emerald-100/70 p-3 rounded-2xl text-xs font-medium text-slate-800 border border-emerald-200 shadow-sm leading-relaxed whitespace-pre-wrap">
                     {finalMessage}
                   </div>
                 </div>
               );
             })()}

             <div className="p-4 md:p-5 border border-slate-100 rounded-3xl bg-slate-50 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                   <AlertCircle size={20} className="text-amber-500" />
                   <p className="text-xs font-bold leading-tight">Ao confirmar, as mensagens serão enviadas em fila. O custo será debitado da sua conta da Meta.</p>
                </div>
             </div>

             <div className="flex items-center gap-4 pt-4">
              <button 
                onClick={() => setCurrentStep(2)}
                className="px-6 py-3.5 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-all"
              >
                Voltar
              </button>
              <button 
                disabled={isSaving}
                onClick={async () => {
                  try {
                    setIsSaving(true);
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) throw new Error('Usuário não autenticado');

                    // Pré-calcula o total de contatos para exibir na interface corretamente antes do envio
                    let finalContacts: any[] = [];
                    const { data: allContacts, error: contactsErr } = await supabase
                      .from('contacts')
                      .select('*')
                      .eq('user_id', user.id);

                    if (contactsErr) throw new Error('Erro ao buscar contatos: ' + contactsErr.message);

                    if (campaignData.targetType === 'labels' && campaignData.selectedLabels[0]) {
                      const { data: threads, error: threadsErr } = await supabase
                        .from('threads')
                        .select('id, remote_jid, contact_name, labels')
                        .eq('user_id', user.id);
                      
                      if (threadsErr) throw new Error('Erro ao buscar conversas: ' + threadsErr.message);

                      if (threads && threads.length > 0) {
                        const targetLabel = campaignData.selectedLabels[0].trim().toLowerCase();
                        const matchingThreads = threads.filter(t => 
                          t.labels && Array.isArray(t.labels) && 
                          t.labels.some(l => String(l).trim().toLowerCase() === targetLabel)
                        );

                        finalContacts = matchingThreads.map(t => ({
                           id: t.id,
                           telefone: (t.remote_jid || '').split('@')[0].replace(/\D/g, ''),
                           nome: t.contact_name || 'Lead'
                        }));
                      }
                    } else if (campaignData.targetType === 'funnel') {
                      finalContacts = (allContacts || []).filter(c => c.status_funil === campaignData.selectedFunnelStatus);
                    } else if (campaignData.targetType === 'manual') {
                      const numbers = (campaignData.manualList || '').split('\n').map(n => n.trim()).filter(n => n);
                      finalContacts = numbers.map(n => ({ id: 'manual-' + n, telefone: n.replace(/\D/g, ''), nome: 'Lead Manual' }));
                    } else if (campaignData.targetType === 'upload') {
                      finalContacts = (campaignData.uploadedContacts || []).map((c: any) => ({
                         id: 'upload-' + (c.telefone || c.number),
                         telefone: (c.telefone || c.number || '').replace(/\D/g, ''),
                         nome: c.nome || c.name || 'Lead Planilha'
                      }));
                    } else if (campaignData.targetType === 'single_contact') {
                      const res = await standardFetch('/api/v2/campaigns/send-single', {
                        method: 'POST',
                        body: JSON.stringify({
                          linkedCampaignId: campaignData.singleContact.linkToCampaign ? campaignData.singleContact.linkedCampaignId : null,
                          newCampaignData: campaignData.singleContact.linkToCampaign ? null : {
                            name: campaignData.name || (campaignData.messageType === 'custom' ? 'Mensagem Direta' : 'Nova Campanha'),
                            messageType: campaignData.messageType,
                            templateId: campaignData.templateId,
                            templateName: campaignData.templateName,
                            customText: campaignData.customText,
                            variables: campaignData.variables
                          },
                          contact: {
                            nome: campaignData.singleContact.nome,
                            telefone: campaignData.singleContact.telefone
                          }
                        })
                      });
                      const result = await res.json();
                      if (!result.success) throw new Error(result.error);
                      toast.success('Mensagem enviada com sucesso!');
                      setIsModalOpen(false);
                      setEditingCampaignId(null);
                      fetchCampaigns();
                      setIsSaving(false);
                      return; // Sai do fluxo normal de criação
                    } else {
                      finalContacts = allContacts || [];
                    }

                    const calculatedTotal = finalContacts.length;

                    const campaignPayload = {
                      tenant_id: user.id,
                      name: campaignData.name || (campaignData.messageType === 'custom' ? 'Mensagem Direta' : 'Nova Campanha'),
                      template_name: campaignData.messageType === 'custom' ? 'Mensagem Personalizada' : campaignData.templateName,
                      template_id: campaignData.templateId || null,
                      message_type: campaignData.messageType,
                      custom_text: campaignData.messageType === 'custom' ? campaignData.customText : null,
                      target_type: campaignData.targetType,
                      selected_labels: campaignData.targetType === 'labels' ? campaignData.selectedLabels[0] : null,
                      selected_funnel_status: campaignData.targetType === 'funnel' ? campaignData.selectedFunnelStatus : null,
                      manual_list: campaignData.targetType === 'manual' ? campaignData.manualList : null,
                      uploaded_contacts: campaignData.targetType === 'upload' ? campaignData.uploadedContacts : null,
                      variables: campaignData.variables,
                      status: 'pending',
                      total_contacts: calculatedTotal,
                      sent_count: 0,
                      error_count: 0
                    };

                    if (editingCampaignId) {
                       const { error } = await supabase.from('campaigns').update(campaignPayload).eq('id', editingCampaignId);
                       if (error) throw error;
                       toast.success('Campanha atualizada com sucesso!');
                    } else {
                       const { error } = await supabase.from('campaigns').insert(campaignPayload);
                       if (error) throw error;
                       toast.success('Campanha criada com sucesso!');
                    }

                    setIsModalOpen(false);
                    setEditingCampaignId(null);
                    fetchCampaigns();
                  } catch (err: any) {
                    toast.error('Erro ao criar campanha: ' + err.message);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-emerald-500/20"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={18} /> : (
                  <>
                    Iniciar Disparo Agora
                    <Send size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 md:px-0 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
           <Send size={120} className="-rotate-12" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-50 text-primary-600 rounded-xl">
              <Send size={24} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Campanhas Oficiais</h1>
          </div>
          <p className="text-slate-500 max-w-md">
            Gerencie seus modelos e dispare mensagens em massa com segurança Meta.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button 
            onClick={() => {
              setEditingCampaignId(null);
              setCampaignData({ 
                name: '', 
                targetType: 'manual', 
                selectedLabels: [], 
                selectedFunnelStatus: '', 
                manualList: '',
                uploadedContacts: [],
                messageType: 'custom',
                customText: '',
                templateId: '', 
                templateName: '', 
                templateLanguage: 'pt_BR',
                isMetaTemplate: false,
                singleContact: { nome: '', telefone: '', linkToCampaign: false, linkedCampaignId: '' },
                variables: {} 
              });
              setCurrentStep(1);
              setShowContactsList(false);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 group"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            Nova Campanha
          </button>
        </div>
      </div>

      {/* Anti-Ban Info Banner */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary-600 shadow-sm">
             <ShieldCheck size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Proteção Anti-Ban Ativada</h4>
            <p className="text-xs text-slate-500 font-medium max-w-2xl">
              Para sua segurança, o sistema simula o comportamento humano sorteando um intervalo aleatório entre <b>60 a 180 segundos</b> após cada mensagem enviada. 
              Isso evita padrões robóticos e protege sua conta. <b>Importante:</b> Todo disparo em massa possui riscos; recomendamos moderação no volume e na frequência para manter a saúde do seu número.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/50 px-4 py-2 rounded-xl border border-white">
           <Info size={14} className="text-primary-500" />
           <span className="text-[10px] font-black uppercase text-slate-500">Envio continua mesmo se fechar esta aba</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'campaigns' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Disparos
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'templates' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Modelos de Mensagem
        </button>
      </div>

      {activeTab === 'campaigns' ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Search and Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Pesquisar campanhas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/5 transition-all text-sm font-medium"
              />
            </div>
          </div>

          {/* Campaigns List */}
          <div className="grid grid-cols-1 gap-4">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))
            ) : campaigns.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-dashed border-slate-200">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
                  <Send size={40} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Nenhuma campanha criada</h2>
                <p className="text-slate-500 max-w-sm">Você ainda não realizou nenhum disparo oficial. Clique em "Nova Campanha" para começar.</p>
              </div>
            ) : (
              campaigns.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map((campaign) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={campaign.id}
                  className="group bg-white p-6 rounded-2xl border border-slate-100 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-500/5 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border ${
                        campaign.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        campaign.status === 'failed' ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        <Layout size={24} />
                      </div>
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-bold text-slate-900 truncate">{campaign.name}</h3>
                          {getStatusBadge(campaign.status)}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                          <span className="flex items-center gap-1"><Sparkles size={14}/> Template: {campaign.template_name}</span>
                          <span className="flex items-center gap-1"><Users size={14}/> {campaign.total_contacts} contatos</span>
                          <span className="flex items-center gap-1"><Clock size={14}/> {new Date(campaign.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 mr-2">
                        {campaign.status === 'pending' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCampaign(campaign);
                            }}
                            title="Editar Campanha"
                            className="p-2.5 text-slate-400 bg-slate-50 hover:bg-primary-50 hover:text-primary-600 rounded-xl transition-all"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCampaign(campaign.id);
                          }}
                          title="Excluir Campanha"
                          className="p-2.5 text-slate-400 bg-slate-50 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {(campaign.status === 'pending' || processingCampaignId === campaign.id) && (
                        <div className="flex items-center gap-2">
                          {processingCampaignId === campaign.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelCampaign(campaign.id);
                              }}
                              title="Cancelar campanha"
                              className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100"
                            >
                              <XCircle size={16} />
                              Cancelar
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (processingCampaignId === campaign.id) return;
                              if (confirm('Deseja iniciar o envio para esta campanha agora?')) {
                                startCampaign(campaign);
                              }
                            }}
                            disabled={!!processingCampaignId}
                            className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 min-w-[180px] justify-center"
                          >
                            {processingCampaignId === campaign.id ? (
                              isWaiting ? (
                                <span className="flex items-center gap-2">
                                  <Clock size={16} className="animate-pulse" />
                                  Próximo em {countdown}s
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <Loader2 className="animate-spin" size={16} />
                                  Enviando...
                                </span>
                              )
                            ) : (
                              <>
                                <Play size={16} />
                                Iniciar Envio
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <div className="hidden md:flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Enviadas</p>
                          <p className="text-lg font-black text-slate-900 tabular-nums">{campaign.sent_count}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Erros</p>
                          <p className={`text-lg font-black tabular-nums ${campaign.error_count > 0 ? 'text-red-500' : 'text-slate-900'}`}>{campaign.error_count}</p>
                        </div>
                      </div>

                      <div className="p-2 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all">
                        <ChevronRight size={24} />
                      </div>
                    </div>
                  </div>

                  {(campaign.status === 'sending' || processingCampaignId === campaign.id) && (
                    <div className="mt-6 pt-6 border-t border-slate-50 animate-in slide-in-from-top-2 duration-300">
                       <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                         <div className="flex items-center gap-2">
                            <Loader2 className="animate-spin text-primary-500" size={12} />
                            <span>Processando Disparo...</span>
                         </div>
                         <span>{campaign.total_contacts > 0 ? Math.round((campaign.sent_count / campaign.total_contacts) * 100) : 0}%</span>
                       </div>
                       <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                         <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${campaign.total_contacts > 0 ? (campaign.sent_count / campaign.total_contacts) * 100 : 0}%` }}
                            className="h-full bg-primary-500 shadow-[0_0_10px_rgba(var(--color-primary-500),0.5)]"
                         />
                       </div>
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
           <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Modelos Cadastrados</h2>
              <button 
                onClick={() => {
                  setNewTemplate({ name: '', category: 'MARKETING', variables_count: 0, language: 'pt_BR', body: '' });
                  setIsTemplateModalOpen(true);
                }}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <Plus size={16} /> Novo Modelo
              </button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.length === 0 ? (
                <div className="col-span-full py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                      <Layout size={32} />
                   </div>
                   <p className="text-sm font-bold text-slate-500">Nenhum modelo cadastrado ainda.</p>
                   <p className="text-xs text-slate-400 mt-1">Cadastre seus modelos da Meta aqui primeiro.</p>
                </div>
              ) : templates.map(template => (
                <div key={template.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                   <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                         <Layout size={20} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setNewTemplate(template);
                            setIsTemplateModalOpen(true);
                          }}
                          className="p-2 text-slate-200 hover:text-primary-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                           <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={async () => {
                          if (confirm('Deseja excluir este modelo?')) {
                            await supabase.from('message_templates').delete().eq('id', template.id);
                            fetchTemplates();
                            toast.success('Modelo excluído');
                          }
                        }}
                        className="p-2 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                         <Trash2 size={18} />
                      </button>
                   </div>
                   <h3 className="font-black text-slate-900 mb-1 truncate">{template.name}</h3>
                   <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded uppercase tracking-widest">{template.category}</span>
                      <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{template.variables_count} Variáveis</span>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Modal - New Campaign Wizard */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-4 md:p-5 border-b border-slate-50 bg-slate-50/50 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white text-primary-600 rounded-xl shadow-sm">
                      <Plus size={20} />
                    </div>
                    <h2 className="text-xl font-black text-slate-900">Nova Campanha</h2>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <Trash2 size={20} />
                  </button>
                </div>
                
                {/* Steps Indicator */}
                <div className="flex items-center gap-4 mt-2">
                   {[1, 2, 3].map(s => (
                     <div key={s} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                          currentStep >= s ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-400'
                        }`}>
                          {s}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                          currentStep >= s ? 'text-primary-600' : 'text-slate-300'
                        }`}>
                          {s === 1 ? 'Público' : s === 2 ? 'Mensagem' : 'Revisão'}
                        </span>
                        {s < 3 && <div className="w-8 h-[2px] bg-slate-100"></div>}
                     </div>
                   ))}
                </div>
              </div>

              <div className="p-4 md:p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                 {renderWizard()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - New Template */}
      <AnimatePresence>
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden p-10 space-y-8"
            >
              <div>
                <h2 className="text-2xl font-black text-slate-900">{newTemplate.id ? 'Editar Modelo' : 'Novo Modelo'}</h2>
                <p className="text-sm text-slate-400">Cadastre o nome exato do modelo aprovado na Meta.</p>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Modelo (Exatamente como na Meta)</label>
                    <input 
                      type="text" 
                      placeholder="saudacao_cliente_v1"
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary-500 font-bold"
                      value={newTemplate.name}
                      onChange={e => setNewTemplate({...newTemplate, name: e.target.value})}
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                       <select 
                         className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary-500 font-bold"
                         value={newTemplate.category}
                         onChange={e => setNewTemplate({...newTemplate, category: e.target.value})}
                       >
                          <option value="MARKETING">Marketing</option>
                          <option value="UTILITY">Utilidade</option>
                          <option value="AUTHENTICATION">Autenticação</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Variáveis {'{{1}}, {{2}}...'}</label>
                       <input 
                         type="number" 
                         className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary-500 font-bold"
                         value={newTemplate.variables_count}
                         onChange={e => setNewTemplate({...newTemplate, variables_count: parseInt(e.target.value) || 0})}
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corpo da Mensagem (Para Evolution/Uazapi)</label>
                    <textarea 
                      placeholder="Olá {nome}, temos uma novidade..."
                      rows={4}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary-500 font-bold resize-none custom-scrollbar"
                      value={newTemplate.body}
                      onChange={e => setNewTemplate({...newTemplate, body: e.target.value})}
                    />
                    {/* Variáveis e Emojis rápidos */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Inserir:</span>
                      <button
                        type="button"
                        onClick={() => setNewTemplate({...newTemplate, body: newTemplate.body + ' {nome}'})}
                        className="px-2.5 py-1 bg-primary-50 hover:bg-primary-100 text-primary-600 rounded-lg text-xs font-bold transition-all border border-primary-100 flex items-center gap-1"
                      >
                        <span>{'{nome}'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTemplate({...newTemplate, body: newTemplate.body + ' {telefone}'})}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <span>{'{telefone}'}</span>
                      </button>

                      <span className="text-slate-200">|</span>

                      {['😊', '👋', '✅', '📌', '👉', '🔥'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setNewTemplate({...newTemplate, body: newTemplate.body + ' ' + emoji})}
                          className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm transition-all border border-slate-100"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-4">
                 <button onClick={() => setIsTemplateModalOpen(false)} className="px-8 py-5 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-all flex-1">Cancelar</button>
                 <button 
                  onClick={async () => {
                    try {
                      setIsSaving(true);
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) throw new Error('Usuário não autenticado');

                      if (newTemplate.id) {
                        const { error: updateErr } = await supabase.from('message_templates').update({
                          name: newTemplate.name,
                          category: newTemplate.category,
                          variables_count: newTemplate.variables_count,
                          language: newTemplate.language,
                          body: newTemplate.body
                        }).eq('id', newTemplate.id);
                        if (updateErr) throw updateErr;
                      } else {
                        const { error: insertErr } = await supabase.from('message_templates').insert({
                          name: newTemplate.name,
                          category: newTemplate.category,
                          variables_count: newTemplate.variables_count,
                          language: newTemplate.language,
                          body: newTemplate.body,
                          tenant_id: user.id
                        });
                        if (insertErr) throw insertErr;
                      }

                      toast.success(newTemplate.id ? 'Modelo atualizado com sucesso!' : 'Modelo cadastrado com sucesso!');
                      setIsTemplateModalOpen(false);
                      setNewTemplate({ name: '', category: 'MARKETING', variables_count: 0, language: 'pt_BR', body: '' });
                      fetchTemplates();
                    } catch (err: any) {
                      console.error('[CreateTemplate] Error:', err);
                      toast.error('Erro ao salvar modelo: ' + (err.message || 'Erro desconhecido'));
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className="px-8 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex-2 shadow-xl shadow-slate-200"
                 >
                   Salvar Modelo
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

