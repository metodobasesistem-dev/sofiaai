import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Settings2, 
  MoreVertical,
  Bot,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Sparkles,
  User,
  Building2,
  Eye,
  Settings,
  ArrowLeft,
  Save,
  Trash2,
  Send,
  RotateCcw,
  Mic,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { listAgents, createAgent, updateAgent, toggleAgentStatus, deleteAgent, getCachedAgents, clearAgentFromCache, type Agent, type KnowledgeItem } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
/// <reference types="vite/client" />
import { User as SupabaseUser } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface AgentCardProps {
  agent: Agent;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onToggle, onEdit, onDelete }) => {
  const status = agent.status_ativo ? 'active' : 'inactive';
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col relative"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${status === 'active' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
            <Bot size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{agent.nome}</h3>
            <p className="text-sm text-gray-500">{agent.nicho || 'Sem nicho'}</p>
          </div>
        </div>

        {/* Menu de 3 pontinhos */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <MoreVertical size={20} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setMenuOpen(false); setConfirmDelete(false); }} />
              <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[180px] overflow-hidden">
                {!confirmDelete ? (
                  <>
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings2 size={15} /> Configurar
                    </button>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                    >
                      <Trash2 size={15} /> Excluir agente
                    </button>
                  </>
                ) : (
                  <div className="p-3">
                    <p className="text-xs text-gray-600 mb-3 font-medium">Confirmar exclusão de <strong>{agent.nome}</strong>?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={isDeleting}
                        onClick={async () => {
                          setIsDeleting(true);
                          await onDelete();
                          setIsDeleting(false);
                          setMenuOpen(false);
                          setConfirmDelete(false);
                        }}
                        className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                      >
                        {isDeleting ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {status === 'active' ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <CheckCircle2 size={12} /> Ativo no WhatsApp
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
            <AlertCircle size={12} /> Desativado
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4">
        <button 
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Settings2 size={16} />
          Configurar
        </button>
        
        {/* Toggle Switch */}
        <button 
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${status === 'active' ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${status === 'active' ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
    </motion.div>
  );
};

export default function Agents({ user, role }: { user: SupabaseUser | null, role: string | null }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'preview' | 'advanced' | 'knowledge'>('profile');

  // Form State
  const [formData, setFormData] = useState<Partial<Agent>>({
    nome: '',
    nicho: '',
    prompt_base: '',
    status_ativo: true,
    companyName: '',
    companyAddress: '',
    professionalName: '',
    companyDescription: '',
    companyProducts: '',
    companyFAQ: '',
    companyLinks: '',
    knowledgeBase: [],
    followUps: [{ delayMinutes: 60, type: 'static', message: '', extraPrompt: '' }],
    reminders: [{ mode: 'Tempo antes', hoursBefore: 24, message: '', sendAfterTime: false }],
    appointmentDuration: 30,
    response_delay: 15
  });

  const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const fetchAgents = async () => {
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      console.warn('[Agents] Safety timeout: 5s reached');
    }, 5000);

    try {
      // Serve cache immediately if possible
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const email = session?.user?.email;
      if (email) {
        const cached = getCachedAgents(email);
        if (cached && cached.length > 0) {
          setAgents(cached);
          setIsLoading(false); 
        }
      }

      const data = await listAgents();
      if (data && data.length > 0) {
        setAgents(data);
      }
    } catch (error: any) {
      console.error('[Agents] fetchAgents error:', error.message);
      toast.error('Instabilidade ao carregar agentes. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [user?.id]);

  const handleToggle = async (agentId: string, currentStatus: boolean) => {
    try {
      // Otimista: atualiza UI na hora
      setAgents(prev => prev.map(a => 
        a.id === agentId 
          ? { ...a, status_ativo: !currentStatus } 
          : currentStatus ? a : { ...a, status_ativo: false }
      ));
      await toggleAgentStatus(agentId, currentStatus);
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
      toast.error('Erro ao alterar status: ' + (error.message || ''));
      // Reverter em caso de erro
      fetchAgents();
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      // Banco primeiro
      await deleteAgent(agentId);
      // Banco confirmou — atualiza UI E cache (para o F5 não mostrar fantasma)
      setAgents(prev => prev.filter(a => a.id !== agentId));
      if (user?.email) clearAgentFromCache(user.email, agentId);
      toast.success('Agente excluído com sucesso!');
    } catch (error: any) {
      console.error('[handleDelete] Erro:', error);
      toast.error('Erro ao excluir: ' + (error.message || 'Tente novamente'));
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormData({
      nome: agent.nome || '',
      nicho: agent.nicho || '',
      prompt_base: agent.prompt_base || '',
      status_ativo: agent.status_ativo ?? true,
      companyName: agent.companyName || '',
      companyAddress: agent.companyAddress || '',
      professionalName: agent.professionalName || '',
      companyDescription: agent.companyDescription || '',
      companyProducts: agent.companyProducts || '',
      companyFAQ: agent.companyFAQ || '',
      companyLinks: agent.companyLinks || '',
      knowledgeBase: agent.knowledgeBase || [],
      followUps: agent.followUps?.length ? agent.followUps : [{ delayMinutes: 60, extraPrompt: '' }],
      reminders: agent.reminders?.length ? agent.reminders : [{ mode: 'Tempo antes', hoursBefore: 24, message: '', sendAfterTime: false }],
      appointmentDuration: agent.appointmentDuration || 30,
      voice_mode: agent.voice_mode || 'disabled',
      voice_id: agent.voice_id || 'alloy'
    });
    setActiveTab('profile');
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingAgent(null);
    setFormData({
      nome: '',
      nicho: '',
      prompt_base: '',
      status_ativo: true,
      companyName: '',
      companyAddress: '',
      professionalName: '',
      companyDescription: '',
      companyProducts: '',
      companyFAQ: '',
      companyLinks: '',
      knowledgeBase: [],
      followUps: [{ delayMinutes: 60, type: 'static', message: '', extraPrompt: '' }],
      reminders: [{ mode: 'Tempo antes', hoursBefore: 24, message: '', sendAfterTime: false }],
      appointmentDuration: 30,
      voice_mode: 'disabled',
      voice_id: 'alloy'
    });
    setActiveTab('profile');
    setIsModalOpen(true);
  };

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    
    if (!formData.nome) {
      toast.error('O nome do assistente é obrigatório');
      return;
    }

    try {
      console.log('[Agents] Starting save...', { isEditing: !!editingAgent, formData });
      setIsSaving(true);
      
      if (editingAgent?.id) {
        await updateAgent(editingAgent.id, formData);
        toast.success('Agente atualizado com sucesso!');
      } else {
        await createAgent({
          nome: formData.nome!,
          nicho: formData.nicho || '',
          prompt_base: formData.prompt_base || '',
          status_ativo: formData.status_ativo ?? true,
          companyName: formData.companyName,
          companyAddress: formData.companyAddress,
          professionalName: formData.professionalName,
          companyDescription: formData.companyDescription,
          companyProducts: formData.companyProducts,
          companyFAQ: formData.companyFAQ,
          companyLinks: formData.companyLinks,
          knowledgeBase: formData.knowledgeBase,
          followUps: formData.followUps,
          reminders: formData.reminders,
          appointmentDuration: formData.appointmentDuration || 30,
          voice_mode: formData.voice_mode || 'disabled',
          voice_id: formData.voice_id || 'alloy'
        });
        toast.success('Agente criado com sucesso!');
      }
      
      setIsModalOpen(false);
      // Atualização silenciosa: Não damos 'await' aqui para o modal fechar na hora
      fetchAgents().catch(err => console.error('[DEBUG] Erro silencioso ao atualizar lista:', err));
    } catch (error: any) {
      console.error('Failed to save agent:', error);
      toast.error(`Erro ao salvar: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewInput.trim() || isThinking) return;

    const userMsg = previewInput;
    const newMessages = [...previewMessages, { role: 'user', content: userMsg } as const];
    
    setPreviewInput('');
    setPreviewMessages(newMessages);
    setIsThinking(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/v2/agents/simulate-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          agentData: {
            ...formData,
            // Map camelCase to snake_case for backend if necessary, 
            // but agentService handles both or we can just send it raw.
            company_name: formData.companyName,
            company_description: formData.companyDescription,
            company_products: formData.companyProducts,
            company_faq: formData.companyFAQ,
            company_links: formData.companyLinks,
            knowledge_base: formData.knowledgeBase,
            voice_mode: formData.voice_mode,
            voice_id: formData.voice_id
          },
          messages: newMessages
        })
      });

      const result = await response.json();
      if (result.success) {
        setPreviewMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
        
        if (result.audio) {
          const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
          audio.play().catch(e => console.error('Error playing simulation audio:', e));
        }
      } else {
        toast.error('Erro na simulação: ' + result.error);
      }
    } catch (err) {
      console.error('Simulation fetch error:', err);
      toast.error('Falha ao conectar com o serviço de simulação.');
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Agentes</h1>
          <p className="text-gray-500 text-sm">Gerencie e configure seus assistentes virtuais inteligentes.</p>
        </div>
        
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
        >
          <Plus size={18} />
          Novo Agente
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 size={40} className="animate-spin mb-4 text-blue-500" />
          <p className="font-medium">Carregando seus agentes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <AgentCard 
              key={agent.id}
              agent={agent}
              onToggle={() => handleToggle(agent.id!, agent.status_ativo)}
              onEdit={() => handleEdit(agent)}
              onDelete={() => handleDelete(agent.id!)}
            />
          ))}

          {/* Empty State / Add New Placeholder */}
          <button 
            onClick={handleAddNew}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all group min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <span className="font-medium">Adicionar novo nicho</span>
          </button>
        </div>
      )}

      {/* Modal Novo/Editar Agente */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 overflow-y-auto">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
              <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Building2 size={16} />
                    <span>Agentes</span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Voltar para a listagem
                </button>
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-8 w-full flex-1">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">
                  {editingAgent ? 'Editar Agente' : 'Novo Agente'}
                </h1>
                <p className="text-gray-500">
                  {editingAgent ? 'Atualizar configurações do agente existente' : 'Configure as informações básicas e avançadas do seu novo assistente'}
                </p>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-8 border-b border-gray-200 mb-8">
                {[
                  { id: 'profile', label: 'Identidade', icon: User },
                  { id: 'company', label: 'Empresa', icon: Building2 },
                  { id: 'knowledge', label: 'Conhecimento', icon: MessageSquare },
                  { id: 'voice', label: 'Voz e Áudio', icon: Mic },
                  { id: 'preview', label: 'Teste ao vivo', icon: Eye },
                  { id: 'advanced', label: 'Automação', icon: Settings },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 py-4 text-sm font-semibold transition-all relative ${
                      activeTab === tab.id ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <tab.icon size={18} />
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div 
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 min-h-[400px]">
                {activeTab === 'profile' && (
                  <div className="space-y-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-gray-900">Informações básicas</h2>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do assistente</label>
                      <input 
                        type="text"
                        value={formData.nome}
                        onChange={e => setFormData({...formData, nome: e.target.value})}
                        placeholder="Ex: Natan"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Instruções do Agente / Comportamento</label>
                      <textarea 
                        rows={8}
                        value={formData.prompt_base}
                        onChange={e => setFormData({...formData, prompt_base: e.target.value})}
                        placeholder="Ex: Você é um assistente calmo e educado. Sua função é qualificar leads..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                      />
                      <p className="mt-2 text-[10px] text-gray-400 italic">
                        * Use este espaço para definir a personalidade e regras de atendimento.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'company' && (
                  <div className="space-y-8">
                    <div className="space-y-6 max-w-2xl">
                      <h2 className="text-lg font-bold text-gray-900">Informações básicas</h2>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome da empresa</label>
                        <input 
                          type="text"
                          value={formData.companyName}
                          onChange={e => setFormData({...formData, companyName: e.target.value})}
                          placeholder="Ex: Natan de Souza"
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Endereço da empresa</label>
                        <input 
                          type="text"
                          value={formData.companyAddress}
                          onChange={e => setFormData({...formData, companyAddress: e.target.value})}
                          placeholder="Ex: Av. Paulista, 1578 - Bela Vista, São Paulo - SP"
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Profissional <span className="text-red-500">*</span></label>
                        <input 
                          type="text"
                          value={formData.professionalName}
                          onChange={e => setFormData({...formData, professionalName: e.target.value})}
                          placeholder="Ex: Dr. João Silva"
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descrição da Empresa</label>
                        <textarea 
                          rows={4}
                          value={formData.companyDescription}
                          onChange={e => setFormData({...formData, companyDescription: e.target.value})}
                          placeholder="Descreva o que sua empresa faz..."
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Produtos / Serviços</label>
                        <textarea 
                          rows={4}
                          value={formData.companyProducts}
                          onChange={e => setFormData({...formData, companyProducts: e.target.value})}
                          placeholder="Liste seus produtos ou serviços e preços..."
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">FAQ (Perguntas Frequentes)</label>
                          <textarea 
                            rows={6}
                            value={formData.companyFAQ}
                            onChange={e => setFormData({...formData, companyFAQ: e.target.value})}
                            placeholder="Dúvidas comuns e respostas..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Links e Contatos</label>
                          <textarea 
                            rows={6}
                            value={formData.companyLinks}
                            onChange={e => setFormData({...formData, companyLinks: e.target.value})}
                            placeholder="Links, WhatsApp, Instagram..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'knowledge' && (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">Base de Inteligência</h2>
                        <p className="text-sm text-gray-500 mt-1">Dados estruturados que o assistente usará para aprender sobre seu negócio.</p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right mr-4 hidden md:block">
                          <div className="text-[10px] font-bold text-gray-400 uppercase">Capacidade de Memória</div>
                          <div className="w-32 h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                (JSON.stringify(formData.knowledgeBase).length / 20000) > 0.8 ? 'bg-amber-500' : 'bg-teal-500'
                              }`} 
                              style={{ width: `${Math.min(100, (JSON.stringify(formData.knowledgeBase).length / 20000) * 100)}%` }} 
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input 
                            type="file"
                            id="kb-file-upload"
                            className="hidden"
                            accept=".txt,.pdf"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              if (file.size > 2 * 1024 * 1024) {
                                toast.error('Arquivo muito grande. Limite de 2MB.');
                                return;
                              }

                              if (file.name.endsWith('.pdf')) {
                                toast.info('Extração de PDF em processamento... (Simulado para MVP)');
                                const newItem: KnowledgeItem = {
                                  id: Math.random().toString(36).substr(2, 9),
                                  type: 'text',
                                  title: `Documento: ${file.name}`,
                                  content: `[Conteúdo do PDF ${file.name} - Extração pendente no servidor]`,
                                  createdAt: new Date().toISOString()
                                };
                                setFormData({...formData, knowledgeBase: [newItem, ...(formData.knowledgeBase || [])]});
                              } else {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const content = event.target?.result as string;
                                  const newItem: KnowledgeItem = {
                                    id: Math.random().toString(36).substr(2, 9),
                                    type: 'text',
                                    title: file.name,
                                    content: content,
                                    createdAt: new Date().toISOString()
                                  };
                                  setFormData({...formData, knowledgeBase: [newItem, ...(formData.knowledgeBase || [])]});
                                  toast.success(`${file.name} importado com sucesso!`);
                                };
                                reader.readAsText(file);
                              }
                              e.target.value = ''; // Reset input
                            }}
                          />
                          <button 
                            onClick={() => document.getElementById('kb-file-upload')?.click()}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-50 text-gray-700 transition-all"
                          >
                            <Plus size={16} />
                            Importar
                          </button>
                          <button 
                            onClick={() => {
                              const newItem: KnowledgeItem = {
                                id: Math.random().toString(36).substr(2, 9),
                                type: 'qa',
                                question: '',
                                answer: '',
                                createdAt: new Date().toISOString()
                              };
                              setFormData({...formData, knowledgeBase: [newItem, ...(formData.knowledgeBase || [])]});
                            }}
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-50 text-gray-700 transition-all"
                          >
                            <MessageSquare size={16} />
                            Inserir P&R
                          </button>
                          <button 
                            onClick={() => {
                              const newItem: KnowledgeItem = {
                                id: Math.random().toString(36).substr(2, 9),
                                type: 'text',
                                title: '',
                                content: '',
                                createdAt: new Date().toISOString()
                              };
                              setFormData({...formData, knowledgeBase: [newItem, ...(formData.knowledgeBase || [])]});
                            }}
                            className="px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-100"
                          >
                            <Sparkles size={16} />
                            Bloco de Texto
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                      <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm shrink-0">
                        <AlertCircle size={18} />
                      </div>
                      <div className="text-xs text-amber-800 leading-relaxed">
                        <p className="font-bold">Dica para Evitar Alucinações:</p>
                        <p className="mt-0.5">Mantenha as informações curtas e diretas. Use o formato de Pergunta e Resposta para dúvidas específicas e Blocos de Texto para políticas gerais ou história da empresa.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {formData.knowledgeBase?.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
                          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-gray-300 mb-4 shadow-sm">
                            <Bot size={32} />
                          </div>
                          <p className="text-gray-500 font-medium">Nenhum conhecimento adicionado ainda.</p>
                          <p className="text-gray-400 text-xs mt-1">Comece adicionando Perguntas e Respostas ou Blocos de Texto.</p>
                        </div>
                      ) : (
                        formData.knowledgeBase?.map((item, index) => (
                          <motion.div 
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:border-teal-200 transition-all"
                          >
                            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {item.type === 'qa' ? (
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase">FAQ</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[10px] font-bold rounded uppercase">Texto Livre</span>
                                )}
                                <span className="text-gray-400 text-[10px]">{new Date(item.createdAt).toLocaleDateString()}</span>
                              </div>
                              <button 
                                onClick={() => {
                                  const newKb = [...(formData.knowledgeBase || [])];
                                  newKb.splice(index, 1);
                                  setFormData({...formData, knowledgeBase: newKb});
                                }}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            
                            <div className="p-5 space-y-4">
                              {item.type === 'qa' ? (
                                <>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pergunta</label>
                                    <input 
                                      type="text"
                                      value={item.question}
                                      onChange={e => {
                                        const newKb = [...(formData.knowledgeBase || [])];
                                        newKb[index].question = e.target.value;
                                        setFormData({...formData, knowledgeBase: newKb});
                                      }}
                                      placeholder="Ex: Qual o horário de atendimento?"
                                      className="w-full px-0 py-1 bg-transparent border-none focus:ring-0 text-sm font-semibold text-gray-900 placeholder:text-gray-300"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Resposta</label>
                                    <textarea 
                                      rows={2}
                                      value={item.answer}
                                      onChange={e => {
                                        const newKb = [...(formData.knowledgeBase || [])];
                                        newKb[index].answer = e.target.value;
                                        setFormData({...formData, knowledgeBase: newKb});
                                      }}
                                      placeholder="Ex: Atendemos de segunda a sexta, das 08h às 18h."
                                      className="w-full px-0 py-1 bg-transparent border-none focus:ring-0 text-sm text-gray-600 placeholder:text-gray-300 resize-none"
                                    />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Título do Bloco</label>
                                    <input 
                                      type="text"
                                      value={item.title}
                                      onChange={e => {
                                        const newKb = [...(formData.knowledgeBase || [])];
                                        newKb[index].title = e.target.value;
                                        setFormData({...formData, knowledgeBase: newKb});
                                      }}
                                      placeholder="Ex: Sobre a nossa história"
                                      className="w-full px-0 py-1 bg-transparent border-none focus:ring-0 text-sm font-semibold text-gray-900 placeholder:text-gray-300"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Conteúdo</label>
                                    <textarea 
                                      rows={4}
                                      value={item.content}
                                      onChange={e => {
                                        const newKb = [...(formData.knowledgeBase || [])];
                                        newKb[index].content = e.target.value;
                                        setFormData({...formData, knowledgeBase: newKb});
                                      }}
                                      placeholder="Ex: Fundada em 2010, nossa empresa foca em..."
                                      className="w-full px-0 py-1 bg-transparent border-none focus:ring-0 text-sm text-gray-600 placeholder:text-gray-300 resize-none"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'voice' && (
                  <div className="space-y-8 max-w-2xl">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-2">Respostas por Voz</h2>
                      <p className="text-sm text-gray-500 mb-6">Aumente a percepção de valor com respostas de áudio ultra-realistas via OpenAI.</p>
                      
                      <div className="space-y-6">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Modo de Operação</label>
                          <select 
                            value={formData.voice_mode}
                            onChange={e => setFormData({...formData, voice_mode: e.target.value as any})}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm bg-white"
                          >
                            <option value="disabled">Desativado (Apenas Texto)</option>
                            <option value="always">Sempre (Texto + Áudio)</option>
                            <option value="audio_only">Dinâmico (Áudio se o cliente mandar áudio)</option>
                          </select>
                        </div>

                        {formData.voice_mode !== 'disabled' && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                          >
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Escolha a Voz da IA</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {[
                                { id: 'alloy', label: 'Alloy', desc: 'Versátil, equilibrada' },
                                { id: 'echo', label: 'Echo', desc: 'Séria, masculina' },
                                { id: 'nova', label: 'Nova', desc: 'Feminina, energética' },
                                { id: 'shimmer', label: 'Shimmer', desc: 'Feminina, suave' },
                                { id: 'onyx', label: 'Onyx', desc: 'Masculina, profunda' },
                                { id: 'fable', label: 'Fable', desc: 'Britânica, narrativa' },
                              ].map(voice => (
                                <button
                                  key={voice.id}
                                  type="button"
                                  onClick={() => setFormData({...formData, voice_id: voice.id})}
                                  className={`p-4 rounded-xl border flex flex-col items-start gap-1 transition-all text-left ${
                                    formData.voice_id === voice.id 
                                      ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' 
                                      : 'border-gray-200 hover:border-teal-200'
                                  }`}
                                >
                                  <span className="font-bold text-sm text-gray-900">{voice.label}</span>
                                  <span className="text-[10px] text-gray-500">{voice.desc}</span>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'preview' && (
                  <div className="flex flex-col h-[600px]">
                    <div className="mb-6">
                      <h2 className="text-lg font-bold text-gray-900">Chegou a hora de experimentar o seu agente</h2>
                    </div>

                    <div className="flex-1 border border-gray-200 rounded-2xl overflow-hidden flex flex-col bg-[#f8f9fa] relative">
                      {/* Chat Header */}
                      <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                            {formData.nome?.[0] || 'A'}
                          </div>
                          <span className="font-bold text-gray-900">{formData.nome || 'Agente'}</span>
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase">
                            <MessageSquare size={10} /> Atendimento
                          </span>
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded uppercase">
                            <Sparkles size={10} /> Normal
                          </span>
                        </div>
                        <button 
                          onClick={() => setPreviewMessages([])}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          <RotateCcw size={14} />
                          Reiniciar conversa
                        </button>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div className="flex justify-center">
                          <div className="bg-white border border-gray-200 rounded-full px-4 py-1 flex items-center gap-2 text-[10px] text-gray-500">
                            <AlertCircle size={12} />
                            Bem-vindo ao chat de demonstração. Aqui você pode testar como será a interação...
                          </div>
                        </div>

                        {previewMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                              msg.role === 'user' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-100 text-gray-800 shadow-sm'
                            }`}>
                              {msg.content}
                            </div>
                          </div>
                        ))}

                        {isThinking && (
                          <div className="flex justify-start">
                            <div className="bg-white border border-gray-100 p-3 rounded-2xl shadow-sm flex items-center gap-2">
                              <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input */}
                      <div className="p-4 bg-white border-t border-gray-200">
                        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                          <button type="button" className="p-2 text-gray-400 hover:text-gray-600">
                            <Mic size={20} />
                          </button>
                          <input 
                            type="text"
                            value={previewInput}
                            onChange={e => setPreviewInput(e.target.value)}
                            placeholder="Digite sua mensagem ou grave um áudio..."
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-500"
                          />
                          <button 
                            type="submit"
                            className="p-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                          >
                            <Send size={18} />
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'advanced' && (
                  <div className="space-y-12">
                    {/* Agendamentos */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 text-gray-900">
                        <Calendar size={20} className="text-gray-400" />
                        <h2 className="text-lg font-bold">Configuração de Agendamento</h2>
                      </div>
                      <p className="text-sm text-gray-500">Configure as regras padrão de agendamento para este agente.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Duração de cada agendamento</label>
                          <div className="relative flex items-center">
                            <input 
                              type="number"
                              value={formData.appointmentDuration}
                              onChange={e => setFormData({...formData, appointmentDuration: parseInt(e.target.value)})}
                              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm pr-12"
                            />
                            <span className="absolute right-4 text-xs font-bold text-gray-400">min</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Atraso de Resposta (Agrupamento)</label>
                          <div className="relative flex items-center">
                            <input 
                              type="number"
                              value={formData.response_delay || 15}
                              onChange={e => setFormData({...formData, response_delay: parseInt(e.target.value)})}
                              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm pr-12"
                            />
                            <span className="absolute right-4 text-xs font-bold text-gray-400">seg</span>
                          </div>
                          <p className="mt-2 text-[10px] text-gray-400">Tempo que a IA aguarda o cliente parar de digitar para responder de uma vez.</p>
                        </div>
                      </div>
                    </div>

                    {/* Follow-up */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 text-gray-900">
                        <RotateCcw size={20} className="text-gray-400" />
                        <h2 className="text-lg font-bold">Configuração de Follow-up</h2>
                      </div>
                      <p className="text-sm text-gray-500">Configure mensagens automáticas para reengajar contatos que pararam de responder.</p>
                      
                      <div className="space-y-4">
                        {formData.followUps?.map((followUp, index) => (
                          <div key={index} className="p-8 border border-gray-100 rounded-2xl bg-gray-50/30 space-y-6 relative group">
                            <div className="absolute top-6 right-6 flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white px-2 py-1 rounded-lg border border-gray-100">Nível {index + 1}</span>
                              <button 
                                onClick={() => {
                                  const newFollowUps = [...(formData.followUps || [])];
                                  newFollowUps.splice(index, 1);
                                  setFormData({...formData, followUps: newFollowUps});
                                }}
                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tempo de espera</label>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number"
                                    value={followUp.delayMinutes >= 1440 ? followUp.delayMinutes / 1440 : followUp.delayMinutes >= 60 ? followUp.delayMinutes / 60 : followUp.delayMinutes}
                                    onChange={e => {
                                      const val = parseInt(e.target.value) || 0;
                                      const newFollowUps = [...(formData.followUps || [])];
                                      // Default to minutes for now, the unit selector will handle the multiplier
                                      newFollowUps[index].delayMinutes = val; 
                                      setFormData({...formData, followUps: newFollowUps});
                                    }}
                                    className="w-24 px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm"
                                  />
                                  <select 
                                    value={followUp.delayMinutes % 1440 === 0 && followUp.delayMinutes > 0 ? 'days' : followUp.delayMinutes % 60 === 0 && followUp.delayMinutes > 0 ? 'hours' : 'minutes'}
                                    onChange={e => {
                                      const unit = e.target.value;
                                      const newFollowUps = [...(formData.followUps || [])];
                                      const currentVal = followUp.delayMinutes >= 1440 ? followUp.delayMinutes / 1440 : followUp.delayMinutes >= 60 ? followUp.delayMinutes / 60 : followUp.delayMinutes;
                                      
                                      if (unit === 'days') newFollowUps[index].delayMinutes = currentVal * 1440;
                                      else if (unit === 'hours') newFollowUps[index].delayMinutes = currentVal * 60;
                                      else newFollowUps[index].delayMinutes = currentVal;
                                      
                                      setFormData({...formData, followUps: newFollowUps});
                                    }}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm bg-white"
                                  >
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                    <option value="days">Dias</option>
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo de Resposta</label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-gray-200 rounded-xl">
                                  <button
                                    onClick={() => {
                                      const newFollowUps = [...(formData.followUps || [])];
                                      newFollowUps[index].type = 'static';
                                      setFormData({...formData, followUps: newFollowUps});
                                    }}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${followUp.type === 'static' ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                  >
                                    Texto Fixo
                                  </button>
                                  <button
                                    onClick={() => {
                                      const newFollowUps = [...(formData.followUps || [])];
                                      newFollowUps[index].type = 'ai';
                                      setFormData({...formData, followUps: newFollowUps});
                                    }}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${followUp.type === 'ai' ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                                  >
                                    Gerado com IA
                                  </button>
                                </div>
                              </div>
                            </div>

                            {followUp.type === 'static' ? (
                              <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Mensagem do Follow-up</label>
                                <textarea 
                                  rows={3}
                                  value={followUp.message}
                                  onChange={e => {
                                    const newFollowUps = [...(formData.followUps || [])];
                                    newFollowUps[index].message = e.target.value;
                                    setFormData({...formData, followUps: newFollowUps});
                                  }}
                                  placeholder="Ex: Oi, notei que não concluímos seu agendamento. Ainda tem interesse?"
                                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                                />
                              </div>
                            ) : (
                              <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                                <div className="flex items-center justify-between mb-2">
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Instrução para a IA (Prompt)</label>
                                  <span className="flex items-center gap-1 text-[9px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded uppercase tracking-tighter">
                                    <Sparkles size={10} /> IA decidirá o que dizer
                                  </span>
                                </div>
                                <textarea 
                                  rows={3}
                                  value={followUp.extraPrompt}
                                  onChange={e => {
                                    const newFollowUps = [...(formData.followUps || [])];
                                    newFollowUps[index].extraPrompt = e.target.value;
                                    setFormData({...formData, followUps: newFollowUps});
                                  }}
                                  placeholder="Ex: Seja descontraído e ofereça um cupom de 5% caso ele responda agora..."
                                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        <button 
                          onClick={() => setFormData({...formData, followUps: [...(formData.followUps || []), { delayMinutes: 60, type: 'static', message: '', extraPrompt: '' }]})}
                          className="flex items-center gap-2 px-6 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-500 hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50/30 transition-all w-full justify-center"
                        >
                          <Plus size={18} />
                          Adicionar Próximo Nível de Follow-up
                        </button>
                      </div>
                    </div>

                    {/* Reminders */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 text-gray-900">
                        <AlertCircle size={20} className="text-gray-400" />
                        <h2 className="text-lg font-bold">Configuração de Lembretes</h2>
                      </div>
                      <p className="text-sm text-gray-500">Configure lembretes automáticos para agendamentos. O contato receberá uma mensagem antes do horário marcado.</p>

                      <div className="space-y-4">
                        {formData.reminders?.map((reminder, index) => (
                          <div key={index} className="p-8 border border-gray-100 rounded-2xl bg-gray-50/30 space-y-6 relative group">
                            <button 
                              onClick={() => {
                                const newReminders = [...(formData.reminders || [])];
                                newReminders.splice(index, 1);
                                setFormData({...formData, reminders: newReminders});
                              }}
                              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={18} />
                            </button>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Modo do lembrete</label>
                                <select 
                                  value={reminder.mode}
                                  onChange={e => {
                                    const newReminders = [...(formData.reminders || [])];
                                    newReminders[index].mode = e.target.value;
                                    setFormData({...formData, reminders: newReminders});
                                  }}
                                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm bg-white"
                                >
                                  <option>Tempo antes</option>
                                  <option>No horário</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Horas antes do agendamento</label>
                                <input 
                                  type="number"
                                  value={reminder.hoursBefore}
                                  onChange={e => {
                                    const newReminders = [...(formData.reminders || [])];
                                    newReminders[index].hoursBefore = parseInt(e.target.value);
                                    setFormData({...formData, reminders: newReminders});
                                  }}
                                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Mensagem do lembrete</label>
                              <textarea 
                                rows={4}
                                value={reminder.message}
                                onChange={e => {
                                  const newReminders = [...(formData.reminders || [])];
                                  newReminders[index].message = e.target.value;
                                  setFormData({...formData, reminders: newReminders});
                                }}
                                placeholder="Olá! Você tem um agendamento marcado para..."
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-sm resize-none"
                              />
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Inserir variável:</span>
                                {[
                                  { label: 'Data', value: '{appointment_date}' },
                                  { label: 'Horário', value: '{appointment_time}' },
                                  { label: 'Local', value: '{appointment_location}' },
                                  { label: 'Cliente', value: '{client_name}' },
                                  { label: 'Primeiro nome', value: '{client_first_name}' },
                                  { label: 'Profissional', value: '{professional_name}' }
                                ].map(tag => (
                                  <button 
                                    key={tag.label} 
                                    type="button"
                                    onClick={() => {
                                      const newReminders = [...(formData.reminders || [])];
                                      const currentMsg = newReminders[index].message || '';
                                      newReminders[index].message = currentMsg + tag.value;
                                      setFormData({...formData, reminders: newReminders});
                                    }}
                                    className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded hover:bg-green-200 transition-colors"
                                  >
                                    {tag.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  const newReminders = [...(formData.reminders || [])];
                                  newReminders[index].sendAfterTime = !newReminders[index].sendAfterTime;
                                  setFormData({...formData, reminders: newReminders});
                                }}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${reminder.sendAfterTime ? 'bg-teal-600' : 'bg-gray-200'}`}
                              >
                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${reminder.sendAfterTime ? 'translate-x-5' : 'translate-x-1'}`} />
                              </button>
                              <span className="text-xs text-gray-500">Enviar lembrete mesmo após o horário</span>
                            </div>
                          </div>
                        ))}
                        <button 
                          onClick={() => setFormData({...formData, reminders: [...(formData.reminders || []), { mode: 'Tempo antes', hoursBefore: 24, message: '', sendAfterTime: false }]})}
                          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Plus size={16} />
                          Adicionar lembrete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="mt-8 pt-8 border-t border-gray-200 flex items-center justify-between">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-8 py-3 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-200 flex items-center gap-2 disabled:opacity-70"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {editingAgent ? 'Atualizar agente' : 'Criar agente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
