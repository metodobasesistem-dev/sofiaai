import React, { useState, useEffect } from 'react';
import { 
  User, 
  Building2, 
  CreditCard, 
  Plug, 
  Clock, 
  Bot, 
  Check, 
  Zap, 
  ShieldCheck,
  ArrowRight,
  Lock,
  Loader2,
  Save,
  Key,
  MessageSquare,
  Plus,
  Trash2,
  Globe,
  Send,
  X,
  Smartphone,
  LogOut,
  Settings as SettingsIcon,
  ShieldAlert,
  Brain
} from 'lucide-react';
import PWADiagnostic from './PWADiagnostic';

import { motion, AnimatePresence } from 'motion/react';
import { 
  getUserProfile, 
  updateUserProfile, 
  UserProfile, 
  listChannels, 
  createChannel, 
  deleteChannel, 
  listAgents,
  listQuickReplies,
  createQuickReply,
  deleteQuickReply,
  type Agent,
  type Channel,
  type QuickReply
} from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

interface PlanCardProps {
  name: string;
  price: string;
  benefits: string[];
  buttonText: string;
  popular?: boolean;
  billingCycle: 'monthly' | 'yearly';
}

const PlanCard = ({ name, price, benefits, buttonText, popular, billingCycle }: PlanCardProps) => (
  <div className={`relative bg-white p-8 rounded-2xl border-2 transition-all flex flex-col h-full
    ${popular ? 'border-primary-600 shadow-xl shadow-primary-100 scale-105 z-10' : 'border-gray-100 shadow-sm hover:border-gray-200'}`}>
    
    {popular && (
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">
        Mais Popular
      </div>
    )}

    <div className="mb-6">
      <h3 className="text-xl font-bold text-gray-900">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-black text-gray-900">{price}</span>
        <span className="text-gray-500 text-sm">{billingCycle === 'monthly' ? '/mês' : '/ano'}</span>
      </div>
    </div>

    <ul className="space-y-4 mb-8 flex-1">
      {benefits.map((benefit, index) => {
        const isNegative = benefit.startsWith('[-]');
        const isHighlighted = benefit.startsWith('[H]');
        const text = benefit.replace('[-]', '').replace('[H]', '');
        
        return (
          <li 
            key={index} 
            className={`flex items-start gap-3 text-sm transition-all
              ${isNegative ? 'text-gray-400 line-through opacity-50' : 'text-gray-600 font-medium'}
              ${isHighlighted ? 'bg-primary-50/50 p-3 rounded-xl border border-primary-100/50 shadow-sm' : ''}
            `}
          >
            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 
              ${isNegative ? 'bg-gray-100 text-gray-400' : (isHighlighted ? 'bg-primary-600 text-white' : (popular ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'))}`}>
              {isNegative ? <X size={12} /> : (isHighlighted ? <Sparkles size={12} /> : <Check size={12} />)}
            </div>
            <div className="flex flex-col">
              <span className={isHighlighted ? 'text-primary-900 font-bold' : ''}>{text}</span>
              {isHighlighted && <span className="text-[9px] text-primary-500 font-black uppercase tracking-widest mt-0.5">Diferencial Único</span>}
            </div>
          </li>
        );
      })}
    </ul>

    <button className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2
      ${popular 
        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md shadow-primary-200' 
        : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
      {buttonText}
      <ArrowRight size={16} />
    </button>
  </div>
);

import { 
  getWhatsAppStatus, 
  connectWhatsApp, 
  listenToWhatsAppSession, 
  type WhatsAppStatusResponse 
} from '../services/whatsappService';



export default function Settings({ initialSubTab = 'account' }: { initialSubTab?: string }) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || 'account');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatusResponse | null>(null);

  useEffect(() => {
    if (profile?.trial_ends_at && profile?.plano?.toLowerCase() === 'trial') {
      const expired = new Date(profile.trial_ends_at).getTime() < Date.now();
      setIsExpired(expired);
    } else {
      setIsExpired(false);
    }
  }, [profile]);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  // Real-time listener for WhatsApp status
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      unsubscribe = listenToWhatsAppSession(user.id, (data) => {
        setWhatsappStatus(data);
        
        if (data.status === 'connected') {
          if (isWhatsAppModalOpen) {
            toast.success('WhatsApp conectado com sucesso!');
            setIsWhatsAppModalOpen(false);
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isWhatsAppModalOpen]);

  const handleConnectWpp = async () => {
    if (isExpired) {
      toast.error('Período de teste expirado!', {
        description: 'Assine um plano para conectar seu WhatsApp.'
      });
      setActiveSubTab('subscription');
      return;
    }
    try {
      setIsConnecting(true);
      await connectWhatsApp();
      setIsWhatsAppModalOpen(true);
    } catch (error: any) {
      console.error('Failed to connect WhatsApp:', error);
      const errorMsg = error.message || 'Erro ao iniciar conexão com WhatsApp';
      toast.error(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWpp = async () => {
    toast.info('Funcionalidade de desconexão em manutenção.');
  };
  
  const handleLogout = async () => {
    try {
      // 1. Limpeza total de cookies e localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase.auth.token') || key.includes('-auth-token')) {
          localStorage.removeItem(key);
        }
      });
      
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }
      
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Logout error:', e);
    } finally {
      window.location.replace('/');
    }
  };

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Channels State
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelData, setNewChannelData] = useState({
    nome: '',
    agentId: '',
    tipo: 'whatsapp' as 'whatsapp' | 'chat' | 'telegram'
  });

  // Quick Replies State
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [newReplyData, setNewReplyData] = useState({ title: '', content: '' });
  const [isCreatingReply, setIsCreatingReply] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    nome_completo: '',
    email: '',
    nome_empresa: '',
    whatsapp_organizacao: '',
    descricao_empresa: '',
    produtos_servicos: '',
    faq: '',
    links_importantes: '',
    notification_phone: '',
    llm_provider: '',
    openai_api_key: '',
    gemini_api_key: '',
    default_ai_model: '',
    sofia_prompt: '',
    sofia_active: true
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      // Fetch Profile
      try {
        const profileData = await getUserProfile();
        if (profileData) {
          setProfile(profileData);
          setFormData({
            nome_completo: profileData.nome_completo || '',
            email: profileData.email || '',
            nome_empresa: profileData.nome_empresa || '',
            whatsapp_organizacao: profileData.whatsapp_organizacao || '',
            descricao_empresa: profileData.descricao_empresa || '',
            produtos_servicos: profileData.produtos_servicos || '',
            faq: profileData.faq || '',
            links_importantes: profileData.links_importantes || '',
            notification_phone: profileData.notification_phone || '',
            llm_provider: profileData.llm_provider || '',
            openai_api_key: profileData.openai_api_key || '',
            gemini_api_key: profileData.gemini_api_key || '',
            default_ai_model: profileData.default_ai_model || '',
            sofia_prompt: profileData.sofia_prompt || '',
            sofia_active: profileData.sofia_active ?? true
          });
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
        toast.error('Erro ao carregar perfil');
      }

      // Fetch Channels
      try {
        const channelsData = await listChannels();
        if (channelsData) setChannels(channelsData);
      } catch (err) {
        console.error('Channels fetch error:', err);
        toast.error('Erro ao carregar canais');
      }

      // Fetch Agents
      try {
        const agentsData = await listAgents();
        if (agentsData) setAgents(agentsData);
      } catch (err) {
        console.error('Agents fetch error:', err);
        toast.error('Erro ao carregar agentes');
      }

      // Fetch Quick Replies
      try {
        const repliesData = await listQuickReplies();
        if (repliesData) setQuickReplies(repliesData);
      } catch (err) {
        console.error('Quick replies fetch error:', err);
      }

      setIsLoading(false);
    };
    // Safety Timeout to force-unlock UI
    const safetyTimeout = setTimeout(() => {
      console.warn('[Settings] Safety unlock triggered after 5s');
      setIsLoading(false);
    }, 5000);

    fetchData().then(() => clearTimeout(safetyTimeout));
    return () => clearTimeout(safetyTimeout);
  }, []);

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      await updateUserProfile({
        nome_completo: formData.nome_completo,
        nome_empresa: formData.nome_empresa,
        whatsapp_organizacao: formData.whatsapp_organizacao,
        descricao_empresa: formData.descricao_empresa,
        produtos_servicos: formData.produtos_servicos,
        faq: formData.faq,
        links_importantes: formData.links_importantes,
        notification_phone: formData.notification_phone,
        llm_provider: formData.llm_provider,
        openai_api_key: formData.openai_api_key,
        gemini_api_key: formData.gemini_api_key,
        default_ai_model: formData.default_ai_model,
        sofia_prompt: formData.sofia_prompt,
        sofia_active: formData.sofia_active
      });
      toast.success('Perfil atualizado com sucesso!');
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Erro ao atualizar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelData.nome || !newChannelData.agentId) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setIsCreatingChannel(true);
      const created = await createChannel({
        nome: newChannelData.nome,
        agentId: newChannelData.agentId,
        tipo: newChannelData.tipo,
        status: 'ativo'
      });

      if (created) {
        setChannels([...channels, created as Channel]);
        setIsModalOpen(false);
        setNewChannelData({ nome: '', agentId: '', tipo: 'whatsapp' });
        toast.success('Canal criado com sucesso!');
      }
    } catch (error) {
      console.error('Failed to create channel:', error);
      toast.error('Erro ao criar canal');
    } finally {
      setIsCreatingChannel(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    try {
      await deleteChannel(id);
      setChannels(channels.filter(c => c.id !== id));
      toast.success('Canal excluído com sucesso!');
    } catch (error) {
      console.error('Failed to delete channel:', error);
      toast.error('Erro ao excluir canal');
    }
  };

  const handleCreateQuickReply = async () => {
    if (!newReplyData.title || !newReplyData.content) {
      toast.error('Preencha o título e o conteúdo');
      return;
    }
    try {
      setIsCreatingReply(true);
      await createQuickReply(newReplyData);
      const updated = await listQuickReplies();
      setQuickReplies(updated);
      setNewReplyData({ title: '', content: '' });
      toast.success('Resposta rápida criada!');
    } catch (error) {
      console.error('Failed to create quick reply:', error);
      toast.error('Erro ao criar resposta rápida');
    } finally {
      setIsCreatingReply(false);
    }
  };

  const handleDeleteQuickReply = async (id: string) => {
    try {
      if (!confirm('Deseja excluir esta resposta rápida?')) return;
      await deleteQuickReply(id);
      setQuickReplies(quickReplies.filter(r => r.id !== id));
      toast.success('Resposta rápida excluída!');
    } catch (error) {
      console.error('Failed to delete quick reply:', error);
      toast.error('Erro ao excluir resposta rápida');
    }
  };

  const tabs = [
    { id: 'account', label: 'Conta', icon: <User size={18} /> },
    { id: 'subscription', label: 'Assinatura', icon: <CreditCard size={18} /> },
    { id: 'channels', label: 'Canais', icon: <MessageSquare size={18} /> },
    { id: 'ai_config', label: 'Configuração IA', icon: <Zap size={18} /> },
    { id: 'quick_replies', label: 'Respostas Rápidas', icon: <MessageSquare size={18} /> },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500">Gerencie suas configurações e preferências de conta</p>
      </div>

      {/* Internal Tabs Navigation */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full md:w-fit overflow-x-auto no-scrollbar whitespace-nowrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeSubTab === tab.id 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-8"
        >
          {activeSubTab === 'account' && (
            <div className="space-y-8">
              {/* Perfil Section */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                      <User size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Perfil</h3>
                      <p className="text-sm text-gray-500">Gerencie suas informações pessoais e profissionais</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome completo</label>
                      <input 
                        type="text"
                        value={formData.nome_completo}
                        onChange={e => setFormData({...formData, nome_completo: e.target.value})}
                        placeholder="Seu nome completo"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email</label>
                      <input 
                        type="email"
                        disabled
                        value={formData.email}
                        placeholder="seu@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 outline-none text-sm cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome da Organização</label>
                      <input 
                        type="text"
                        value={formData.nome_empresa}
                        onChange={e => setFormData({...formData, nome_empresa: e.target.value})}
                        placeholder="Nome da sua empresa"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">WhatsApp da Organização</label>
                      <input 
                        type="text"
                        value={formData.whatsapp_organizacao}
                        onChange={e => setFormData({...formData, whatsapp_organizacao: e.target.value})}
                        placeholder="Ex: 5511999999999"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Telefone para Notificações (WhatsApp)</label>
                      <input 
                        type="text"
                        value={formData.notification_phone}
                        onChange={e => setFormData({...formData, notification_phone: e.target.value})}
                        placeholder="Ex: 5511999999999"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-primary-500/50 hover:bg-primary-500 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Salvar alterações
                    </button>
                  </div>
                </div>
              </div>

              {/* Perfil da Empresa (Conhecimento da IA) Section */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Perfil da Empresa (Conhecimento da IA)</h3>
                      <p className="text-sm text-gray-500">Forneça detalhes para que a IA atenda seus clientes com precisão</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descrição da Empresa</label>
                      <textarea 
                        value={formData.descricao_empresa}
                        onChange={e => setFormData({...formData, descricao_empresa: e.target.value})}
                        placeholder="Ex: Somos uma agência de marketing digital focada em tráfego pago para negócios locais..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Produtos e Serviços</label>
                      <textarea 
                        value={formData.produtos_servicos}
                        onChange={e => setFormData({...formData, produtos_servicos: e.target.value})}
                        placeholder="Ex: Gestão de Google Ads (R$ 500/mês), Criação de Landing Pages (R$ 800)..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">FAQ (Perguntas Frequentes)</label>
                      <textarea 
                        value={formData.faq}
                        onChange={e => setFormData({...formData, faq: e.target.value})}
                        placeholder="Ex: P: Qual o horário? R: Seg a Sex das 09h às 18h..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Links Importantes</label>
                      <input 
                        type="text"
                        value={formData.links_importantes}
                        onChange={e => setFormData({...formData, links_importantes: e.target.value})}
                        placeholder="Ex: Site: www.site.com, Localização: bit.ly/mapa..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-primary-500/50 hover:bg-primary-500 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Salvar Conhecimento
                    </button>
                  </div>
                </div>
              </div>

              {/* Segurança Section */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                      <Lock size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Segurança</h3>
                      <p className="text-sm text-gray-500">Configure suas opções de segurança e acesso</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  <div className="max-w-md">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Senha atual</label>
                    <input 
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})}
                      placeholder="Sua senha atual"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nova senha</label>
                      <input 
                        type="password"
                        value={passwordData.newPassword}
                        onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Confirmar nova senha</label>
                      <input 
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                        placeholder="Repita a nova senha"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button 
                      className="px-6 py-2.5 bg-primary-500/50 hover:bg-primary-500 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                    >
                      <Key size={18} />
                      Atualizar senha
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Diagnóstico de PWA */}
              <PWADiagnostic />

              {/* App Mobile Section */}

              <div className="bg-primary-50 rounded-2xl border border-primary-100 p-8 mt-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary-900">Aplicativo Mobile</h3>
                    <p className="text-sm text-primary-600/70">Instale a Sofia na sua tela inicial para acesso rápido e notificações melhores.</p>
                  </div>
                </div>
                <button 
                  id="install-button"
                  onClick={async () => {
                    const promptEvent = (window as any).deferredPrompt;
                    if (promptEvent) {
                      promptEvent.prompt();
                      const { outcome } = await promptEvent.userChoice;
                      console.log(`[PWA] User response to the install prompt: ${outcome}`);
                      (window as any).deferredPrompt = null;
                    } else {
                      toast.info('Para instalar: Clique nos 3 pontos do navegador e selecione "Instalar Aplicativo" ou "Adicionar à tela de início".');
                    }
                  }}
                  className="px-8 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 flex items-center gap-2"
                >
                  <Smartphone size={18} />
                  Instalar Aplicativo
                </button>
              </div>

              {/* Logout Section */}
              <div className="bg-red-50 rounded-2xl border border-red-100 p-8 mt-8 flex flex-col md:flex-row items-center justify-between gap-6">

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                    <LogOut size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-900">Encerrar Sessão</h3>
                    <p className="text-sm text-red-600/70">Desconecte sua conta com segurança deste dispositivo.</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="px-8 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center gap-2"
                >
                  <LogOut size={18} />
                  Sair da Conta (Logout)
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'subscription' && (
            <div className="space-y-8">
              {/* Current Plan Banner */}
              <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-8 text-white shadow-xl shadow-primary-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                    <Zap size={32} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-primary-100 text-xs font-bold uppercase tracking-widest">Plano Atual</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{profile?.plano || 'Starter'}</span>
                    </div>
                    <h2 className="text-2xl font-bold">Você está no plano {profile?.plano || 'Starter'}</h2>
                    <p className="text-primary-100 text-sm opacity-80 mt-1">Sua próxima cobrança será em 15 de Abril, 2024.</p>
                  </div>
                </div>
                <button className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-xl text-sm font-bold transition-all">
                  Cancelar Assinatura
                </button>
              </div>

              {/* Upgrade Section */}
              <div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Fazer Upgrade</h3>
                      <p className="text-sm text-gray-500">Escolha o plano ideal para escalar seu atendimento.</p>
                    </div>
                  </div>

                  {/* Billing Toggle */}
                  <div className="flex items-center gap-4 bg-gray-100 p-1.5 rounded-2xl w-fit self-center">
                    <button 
                      onClick={() => setBillingCycle('monthly')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Mensal
                    </button>
                    <button 
                      onClick={() => setBillingCycle('yearly')}
                      className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative ${billingCycle === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Anual
                      <span className="absolute -top-3 -right-3 bg-emerald-500 text-white text-[8px] px-2 py-1 rounded-full animate-bounce shadow-lg shadow-emerald-500/20">
                        2 MESES GRÁTIS
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
                  <PlanCard 
                    name="Starter"
                    price={billingCycle === 'monthly' ? "R$ 37,90" : "R$ 379"}
                    billingCycle={billingCycle}
                    benefits={[
                      "Inbox (Chat Manual)",
                      "Dashboard de Métricas",
                      "Gestão de Contatos CRM",
                      "Até 1 Canal Conectado",
                      "Relatórios de Atendimento",
                      "[-] Agentes de IA Autônomos",
                      "[-] Agendamentos Inteligentes",
                      "[-] IA Sofia (Co-piloto)",
                      "[-] Campanhas de Marketing"
                    ]}
                    buttonText={billingCycle === 'monthly' ? "Assinar Starter" : "Assinar Anual"}
                  />
                  <PlanCard 
                    name="Pro"
                    price={billingCycle === 'monthly' ? "R$ 167,90" : "R$ 1.679"}
                    popular={true}
                    billingCycle={billingCycle}
                    benefits={[
                      "Tudo do plano Starter",
                      "Até 3 Agentes de IA ativos",
                      "Agendamentos e Calendário",
                      "Treinamento de IA (Texto)",
                      "Suporte via E-mail",
                      "[-] IA Sofia (Co-piloto)",
                      "[-] Campanhas e Broadcast",
                      "[-] Acesso a Modelos o1"
                    ]}
                    buttonText={billingCycle === 'monthly' ? "Assinar Pro" : "Assinar Anual"}
                  />
                  <PlanCard 
                    name="Elite"
                    price={billingCycle === 'monthly' ? "R$ 327,90" : "R$ 3.279"}
                    billingCycle={billingCycle}
                    benefits={[
                      "[H] IA Sofia (Co-piloto Autônomo)",
                      "Campanhas e Broadcast",
                      "Agentes de IA Ilimitados",
                      "Acesso aos modelos o1",
                      "Suporte VIP 24/7",
                      "Agendamentos Ilimitados",
                      "Multimodal (Imagem/Voz)"
                    ]}
                    buttonText={billingCycle === 'monthly' ? "Assinar Elite" : "Assinar Anual"}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'channels' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Canais Conectados</h3>
                      <p className="text-sm text-gray-500">Gerencie os canais de comunicação da sua organização ({channels.length}/1 canais)</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 transition-all"
                  >
                    <Plus size={18} />
                    Novo Canal
                  </button>
                </div>

                <div className="p-8">
                  {isExpired ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in zoom-in duration-500">
                      <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-red-100">
                        <Lock size={40} />
                      </div>
                      <h4 className="text-xl font-black text-gray-900">Período de Teste Expirado</h4>
                      <p className="text-sm text-gray-500 max-w-sm mt-2 leading-relaxed">
                        Seu acesso gratuito chegou ao fim. Para continuar utilizando a Sofia e seus canais de atendimento, escolha um dos nossos planos.
                      </p>
                      <button 
                        onClick={() => setActiveSubTab('subscription')}
                        className="mt-8 px-10 py-4 bg-primary-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-primary-700 transition-all shadow-xl shadow-primary-500/20"
                      >
                        Ativar Assinatura
                      </button>
                    </div>
                  ) : channels.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <p className="text-sm">Nenhum canal encontrado. Adicione um novo canal para começar.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {channels.map((channel) => (
                        <div key={channel.id} className="p-6 rounded-2xl border border-gray-100 bg-gray-50/50 hover:border-primary-200 transition-all group relative">
                          <button 
                            onClick={() => handleDeleteChannel(channel.id!)}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                          
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary-600">
                              {channel.tipo === 'whatsapp' ? <Smartphone size={24} /> : channel.tipo === 'chat' ? <Globe size={24} /> : <Send size={24} />}
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-900">{channel.nome}</h4>
                              <p className="text-xs text-gray-500 capitalize">{channel.tipo}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                            <div className="flex flex-col gap-1">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full w-fit ${channel.status === 'ativo' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                {channel.status}
                              </span>
                              {channel.tipo === 'whatsapp' && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full w-fit ${whatsappStatus?.status === 'connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                  {whatsappStatus?.status === 'connected' ? 'Conectado' : whatsappStatus?.status === 'waiting' ? 'Conectando...' : 'Desconectado'}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className="text-xs text-gray-400">
                                Agente: {agents.find(a => a.id === channel.agentId)?.nome || 'Nenhum'}
                              </span>
                              {channel.tipo === 'whatsapp' && (
                                <button 
                                  onClick={whatsappStatus?.status === 'connected' ? handleDisconnectWpp : handleConnectWpp}
                                  className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-all ${whatsappStatus?.status === 'connected' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                >
                                  {whatsappStatus?.status === 'connected' ? 'Desconectar' : 'Conectar'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'ai_config' && (
            <div className="space-y-8">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Configuração de Inteligência Artificial</h3>
                      <p className="text-sm text-gray-500">Configure seu próprio provedor de IA e chaves API (BYOK)</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-8">
                  {/* Provider Selection */}
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Escolha seu Provedor de IA</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        onClick={() => setFormData({...formData, llm_provider: 'openai'})}
                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left
                          ${formData.llm_provider === 'openai' ? 'border-primary-600 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl 
                          ${formData.llm_provider === 'openai' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          O
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">OpenAI (ChatGPT)</p>
                          <p className="text-xs text-gray-500">Modelos GPT-4o e GPT-4o-mini</p>
                        </div>
                      </button>

                      <button
                        onClick={() => setFormData({...formData, llm_provider: 'gemini'})}
                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left
                          ${formData.llm_provider === 'gemini' ? 'border-primary-600 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl 
                          ${formData.llm_provider === 'gemini' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          G
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">Google Gemini</p>
                          <p className="text-xs text-gray-500">Modelos Gemini 1.5 Pro e Flash</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* API Keys and Model */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      {formData.llm_provider === 'openai' ? (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">OpenAI API Key</label>
                          <div className="relative">
                            <input
                              type="password"
                              value={formData.openai_api_key}
                              onChange={e => setFormData({...formData, openai_api_key: e.target.value})}
                              placeholder="sk-..."
                              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                            />
                            <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          </div>
                          <p className="text-[10px] text-gray-400">Suas chaves são criptografadas e usadas apenas para suas interações.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Gemini API Key</label>
                          <div className="relative">
                            <input
                              type="password"
                              value={formData.gemini_api_key}
                              onChange={e => setFormData({...formData, gemini_api_key: e.target.value})}
                              placeholder="AIza..."
                              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                            />
                            <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          </div>
                          <p className="text-[10px] text-gray-400">Obtenha sua chave no Google AI Studio.</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Modelo Padrão</label>
                      <select
                        value={formData.default_ai_model}
                        onChange={e => setFormData({...formData, default_ai_model: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm appearance-none bg-white font-bold"
                      >
                        <option value="">Selecione um modelo...</option>
                        {formData.llm_provider === 'openai' ? (
                          <>
                            <option value="gpt-4o">GPT-4o (Mais inteligente)</option>
                            <option value="gpt-4o-mini">GPT-4o Mini (Mais rápido/econômico)</option>
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
                      <p className="text-[10px] text-gray-400">Escolha o modelo que melhor se adapta ao seu custo/benefício.</p>
                    </div>
                  </div>

                  <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary-600 shrink-0 shadow-sm">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">Uso da sua própria chave</h4>
                        <p className="text-xs text-gray-600 leading-relaxed mt-1">
                          Ao configurar sua própria chave, você terá custo zero de processamento na Sofia. 
                          As cobranças da OpenAI/Google virão diretamente para você, e a Sofia não descontará créditos de mensagens do seu plano.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary-100 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Salvar Configuração IA
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeSubTab === 'quick_replies' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Respostas Rápidas</h2>
                  <p className="text-sm text-gray-500 mt-1">Gerencie modelos de mensagens para agilizar seu atendimento manual.</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Criar Novo Atalho</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Título (Ex: Saudação)</label>
                    <input 
                      type="text"
                      value={newReplyData.title}
                      onChange={e => setNewReplyData({...newReplyData, title: e.target.value})}
                      placeholder="Nome curto do botão"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none text-sm transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Conteúdo da Mensagem</label>
                    <textarea 
                      rows={1}
                      value={newReplyData.content}
                      onChange={e => setNewReplyData({...newReplyData, content: e.target.value})}
                      placeholder="Texto completo que será enviado"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none text-sm transition-all resize-none"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleCreateQuickReply}
                  disabled={isCreatingReply}
                  className="mt-4 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-primary-200"
                >
                  {isCreatingReply ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  Salvar Atalho
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {quickReplies.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                    <p className="text-gray-400 text-sm">Você ainda não tem respostas rápidas criadas.</p>
                  </div>
                ) : (
                  quickReplies.map(reply => (
                    <div key={reply.id} className="bg-white border border-gray-100 rounded-xl p-6 flex items-center justify-between group hover:border-primary-100 transition-all shadow-sm">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-gray-900">{reply.title}</h4>
                        <p className="text-xs text-gray-500">{reply.content}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteQuickReply(reply.id!)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* WhatsApp Connection Modal */}
      <AnimatePresence>
        {isWhatsAppModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Conectar WhatsApp</h3>
                <button 
                  onClick={() => setIsWhatsAppModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  {[
                    "Abra o WhatsApp no celular",
                    "Toque em Mais opções ou Configurações",
                    "Toque em Aparelhos conectados",
                    "Aponte a câmera para esta tela"
                  ].map((text, i) => (
                    <div key={i} className="flex gap-4 items-start">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-600 font-medium leading-relaxed pt-1">
                        {text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col items-center justify-center">
                  <div className="w-56 h-56 border-2 border-dashed border-gray-200 rounded-3xl flex items-center justify-center bg-gray-50/50 relative group overflow-hidden">
                    {whatsappStatus?.qr ? (
                      <img 
                        src={whatsappStatus.qr.startsWith('data:') ? whatsappStatus.qr : `data:image/png;base64,${whatsappStatus.qr}`} 
                        alt="WhatsApp QR Code" 
                        className="w-full h-full object-contain p-4"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-300">
                        <Smartphone size={64} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Gerando QR...</span>
                      </div>
                    )}
                    
                    {isConnecting && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center">
                        <Loader2 size={40} className="animate-spin text-emerald-500" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 flex flex-col items-center justify-center gap-2 border-t border-gray-100">
                <div className="flex items-center gap-3 text-gray-400 text-sm font-medium">
                  {whatsappStatus?.status === 'connected' ? (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Check size={18} />
                      WhatsApp Conectado!
                    </div>
                  ) : (
                    <>
                      <Loader2 size={18} className="animate-spin text-emerald-500" />
                      Aguardando leitura do QR Code…
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Channel Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Adicionar Novo Canal</h2>
                  <p className="text-sm text-gray-500">Conecte um novo canal de comunicação para expandir seu alcance.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Canal</label>
                  <input 
                    type="text"
                    value={newChannelData.nome}
                    onChange={e => setNewChannelData({...newChannelData, nome: e.target.value})}
                    placeholder="Ex: WhatsApp Principal, Atendimento Site"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Agente Responsável</label>
                  <select 
                    value={newChannelData.agentId}
                    onChange={e => setNewChannelData({...newChannelData, agentId: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm appearance-none bg-white"
                  >
                    <option value="">Selecione um agente</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo de Canal</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setNewChannelData({...newChannelData, tipo: 'whatsapp'})}
                      className={`p-4 rounded-2xl border-2 transition-all flex items-center gap-3 text-left
                        ${newChannelData.tipo === 'whatsapp' ? 'border-primary-600 bg-primary-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${newChannelData.tipo === 'whatsapp' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <Smartphone size={20} />
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-gray-900">WhatsApp</span>
                      </div>
                    </button>

                    <div className="p-4 rounded-2xl border-2 border-gray-50 bg-gray-50/50 opacity-60 flex items-center gap-3 text-left cursor-not-allowed relative">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center">
                        <Globe size={20} />
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-gray-900">Chat no Site</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Em breve</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border-2 border-gray-50 bg-gray-50/50 opacity-60 flex items-center gap-3 text-left cursor-not-allowed relative">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center">
                        <Send size={20} />
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-gray-900">Telegram</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Em breve</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreateChannel}
                  disabled={isCreatingChannel}
                  className="px-8 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreatingChannel && <Loader2 size={18} className="animate-spin" />}
                  Criar Canal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
