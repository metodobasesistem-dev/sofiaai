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
  Calendar,
  Volume2,
  Circle,
  Play,
  Square,
  Pause,
  Upload,
  Check,
  Smartphone,
  Lock,
  Zap,
  FileText,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Skeleton, CardSkeleton } from './common/SkeletonLoader';
import { listAgents, createAgent, updateAgent, toggleAgentStatus, deleteAgent, getCachedAgents, clearAgentFromCache, listAgentKnowledge, createAgentKnowledge, updateAgentKnowledge, deleteAgentKnowledge, transcribeAudio, saveAgentSecret, getAgentSecret, type Agent, type KnowledgeItem, type AgentKnowledge } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
/// <reference types="vite/client" />
import { User as SupabaseUser } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useFeature } from '../contexts/FeatureFlagContext';

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
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${status === 'active' ? 'bg-primary-50 text-primary-600' : 'bg-gray-50 text-gray-400'}`}>
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
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${status === 'active' ? 'bg-primary-600' : 'bg-gray-200'}`}
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
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'preview' | 'automation' | 'advanced' | 'knowledge' | 'voice'>('profile');

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
    response_delay: 15,
    training_mode: 'text',
    whatsapp_provider: 'evolution'
  });

  const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Audio Training State
  const [audioKnowledge, setAudioKnowledge] = useState<AgentKnowledge[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscriptionReview, setShowTranscriptionReview] = useState(false);
  const [tempTranscription, setTempTranscription] = useState('');

  // AI Follow-up Training State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1); // -1 means not in follow-up mode
  const [followUpAnswers, setFollowUpAnswers] = useState<{ q: string, r: string }[]>([]);
  const [followUpTextResponse, setFollowUpTextResponse] = useState('');
  const [recordingTarget, setRecordingTarget] = useState<'initial' | 'followup'>('initial');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [highlightedKnowledgeId, setHighlightedKnowledgeId] = useState<string | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<AgentKnowledge | null>(null);
  const [isKnowledgeEditModalOpen, setIsKnowledgeEditModalOpen] = useState(false);
  const [isKbEditModalOpen, setIsKbEditModalOpen] = useState(false);
  const [knowledgeEditContent, setKnowledgeEditContent] = useState('');
  const [kbEditItem, setKbEditItem] = useState<KnowledgeItem | null>(null);
  const [kbEditQuestion, setKbEditQuestion] = useState('');
  const [kbEditAnswer, setKbEditAnswer] = useState('');
  const [kbEditTitle, setKbEditTitle] = useState('');
  const [kbEditContent, setKbEditContent] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  // Feature Flags
  const hasFollowUpEnabled = useFeature('ai_followup_questions');

  const TypingIndicator = () => (
    <div className="flex gap-1.5 p-3 px-4 bg-white border border-slate-200 rounded-2xl w-fit shadow-sm">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          className="w-2 h-2 bg-primary-500 rounded-full"
        />
      ))}
    </div>
  );

  const handleUpdateKnowledge = async () => {
    if (!editingAgent?.id || !selectedKnowledge?.id) return;
    
    setIsSavingEdit(true);
    try {
      await updateAgentKnowledge(editingAgent.id, selectedKnowledge.id, { content: knowledgeEditContent });
      setAudioKnowledge(prev => prev.map(k => k.id === selectedKnowledge.id ? { ...k, content: knowledgeEditContent } : k));
      toast.success('Conhecimento atualizado!');
      setIsKnowledgeEditModalOpen(false);
    } catch (err) {
      toast.error('Erro ao atualizar conhecimento.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleUpdateKbItem = () => {
    if (!kbEditItem) return;

    const newKb = [...(formData.knowledgeBase || [])];
    const index = newKb.findIndex(item => item.id === kbEditItem.id);
    
    if (index === -1) return;

    if (kbEditItem.type === 'qa') {
      newKb[index] = {
        ...newKb[index],
        question: kbEditQuestion,
        answer: kbEditAnswer
      };
    } else {
      newKb[index] = {
        ...newKb[index],
        title: kbEditTitle,
        content: kbEditContent
      };
    }

    setFormData({ ...formData, knowledgeBase: newKb });
    setIsKbEditModalOpen(false);
    toast.success('Item atualizado localmente. Salve o agente para persistir.');
  };

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

  useEffect(() => {
    if (editingAgent?.id && activeTab === 'knowledge') {
      fetchAudioKnowledge();
    }
  }, [editingAgent?.id, activeTab]);

  const fetchAudioKnowledge = async () => {
    if (!editingAgent?.id) return;
    try {
      const data = await listAgentKnowledge(editingAgent.id);
      setAudioKnowledge(data);
    } catch (err) {
      console.error('Error fetching audio knowledge:', err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        handleAudioUpload(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);

      const interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      (recorder as any)._interval = interval;
    } catch (err) {
      toast.error('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      clearInterval((mediaRecorder as any)._interval);
      setIsRecording(false);
    }
  };

  const handleAudioUpload = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(blob);
      if (text) {
        if (recordingTarget === 'followup') {
          handleFollowUpAnswer(text);
        } else {
          setTempTranscription(text);
          setShowTranscriptionReview(true);
        }
      } else {
        toast.error('Erro na transcrição do áudio.');
      }
    } catch (err) {
      toast.error('Erro na transcrição do áudio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const saveTranscription = async () => {
    if (!editingAgent?.id || !tempTranscription.trim()) return;
    
    try {
      if (!hasFollowUpEnabled) {
        setShowTranscriptionReview(false);
        await finalizeEnrichedKnowledge(tempTranscription, []);
        return;
      }

      setIsAnalyzing(true);
      setShowTranscriptionReview(false);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/v2/agents/analyze-transcription', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ transcription: tempTranscription })
      });
      
      const result = await res.json();
      setIsAnalyzing(false);

      if (result.success && result.data && result.data.length > 0) {
        setFollowUpQuestions(result.data);
        setIsAiThinking(true);
        setTimeout(() => {
          setCurrentQuestionIndex(0);
          setIsAiThinking(false);
        }, 1500);
        setFollowUpAnswers([]);
      } else {
        // Sem perguntas de follow-up, salva direto
        await finalizeEnrichedKnowledge(tempTranscription, []);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setIsAnalyzing(false);
      // Fallback: salva a transcrição original se a análise falhar
      await finalizeEnrichedKnowledge(tempTranscription, []);
    }
  };

  const handleFollowUpAnswer = async (answer: string) => {
    if (currentQuestionIndex < 0 || !answer.trim()) return;

    const currentQuestion = followUpQuestions[currentQuestionIndex];
    const newAnswers = [...followUpAnswers, { q: currentQuestion, r: answer }];
    setFollowUpAnswers(newAnswers);
    setFollowUpTextResponse('');

    if (currentQuestionIndex < followUpQuestions.length - 1) {
      setIsAiThinking(true);
      setTimeout(() => {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setIsAiThinking(false);
      }, 1200);
    } else {
      // Fim do follow-up
      await finalizeEnrichedKnowledge(tempTranscription, newAnswers);
    }
  };

  const finalizeEnrichedKnowledge = async (original: string, followUps: { q: string, r: string }[]) => {
    if (!editingAgent?.id) return;
    
    try {
      setIsSaving(true);
      
      let finalContent = original;
      if (followUps.length > 0) {
        finalContent += "\n\n### DETALHES ADICIONAIS (REF REFINAMENTO IA)\n";
        followUps.forEach(item => {
          finalContent += `\nPergunta: ${item.q}\nResposta: ${item.r}\n`;
        });
      }

      const newItem = await createAgentKnowledge(editingAgent.id, {
        type: 'audio',
        title: `Conhecimento Estruturado - ${new Date().toLocaleDateString('pt-BR')}`,
        content: finalContent,
        is_active: true
      });

      setAudioKnowledge([newItem, ...audioKnowledge]);
      setHighlightedKnowledgeId(newItem.id);
      setCurrentQuestionIndex(-1);
      setFollowUpQuestions([]);
      setFollowUpAnswers([]);
      setTempTranscription('');
      
      // Mostrar overlay de sucesso e limpar destaque depois
      setShowSuccessOverlay(true);
      setTimeout(() => {
        setShowSuccessOverlay(false);
      }, 2500);

      setTimeout(() => {
        setHighlightedKnowledgeId(null);
      }, 5000);

      toast.success('Treinamento concluído e consolidado!');
    } catch (err) {
      toast.error('Erro ao finalizar treinamento.');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-scroll para o chat de follow-up
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [currentQuestionIndex, followUpAnswers]);

  const toggleKnowledgeActive = async (item: AgentKnowledge) => {
    if (!editingAgent?.id) return;
    try {
      await updateAgentKnowledge(editingAgent.id, item.id, { is_active: !item.is_active });
      setAudioKnowledge(prev => prev.map(k => k.id === item.id ? { ...k, is_active: !k.is_active } : k));
    } catch (err) {
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleDeleteKnowledge = async (knowledgeId: string) => {
    if (!editingAgent?.id) return;
    try {
      await deleteAgentKnowledge(editingAgent.id, knowledgeId);
      setAudioKnowledge(prev => prev.filter(k => k.id !== knowledgeId));
      toast.success('Bloco excluído.');
    } catch (err) {
      toast.error('Erro ao excluir bloco.');
    }
  };

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
      response_delay: agent.response_delay || 15,
      voice_mode: agent.voice_mode || 'disabled',
      voice_id: agent.voice_id || 'alloy',
      training_mode: agent.training_mode || 'text',
      whatsapp_provider: agent.whatsapp_provider || 'evolution',
      whatsapp_provider_config: agent.whatsapp_provider_config || {}
    });

    // Buscar segredo se for Meta
    if (agent.id) {
      getAgentSecret(agent.id, 'meta_access_token').then(token => {
        setMetaAccessToken(token);
      }).catch(() => setMetaAccessToken(''));
    }

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
      voice_id: 'alloy',
      training_mode: 'text',
      whatsapp_provider: 'evolution',
      whatsapp_provider_config: {}
    });
    setMetaAccessToken('');
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
        
        // Salva segredos se houver
        if (formData.whatsapp_provider === 'meta_official' && metaAccessToken) {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          const currentUser = currentSession?.user;
          if (currentUser) {
            await saveAgentSecret(editingAgent.id, currentUser.id, 'meta_access_token', metaAccessToken);
          }
        }
        
        toast.success('Agente atualizado com sucesso!');
      } else {
        const newAgent = await createAgent({
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
          voice_id: formData.voice_id || 'alloy',
          training_mode: formData.training_mode || 'text',
          whatsapp_provider: formData.whatsapp_provider || 'evolution',
          whatsapp_provider_config: formData.whatsapp_provider_config || {}
        });

        // Salva segredos para novo agente
        if (newAgent?.id && formData.whatsapp_provider === 'meta_official' && metaAccessToken) {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          const currentUser = currentSession?.user;
          if (currentUser) {
            await saveAgentSecret(newAgent.id, currentUser.id, 'meta_access_token', metaAccessToken);
          }
        }

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
            voice_id: formData.voice_id,
            training_mode: formData.training_mode
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
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors shadow-sm shadow-primary-200"
        >
          <Plus size={18} />
          Novo Agente
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
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
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50/50 transition-all group min-h-[220px]"
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
              <div className="flex items-center gap-4 md:gap-8 border-b border-gray-200 mb-8 overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
                {[
                  { id: 'profile', label: 'Identidade', icon: User },
                  { id: 'company', label: 'Empresa', icon: Building2 },
                  { id: 'knowledge', label: 'Conhecimento', icon: MessageSquare },
                  { id: 'voice', label: 'Voz e Áudio', icon: Mic },
                  { id: 'preview', label: 'Teste ao vivo', icon: Eye },
                  { id: 'automation', label: 'Automação', icon: Settings },
                  { id: 'advanced', label: 'Avançado', icon: Settings }
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



                {/* --- NEW IMMERSIVE AUDIO TRAINING UI --- */}
                <AnimatePresence>
                  {isRecording && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-between py-20 px-6"
                    >
                      {/* Top Bar: Timer */}
                      <motion.div 
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <span className="text-teal-500 text-xs font-black uppercase tracking-[0.3em]">Gravando Conhecimento</span>
                        <span className="text-5xl font-mono font-black text-white tabular-nums">
                          {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                          {(recordingTime % 60).toString().padStart(2, '0')}
                        </span>
                      </motion.div>

                      {/* Center: Pulse Microphone */}
                      <div className="relative">
                        {/* Multiple Pulse Circles */}
                        {[1, 2, 3].map((i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 1, opacity: 0.5 }}
                            animate={{ scale: 2.5, opacity: 0 }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
                            className="absolute inset-0 bg-teal-500/20 rounded-full"
                          />
                        ))}
                        
                        <motion.div 
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="relative w-32 h-32 bg-teal-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(20,184,166,0.3)] z-10"
                        >
                          <Mic size={48} className="text-white" />
                        </motion.div>

                        {/* Waveform Visualization (Simulated bars) */}
                        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1 h-12">
                          {Array.from({ length: 16 }).map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ 
                                height: [8, Math.random() * 40 + 10, 8],
                              }}
                              transition={{ 
                                duration: 0.4, 
                                repeat: Infinity, 
                                delay: i * 0.05 
                              }}
                              className="w-1.5 bg-teal-500/50 rounded-full"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Bottom: Stop Button */}
                      <motion.button
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={stopRecording}
                        className="w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-2xl shadow-red-500/20 group transition-colors"
                      >
                        <Square size={24} className="text-white fill-current" />
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* --- BOTTOM SHEET FOR REVIEW --- */}
                <AnimatePresence>
                  {showTranscriptionReview && (
                    <div className="fixed inset-0 z-[110] flex items-end justify-center">
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowTranscriptionReview(false)}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                      />
                      
                      <motion.div 
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="relative w-full max-w-lg bg-white rounded-t-[32px] p-8 shadow-2xl z-[120] flex flex-col gap-6"
                      >
                        {/* Handle */}
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full self-center mb-2" />
                        
                        <div>
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Revisar Transcrição</h3>
                          <p className="text-slate-500 text-sm mt-1">O Whisper capturou o áudio abaixo. Edite se necessário.</p>
                        </div>

                        <div className="relative">
                          <textarea 
                            value={tempTranscription}
                            onChange={(e) => setTempTranscription(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 text-[15px] text-slate-800 outline-none focus:border-teal-500/30 transition-all min-h-[200px] leading-relaxed resize-none"
                            placeholder="Sua fala aparecerá aqui..."
                          />
                        </div>

                        <div className="flex flex-col gap-3 mt-2">
                          <button 
                            onClick={saveTranscription}
                            disabled={!tempTranscription.trim()}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                          >
                            <Check size={20} />
                            Confirmar e Salvar no Agente
                          </button>
                          
                          <button 
                            onClick={() => setShowTranscriptionReview(false)}
                            className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
                          >
                            Descartar
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {/* --- PROCESSING OVERLAY --- */}
                <AnimatePresence>
                  {isTranscribing && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[130] bg-teal-600/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-white text-center"
                    >
                      <div className="w-24 h-24 relative mb-6">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="w-full h-full border-4 border-white/20 border-t-white rounded-full"
                        />
                        <Bot size={40} className="absolute inset-0 m-auto animate-pulse" />
                      </div>
                      <h3 className="text-3xl font-black mb-2">Transcrevendo Áudio</h3>
                      <p className="text-teal-50 opacity-80 max-w-xs">Aguarde um momento enquanto a IA processa o seu conhecimento...</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* --- ANALYZING OVERLAY (Fase 2) --- */}
                <AnimatePresence>
                  {isAnalyzing && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[140] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-white text-center"
                    >
                      <div className="relative mb-8">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="w-32 h-32 bg-primary-500/20 rounded-full flex items-center justify-center border border-primary-500/30"
                        >
                          <Sparkles size={48} className="text-primary-400" />
                        </motion.div>
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="absolute -inset-4 border-t-2 border-primary-500 rounded-full"
                        />
                      </div>
                      <h3 className="text-3xl font-black mb-4">Analisando seu negócio...</h3>
                      <p className="text-slate-400 max-w-xs mx-auto text-lg leading-relaxed">
                        A IA está identificando as informações mais importantes para o seu agente atender melhor seus clientes.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* --- FOLLOW-UP CONVERSATIONAL UI (Fase 2) --- */}
                <AnimatePresence>
                  {currentQuestionIndex >= 0 && (
                    <div className="fixed inset-0 z-[150] flex flex-col bg-slate-50 overflow-hidden">
                      {/* Header */}
                      <div className="bg-white border-b border-slate-200 p-6 flex items-center justify-between shrink-0">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary-600 rounded-2xl flex items-center justify-center text-white">
                               <Bot size={20} />
                            </div>
                            <div>
                               <h3 className="font-black text-slate-900 leading-tight">Refinamento IA</h3>
                               <p className="text-[10px] font-bold text-primary-600 uppercase tracking-widest">Aprimorando Agente</p>
                            </div>
                         </div>
                         <div className="text-[11px] font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
                            Pergunta {currentQuestionIndex + 1} de {followUpQuestions.length}
                         </div>
                      </div>

                      {/* Chat Messages */}
                      <div 
                        ref={chatScrollRef}
                        className="flex-1 overflow-y-auto p-6 space-y-6 pb-20"
                      >
                         {/* Original Context */}
                         <div className="flex justify-center mb-8">
                            <div className="bg-slate-200/50 rounded-2xl px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                               Início do treinamento via áudio
                            </div>
                         </div>

                         {/* Answers History */}
                         {followUpAnswers.map((item, idx) => (
                           <React.Fragment key={idx}>
                              <div className="flex justify-start">
                                 <div className="max-w-[85%] bg-white border border-slate-200 rounded-[24px] rounded-tl-none p-4 shadow-sm text-[15px] text-slate-800 leading-relaxed">
                                    {item.q}
                                 </div>
                              </div>
                              <div className="flex justify-end">
                                 <div className="max-w-[85%] bg-primary-600 text-white rounded-[24px] rounded-tr-none p-4 shadow-md text-[15px] leading-relaxed">
                                    {item.r}
                                 </div>
                              </div>
                           </React.Fragment>
                         ))}

                         {/* Current Question or Typing */}
                         {isAiThinking ? (
                           <motion.div 
                             initial={{ opacity: 0, x: -10 }}
                             animate={{ opacity: 1, x: 0 }}
                             className="flex justify-start"
                           >
                              <TypingIndicator />
                           </motion.div>
                         ) : (
                           <motion.div 
                             initial={{ opacity: 0, y: 10 }}
                             animate={{ opacity: 1, y: 0 }}
                             className="flex justify-start"
                           >
                              <div className="max-w-[85%] bg-white border border-slate-200 rounded-[24px] rounded-tl-none p-5 shadow-sm text-[16px] font-bold text-slate-900 leading-relaxed relative">
                                 {followUpQuestions[currentQuestionIndex]}
                                 <div className="absolute -left-1.5 top-0 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-[-45deg]" />
                              </div>
                           </motion.div>
                         )}
                         
                         {isTranscribing && recordingTarget === 'followup' && (
                           <div className="flex justify-end items-center gap-2 text-primary-600">
                              <span className="text-xs font-black uppercase tracking-widest">Processando sua voz...</span>
                              <Loader2 size={16} className="animate-spin" />
                           </div>
                         )}
                      </div>

                      {/* Controls Area (Mobile Safe) */}
                      <div className="bg-white border-t border-slate-200 p-6 pb-[env(safe-area-inset-bottom,24px)] shrink-0 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
                         <div className="max-w-md mx-auto space-y-6">
                            
                            {/* Central Mic Button */}
                            <div className="flex flex-col items-center gap-2">
                               <motion.button 
                                 whileTap={{ scale: 0.9 }}
                                 onClick={() => {
                                   setRecordingTarget('followup');
                                   startRecording();
                                 }}
                                 className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all ${
                                   isRecording && recordingTarget === 'followup'
                                   ? 'bg-red-500 ring-4 ring-red-100'
                                   : 'bg-primary-600 hover:bg-primary-700 shadow-primary-500/20'
                                 }`}
                               >
                                 {isRecording && recordingTarget === 'followup' ? (
                                   <Square size={32} className="text-white" />
                                 ) : (
                                   <Mic size={32} className="text-white" />
                                 )}
                               </motion.button>
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                 {isRecording && recordingTarget === 'followup' ? 'Gravando resposta...' : 'Clique para responder falando'}
                               </p>
                            </div>

                            {/* Text Input Alternative */}
                            <div className="flex gap-2">
                               <input 
                                 type="text"
                                 value={followUpTextResponse}
                                 onChange={(e) => setFollowUpTextResponse(e.target.value)}
                                 onKeyPress={(e) => e.key === 'Enter' && handleFollowUpAnswer(followUpTextResponse)}
                                 placeholder="Ou digite sua resposta..."
                                 className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm outline-none focus:border-primary-500 transition-all"
                               />
                               <button 
                                 onClick={() => handleFollowUpAnswer(followUpTextResponse)}
                                 disabled={!followUpTextResponse.trim() || isTranscribing}
                                 className="w-14 h-14 bg-primary-600 text-white rounded-2xl flex items-center justify-center hover:bg-primary-700 transition-all disabled:opacity-50"
                               >
                                 <Send size={20} />
                               </button>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}
                </AnimatePresence>

                {/* --- SUCCESS CELEBRATION OVERLAY (Fase 3) --- */}
                <AnimatePresence>
                  {showSuccessOverlay && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center p-8 text-center"
                    >
                      <motion.div 
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", damping: 12, stiffness: 200 }}
                        className="w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-8 shadow-2xl shadow-emerald-500/40"
                      >
                        <Check size={64} strokeWidth={4} />
                      </motion.div>
                      
                      <motion.h3 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-3xl font-black text-slate-900 mb-2"
                      >
                        Agente treinado com sucesso!
                      </motion.h3>
                      
                      <motion.p 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-slate-500 font-bold"
                      >
                        Seu agente já está usando esse conhecimento.
                      </motion.p>

                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 2.5, ease: "linear" }}
                        className="absolute bottom-0 left-0 h-1.5 bg-emerald-500"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* --- EDIT KNOWLEDGE MODAL --- */}
                <AnimatePresence>
                  {isKnowledgeEditModalOpen && (
                    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsKnowledgeEditModalOpen(false)}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                      />
                      <motion.div 
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="bg-white w-full max-w-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 relative z-10 shadow-2xl overflow-hidden"
                      >
                         <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
                                  <Settings2 size={24} />
                               </div>
                               <div>
                                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Editar Conhecimento</h3>
                                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Ajuste manual da transcrição</p>
                               </div>
                            </div>
                            <button 
                              onClick={() => setIsKnowledgeEditModalOpen(false)}
                              className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all"
                            >
                               <X size={20} />
                            </button>
                         </div>

                         <div className="space-y-6">
                            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                               <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Conteúdo do Bloco</label>
                               <textarea 
                                 value={knowledgeEditContent}
                                 onChange={(e) => setKnowledgeEditContent(e.target.value)}
                                 className="w-full h-48 bg-transparent text-slate-700 font-medium leading-relaxed outline-none resize-none custom-scrollbar"
                                 placeholder="Edite o conhecimento aqui..."
                               />
                            </div>

                            <div className="flex gap-4">
                               <button 
                                 onClick={() => setIsKnowledgeEditModalOpen(false)}
                                 className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                               >
                                 Cancelar
                               </button>
                               <button 
                                 onClick={handleUpdateKnowledge}
                                 disabled={isSavingEdit || !knowledgeEditContent.trim()}
                                 className="flex-[2] py-4 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 shadow-lg shadow-primary-100 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                               >
                                 {isSavingEdit ? (
                                   <Loader2 size={20} className="animate-spin" />
                                 ) : (
                                   <>
                                     <Save size={20} />
                                     Salvar Alterações
                                   </>
                                 )}
                               </button>
                            </div>
                         </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
                
                {/* --- EDIT KB ITEM MODAL (FAQ/TEXT) --- */}
                <AnimatePresence>
                  {isKbEditModalOpen && (
                    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsKbEditModalOpen(false)}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                      />
                      <motion.div 
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="bg-white w-full max-w-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 relative z-10 shadow-2xl overflow-hidden"
                      >
                         <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                                  <Sparkles size={24} />
                               </div>
                               <div>
                                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                                    {kbEditItem?.type === 'qa' ? 'Editar Pergunta e Resposta' : 'Editar Bloco de Texto'}
                                  </h3>
                                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Base de Inteligência</p>
                               </div>
                            </div>
                            <button 
                              onClick={() => setIsKbEditModalOpen(false)}
                              className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all"
                            >
                               <X size={20} />
                            </button>
                         </div>

                         <div className="space-y-6">
                            {kbEditItem?.type === 'qa' ? (
                              <>
                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Pergunta</label>
                                   <input 
                                     type="text"
                                     value={kbEditQuestion}
                                     onChange={(e) => setKbEditQuestion(e.target.value)}
                                     className="w-full bg-transparent text-slate-900 font-bold outline-none"
                                     placeholder="Digite a pergunta..."
                                   />
                                </div>
                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Resposta</label>
                                   <textarea 
                                     value={kbEditAnswer}
                                     onChange={(e) => setKbEditAnswer(e.target.value)}
                                     className="w-full h-32 bg-transparent text-slate-700 font-medium leading-relaxed outline-none resize-none custom-scrollbar"
                                     placeholder="Digite a resposta..."
                                   />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Título do Bloco</label>
                                   <input 
                                     type="text"
                                     value={kbEditTitle}
                                     onChange={(e) => setKbEditTitle(e.target.value)}
                                     className="w-full bg-transparent text-slate-900 font-bold outline-none"
                                     placeholder="Ex: Sobre a Empresa"
                                   />
                                </div>
                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Conteúdo</label>
                                   <textarea 
                                     value={kbEditContent}
                                     onChange={(e) => setKbEditContent(e.target.value)}
                                     className="w-full h-48 bg-transparent text-slate-700 font-medium leading-relaxed outline-none resize-none custom-scrollbar"
                                     placeholder="Edite o conteúdo aqui..."
                                   />
                                </div>
                              </>
                            )}

                            <div className="flex gap-4">
                               <button 
                                 onClick={() => setIsKbEditModalOpen(false)}
                                 className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                               >
                                 Cancelar
                               </button>
                               <button 
                                 onClick={handleUpdateKbItem}
                                 className="flex-[2] py-4 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                               >
                                 <Check size={20} />
                                 Confirmar Alteração
                               </button>
                            </div>
                         </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {activeTab === 'knowledge' && (
                   <div className="space-y-8">
                     {/* Training Mode Selector */}
                     <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
                        <div className="flex flex-col gap-2 mb-8 text-center">
                           <h3 className="text-xl font-black text-slate-900 tracking-tight">Modo de Treinamento</h3>
                           <p className="text-slate-500 text-sm">Escolha como seu agente deve aprender sobre o seu negócio.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <button 
                             onClick={() => setFormData({...formData, training_mode: 'text'})}
                             className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-3 group ${
                               formData.training_mode === 'text' 
                               ? 'border-primary-600 bg-primary-50/30' 
                               : 'border-slate-100 bg-white hover:border-slate-200'
                             }`}
                           >
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                                formData.training_mode === 'text' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                              }`}>
                                 <FileText size={24} />
                              </div>
                              <div>
                                 <h4 className={`font-black uppercase tracking-widest text-xs ${formData.training_mode === 'text' ? 'text-primary-600' : 'text-slate-400'}`}>Modo Texto</h4>
                                 <p className="text-[11px] text-slate-500 font-medium mt-1">Preencha os campos de empresa, serviços e FAQ manualmente.</p>
                              </div>
                              {formData.training_mode === 'text' && (
                                <div className="mt-auto pt-2">
                                   <span className="text-[9px] font-black uppercase tracking-widest text-primary-600 px-2 py-1 bg-primary-100 rounded-full">Ativo</span>
                                </div>
                              )}
                           </button>

                           {useFeature('agent_training_audio') && (
                             <button 
                               onClick={() => setFormData({...formData, training_mode: 'audio'})}
                               className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-3 group ${
                                 formData.training_mode === 'audio' 
                                 ? 'border-primary-600 bg-primary-50/30' 
                                 : 'border-slate-100 bg-white hover:border-slate-200'
                               }`}
                             >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                                  formData.training_mode === 'audio' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                                }`}>
                                   <Mic size={24} />
                                </div>
                                <div>
                                   <h4 className={`font-black uppercase tracking-widest text-xs ${formData.training_mode === 'audio' ? 'text-primary-600' : 'text-slate-400'}`}>Modo Áudio</h4>
                                   <p className="text-[11px] text-slate-500 font-medium mt-1">Grave sua voz para ensinar o agente sobre seu negócio.</p>
                                </div>
                                {formData.training_mode === 'audio' && (
                                  <div className="mt-auto pt-2">
                                     <span className="text-[9px] font-black uppercase tracking-widest text-primary-600 px-2 py-1 bg-primary-100 rounded-full">Ativo</span>
                                  </div>
                                )}
                             </button>
                           )}
                        </div>
                     </div>

                     <div className="h-px bg-slate-100 my-4" />
                     
                     <div className="hidden">Rendered Knowledge Tab v3</div>
                    
                    <div className="space-y-6">
                      <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
                        {/* Decorative background element */}
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-teal-500/10 rounded-full blur-3xl"></div>
                        
                        <div className="relative z-10">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-teal-500 rounded-2xl shadow-lg shadow-teal-500/20">
                                <Mic size={28} className="text-white" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-white">Treinamento por Áudio</h3>
                                <p className="text-slate-400 text-sm">Grave ou envie áudios para ensinar seu agente.</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 md:gap-6 mt-8">
                            <button 
                              onClick={startRecording}
                              className="flex items-center justify-center gap-3 px-6 py-4 bg-teal-500 hover:bg-teal-600 rounded-xl font-black transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/20 w-full md:w-auto"
                            >
                              <Circle className="fill-red-500 text-red-500" size={16} />
                              Começar a Gravar Agora
                            </button>
                            
                            <label className="flex items-center justify-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all cursor-pointer w-full md:w-auto">
                              <Upload size={18} />
                              Enviar Arquivo de Áudio
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="audio/*" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleAudioUpload(file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Lista de Blocos de Áudio */}
                      {audioKnowledge.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <AnimatePresence mode="popLayout">
                            {audioKnowledge.map((item) => (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.9, y: -20 }}
                                animate={{ 
                                  opacity: 1, 
                                  scale: 1, 
                                  y: 0,
                                  backgroundColor: highlightedKnowledgeId === item.id ? 'rgb(240, 253, 244)' : 'rgb(255, 255, 255)'
                                }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={item.id} 
                                className={`p-5 rounded-2xl border transition-all ${
                                   highlightedKnowledgeId === item.id 
                                   ? 'border-emerald-300 ring-4 ring-emerald-50 shadow-lg' 
                                   : item.is_active ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-50 border-slate-50 opacity-50'
                                 }`}
                               >
                                 <div className="flex items-center justify-between mb-3">
                                   <div className="flex items-center gap-2">
                                     <div className={`p-2 rounded-xl ${item.is_active ? 'bg-teal-50 text-teal-600' : 'bg-slate-200 text-slate-500'}`}>
                                       <Volume2 size={16} />
                                     </div>
                                     <div className="flex flex-col">
                                        <span className="text-sm font-black text-slate-800 truncate max-w-[150px]">{item.title}</span>
                                        {!item.is_active && <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Inativo</span>}
                                     </div>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <button 
                                       onClick={() => {
                                          setSelectedKnowledge(item);
                                          setKnowledgeEditContent(item.content);
                                          setIsKnowledgeEditModalOpen(true);
                                       }}
                                       className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                                       title="Editar conteúdo"
                                     >
                                       <Settings2 size={16} />
                                     </button>
                                     <button 
                                       onClick={() => toggleKnowledgeActive(item)}
                                       className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${item.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                     >
                                       <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${item.is_active ? 'translate-x-5.5' : 'translate-x-1'}`} />
                                     </button>
                                     <button 
                                       onClick={() => handleDeleteKnowledge(item.id)}
                                       className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                     >
                                       <Trash2 size={16} />
                                     </button>
                                   </div>
                                 </div>
                                 <p className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed italic">
                                   "{item.content}"
                                 </p>
                                <div className="mt-4 pt-4 border-t border-slate-50 text-[10px] text-slate-400 flex items-center justify-between">
                                  <span className="font-medium">{new Date(item.created_at).toLocaleDateString('pt-BR')} às {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  {item.is_active && <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 size={12}/> Ativo no Cérebro</span>}
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-gray-100 my-8"></div>

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

                        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
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
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 text-gray-700 transition-all w-full md:w-auto"
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
                            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 text-gray-700 transition-all w-full md:w-auto"
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
                            className="px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-100 w-full md:w-auto"
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
                                  <span className="px-2 py-0.5 bg-primary-50 text-primary-600 text-[10px] font-bold rounded uppercase">FAQ</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[10px] font-bold rounded uppercase">Texto Livre</span>
                                )}
                                <span className="text-gray-400 text-[10px]">{new Date(item.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    setKbEditItem(item);
                                    if (item.type === 'qa') {
                                      setKbEditQuestion(item.question || '');
                                      setKbEditAnswer(item.answer || '');
                                    } else {
                                      setKbEditTitle(item.title || '');
                                      setKbEditContent(item.content || '');
                                    }
                                    setIsKbEditModalOpen(true);
                                  }}
                                  className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                                  title="Editar"
                                >
                                  <Settings2 size={16} />
                                </button>
                                <button 
                                  onClick={() => {
                                    const newKb = [...(formData.knowledgeBase || [])];
                                    newKb.splice(index, 1);
                                    setFormData({...formData, knowledgeBase: newKb});
                                  }}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  title="Excluir"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
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
                      
                      <div className="mb-8 p-4 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-teal-100 text-teal-600 rounded-lg">
                            <Mic size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-teal-900">Treinamento por Áudio disponível!</p>
                            <p className="text-xs text-teal-700">Você também pode treinar o cérebro do agente enviando áudios na aba Conhecimento.</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setActiveTab('knowledge')}
                          className="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-all"
                        >
                          Ir para Treinamento
                        </button>
                      </div>
                      
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
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-600 text-[10px] font-bold rounded uppercase">
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

                {activeTab === 'automation' && (
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

                {activeTab === 'advanced' && (
                  <div className="space-y-12">
                    {/* WhatsApp Provider - Moved to Tenant Settings */}
                    <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2rem] flex flex-col items-center text-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm">
                        <Smartphone size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900">Configuração de Infraestrutura</h3>
                        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                          As configurações de provedor WhatsApp agora são gerenciadas centralmente no Painel Administrativo pelo nível de Inquilino.
                        </p>
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
