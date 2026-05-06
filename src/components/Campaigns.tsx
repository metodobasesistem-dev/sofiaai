import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Send, 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
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
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton } from './common/SkeletonLoader';

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: 'pending' | 'sending' | 'completed' | 'failed';
  total_contacts: number;
  sent_count: number;
  error_count: number;
  created_at: string;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignData, setCampaignData] = useState({
    name: '',
    targetType: 'all' as 'all' | 'tags' | 'funnel',
    selectedTags: [] as string[],
    selectedFunnelStatus: '',
    templateId: '',
    templateName: '',
    variables: {} as Record<string, string>
  });

  const [tags, setTags] = useState<string[]>([]);
  const [funnelStatuses, setFunnelStatuses] = useState<string[]>([]);

  const contactFields = [
    { id: 'full_name', label: 'Nome Completo' },
    { id: 'first_name', label: 'Primeiro Nome' },
    { id: 'phone', label: 'Telefone' },
    { id: 'email', label: 'E-mail' },
    { id: 'status_funil', label: 'Status do Funil' }
  ];

  const mockTemplates = [
    { id: '1', name: 'saudacao_cliente_novo', category: 'Marketing', lang: 'PT_BR', vars: 1 },
    { id: '2', name: 'lembrete_agendamento_v2', category: 'Utilidade', lang: 'PT_BR', vars: 2 },
    { id: '3', name: 'recuperacao_carrinho_sofia', category: 'Marketing', lang: 'PT_BR', vars: 0 }
  ];

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

  useEffect(() => {
    fetchCampaigns();
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

  // Modal - New Campaign Wizard
  const renderWizard = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nome da Campanha</label>
              <input 
                type="text" 
                placeholder="Ex: Promoção de Verão 2024"
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/5 transition-all font-bold"
                value={campaignData.name}
                onChange={e => setCampaignData({...campaignData, name: e.target.value})}
              />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Quem deve receber?</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'all', label: 'Todos', icon: <Users size={18} /> },
                  { id: 'labels', label: 'Etiquetas', icon: <Filter size={18} /> },
                  { id: 'funnel', label: 'Funil', icon: <Layers size={18} /> }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setCampaignData({...campaignData, targetType: type.id as any})}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                      campaignData.targetType === type.id 
                        ? 'border-primary-500 bg-primary-50/30 text-primary-900' 
                        : 'border-slate-50 bg-white text-slate-400 hover:border-slate-100'
                    }`}
                  >
                    {type.icon}
                    <span className="text-xs font-black">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {campaignData.targetType === 'labels' && (
              <div className="p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
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
              </div>
            )}

            {campaignData.targetType === 'funnel' && (
              <div className="p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
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
              </div>
            )}

            <button 
              disabled={!campaignData.name}
              onClick={() => setCurrentStep(2)}
              className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2 group shadow-xl disabled:opacity-50 disabled:grayscale"
            >
              Próximo Passo: Escolher Mensagem
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        );
      case 2:
        const selectedTemplate = mockTemplates.find(t => t.id === campaignData.templateId);
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Selecione o Modelo</label>
              <div className="grid grid-cols-1 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {mockTemplates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setCampaignData({...campaignData, templateId: template.id, templateName: template.name, variables: {}})}
                    className={`p-4 rounded-2xl border-2 transition-all text-left flex items-center justify-between ${
                      campaignData.templateId === template.id 
                        ? 'border-primary-500 bg-primary-50/30' 
                        : 'border-slate-50 bg-white hover:border-slate-100'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-black text-slate-900">{template.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{template.category}</p>
                    </div>
                    {campaignData.templateId === template.id && <CheckCircle2 className="text-primary-500" size={18} />}
                  </button>
                ))}
              </div>
            </div>

            {selectedTemplate && selectedTemplate.vars > 0 && (
              <div className="p-6 bg-slate-900 rounded-[2rem] space-y-6 animate-in zoom-in-95 duration-300 shadow-xl border border-white/5">
                <div className="flex items-center gap-2 text-white">
                   <Sparkles className="text-amber-400" size={20} />
                   <h4 className="text-sm font-black">Personalização da Mensagem</h4>
                </div>
                
                <div className="space-y-4">
                  {Array.from({ length: selectedTemplate.vars }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Variável {"{{"}{i+1}{"}}"}</label>
                      <select
                        value={campaignData.variables[`var${i+1}`] || ''}
                        onChange={e => setCampaignData({
                          ...campaignData, 
                          variables: { ...campaignData.variables, [`var${i+1}`]: e.target.value }
                        })}
                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-primary-500 outline-none transition-all font-bold"
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
            )}

            <div className="flex items-center gap-4 pt-4">
              <button 
                onClick={() => setCurrentStep(1)}
                className="px-8 py-5 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-all"
              >
                Voltar
              </button>
              <button 
                disabled={!campaignData.templateId}
                onClick={() => setCurrentStep(3)}
                className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-black transition-all flex items-center justify-center gap-2 group shadow-xl"
              >
                Revisar Disparo
                <Zap size={18} className="text-amber-400" />
              </button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="p-8 bg-slate-900 rounded-[2rem] text-white space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10"><BarChart3 size={80} /></div>
                
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Resumo da Campanha</p>
                   <h3 className="text-2xl font-black">{campaignData.name}</h3>
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

             <div className="p-6 border border-slate-100 rounded-3xl bg-slate-50 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                   <AlertCircle size={20} className="text-amber-500" />
                   <p className="text-xs font-bold leading-tight">Ao confirmar, as mensagens serão enviadas em fila. O custo será debitado da sua conta da Meta.</p>
                </div>
             </div>

             <div className="flex items-center gap-4 pt-4">
              <button 
                onClick={() => setCurrentStep(2)}
                className="px-8 py-5 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-all"
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

                    // Get tenant_id from profile
                    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();

                    const { error } = await supabase.from('campaigns').insert({
                      tenant_id: profile?.tenant_id,
                      name: campaignData.name,
                      template_name: campaignData.templateName,
                      template_id: campaignData.templateId,
                      status: 'pending',
                      total_contacts: 0, // In a real scenario, this would be calculated on backend
                      sent_count: 0,
                      error_count: 0
                    });

                    if (error) throw error;

                    toast.success('Campanha criada com sucesso!');
                    setIsModalOpen(false);
                    fetchCampaigns();
                  } catch (err: any) {
                    toast.error('Erro ao criar campanha: ' + err.message);
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="flex-1 py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-emerald-500/20"
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
            Dispare mensagens em massa utilizando modelos aprovados pela Meta com segurança e alta taxa de entrega.
          </p>
        </div>

        <button 
          onClick={() => {
            setCurrentStep(1);
            setIsModalOpen(true);
          }}
          className="relative z-10 flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 group"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          Nova Campanha
        </button>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-4">
        <div className="p-2 bg-white rounded-xl text-amber-600 shadow-sm shrink-0">
          <Info size={20} />
        </div>
        <div className="text-sm text-amber-900 leading-relaxed">
          <p className="font-black uppercase tracking-wider text-[10px] mb-1">Compliance e Segurança</p>
          <p>Para evitar bloqueios, o disparo oficial só permite o uso de **Modelos (Templates)** previamente aprovados pela Meta. Mensagens fora de padrão não serão enviadas.</p>
        </div>
      </div>

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

                <div className="flex items-center gap-8">
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

              {campaign.status === 'sending' && (
                <div className="mt-6 pt-6 border-t border-slate-50">
                   <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                     <span>Progresso do Disparo</span>
                     <span>{Math.round((campaign.sent_count / campaign.total_contacts) * 100)}%</span>
                   </div>
                   <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(campaign.sent_count / campaign.total_contacts) * 100}%` }}
                        className="h-full bg-primary-500"
                     />
                   </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Modal - New Campaign Wizard */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white text-primary-600 rounded-xl shadow-sm">
                      <Plus size={20} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Nova Campanha</h2>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <Trash2 size={20} />
                  </button>
                </div>
                
                {/* Steps Indicator */}
                <div className="flex items-center gap-4 mt-6">
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

              <div className="p-10">
                 {renderWizard()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

