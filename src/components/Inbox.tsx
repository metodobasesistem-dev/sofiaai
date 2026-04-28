import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Paperclip, 
  Send, 
  User, 
  Bot, 
  MoreVertical, 
  Phone, 
  Video,
  CheckCheck,
  Loader2,
  MessageCircle,
  Filter,
  Users,
  Trash2,
  Trash,
  Mic,
  Play,
  Pause,
  X,
  ArrowLeft,
  Calendar,
  Info,
  ChevronRight,
  CreditCard,
  Clock,
  ExternalLink,
  Check,
  Lock
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import { User as SupabaseUser } from '@supabase/supabase-js';

import { sendMessage } from '../services/whatsappService';
import { listQuickReplies, type QuickReply } from '../services/supabaseService';
import Contacts from './Contacts';

interface Thread {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  status: 'ia' | 'human';
  unreadCount?: number;
  remoteJid: string;
  updatedAt: any;
  agent_name?: string;
  funilStatus?: 'Lead' | 'Qualificado' | 'Cliente';
}

interface Message {
  id: string;
  text: string;
  sender: 'lead' | 'ia' | 'outbound' | 'private';
  time: string;
  timestamp: any;
  audio_url?: string;
}

const getInitials = (name: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const getAvatarColor = (name: string) => {
  if (!name) return '#94a3b8';
  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#6366f1'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const AudioPlayer: React.FC<{ url: string, isOutbound: boolean }> = ({ url, isOutbound }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setProgress((audio.currentTime / audio.duration) * 100);
    audio.onended = () => setPlaying(false);
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className={`flex items-center gap-3 py-1 px-2 rounded-2xl min-w-[200px] mb-1
      ${isOutbound ? 'bg-white/10' : 'bg-blue-50/50'}`}>
      <button 
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm
          ${isOutbound ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}
      >
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 space-y-1">
        <div className="h-1 bg-black/10 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${isOutbound ? 'bg-white' : 'bg-blue-600'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-[8px] font-bold uppercase tracking-tighter
          ${isOutbound ? 'text-blue-100' : 'text-slate-400'}`}>
          <span>{playing ? 'Reproduzindo' : 'Mensagem de voz'}</span>
          <span>{duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '--:--'}</span>
        </div>
      </div>
    </div>
  );
};

const VoiceRecorder: React.FC<{ onStop: (blob: Blob) => void }> = ({ onStop }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        onStop(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      toast.error('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isRecording && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 bg-red-50 px-4 py-2 rounded-full border border-red-100"
        >
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          <span className="text-red-600 text-xs font-black font-mono">
            {Math.floor(recordingTime / 60)}:{Math.floor(recordingTime % 60).toString().padStart(2, '0')}
          </span>
          <div className="flex gap-0.5 items-center">
            {[1, 2, 3, 4, 5].map(i => (
              <motion.div 
                key={i}
                className="w-0.5 bg-red-300 rounded-full"
                animate={{ height: [4, 12, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </div>
        </motion.div>
      )}
      <button
        type="button"
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        className={`p-3 rounded-2xl transition-all duration-300 shadow-lg active:scale-90
          ${isRecording 
            ? 'bg-red-500 text-white shadow-red-200 rotate-12 scale-110' 
            : 'bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
      >
        <Mic size={22} className={isRecording ? 'animate-bounce' : ''} />
      </button>
    </div>
  );
};

const ContactItem: React.FC<{ thread: Thread, active: boolean, onClick: () => void }> = ({ thread, active, onClick }) => (
  <div 
    onClick={onClick}
    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all duration-200 border-b border-slate-100 last:border-0 relative group
      ${active ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
  >
    {active && (
      <motion.div 
        layoutId="activeContactIndicator"
        className="absolute inset-y-0 left-0 w-1 bg-blue-600 rounded-r-full"
      />
    )}
    <div className={`w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm overflow-hidden relative shadow-sm transition-colors
      ${thread.status === 'ia' ? 'ring-2 ring-blue-100' : ''}`}
      style={{ backgroundColor: getAvatarColor(thread.name) }}
    >
      {thread.status === 'ia' && (
        <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full z-10" />
      )}
      {getInitials(thread.name)}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <h4 className={`text-[13px] font-semibold truncate tracking-tight ${active ? 'text-blue-700' : 'text-slate-900 group-hover:text-blue-600 transition-colors'}`}>
          {thread.name}
        </h4>
        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap ml-2">
          {thread.time}
        </span>
      </div>
      <p className={`text-[12px] truncate leading-tight ${active ? 'text-blue-600/70' : 'text-slate-500'}`}>
        {thread.lastMessage || 'Inicie uma conversa'}
      </p>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider
            ${thread.status === 'ia' ? 'bg-blue-100/50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {thread.status === 'ia' ? (thread.agent_name || 'Robô IA') : 'Humano'}
          </span>
          {thread.funilStatus && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider
              ${thread.funilStatus === 'Lead' ? 'bg-gray-100 text-gray-600' : 
                thread.funilStatus === 'Qualificado' ? 'bg-indigo-100/50 text-indigo-700' : 
                'bg-emerald-100/50 text-emerald-700'}`}>
              {thread.funilStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(thread.unreadCount ?? 0) > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm min-w-[20px] text-center">
              {thread.unreadCount}
            </span>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); (window as any).handleDeleteThread(thread); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all rounded-md hover:bg-red-50"
            title="Excluir conversa"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  </div>
);

const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isLead = message.sender === 'lead';
  const isPrivate = message.sender === 'private';
  
  return (
    <div className={`flex flex-col mb-4 ${!isLead ? 'items-end' : 'items-start'} group`}>
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm relative transition-all duration-200
        ${isPrivate 
          ? 'bg-amber-50 text-amber-900 border border-amber-200/60 rounded-tr-none' 
          : !isLead 
            ? 'bg-blue-600 text-white rounded-tr-none' 
            : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/50'}`}>
        
        {isPrivate && (
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-600 font-bold text-[10px] uppercase tracking-widest">
            <Lock size={10} />
            Nota Privada (Apenas Equipe)
          </div>
        )}
        
        {message.audio_url ? (
          <AudioPlayer url={message.audio_url} isOutbound={!isLead} />
        ) : (
          <p className="whitespace-pre-wrap font-medium">{message.text}</p>
        )}

        <div className={`flex items-center gap-1.5 mt-1.5 text-[9px] font-bold opacity-70 tracking-tight ${isPrivate ? 'text-amber-600/70 justify-end' : (!isLead ? 'text-blue-50 justify-end' : 'text-slate-500')}`}>
          {message.time}
          {!isLead && !isPrivate && <CheckCheck size={12} className="stroke-[2.5]" />}
        </div>
      </div>
      
      {!isLead && !isPrivate && (
        <div className="flex items-center gap-1 mt-1 mr-1">
        <div className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider flex items-center gap-1
            ${message.sender === 'ia' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
            {message.sender === 'ia' ? <Bot size={9} /> : <User size={9} />}
            {message.sender === 'ia' ? 'IA Automática' : 'Atendente Real'}
          </div>
        </div>
      )}
    </div>
  );
};

export default function Inbox({ user, role, isFullscreen }: { user: SupabaseUser | null, role: string | null, isFullscreen?: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Lead' | 'Qualificado' | 'Cliente'>('Todos');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [isPrivateNoteMode, setIsPrivateNoteMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts'>('conversations');

  // Handle JID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jid = params.get('jid');
    if (jid && threads.length > 0) {
      const thread = threads.find(t => t.remoteJid === jid);
      if (thread) {
        setSelectedThreadId(thread.id);
      }
    }
  }, [threads]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen to threads
  useEffect(() => {
    let channel: any;

    const setupThreads = async () => {
      const timeoutId = setTimeout(() => {
        setLoadingThreads(false);
        console.warn('[Inbox] Safety timeout: 5s reached');
      }, 5000);

      try {
        const userId = user?.id;
        if (!userId) {
          clearTimeout(timeoutId);
          setLoadingThreads(false);
          return;
        }
        
        console.log('[Inbox] Fetching threads for:', userId);
        
        // Initial Fetch: Threads + Contacts using the fixed UUID
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('telefone, status_funil')
          .eq('user_id', userId);

        const { data, error } = await supabase
          .from('threads')
          .select('*')
          .eq('user_id', userId);

        if (error) throw error;
        if (contactsError) console.warn('[Inbox] Contacts fetch warning:', contactsError);

        if (data) {
          const formatted = data.map(d => {
            const jid = d.remote_jid || '';
            const phoneNumber = jid.includes('@') ? jid.split('@')[0] : jid;
            
            const contact = contactsData?.find(c => {
              const contactPhone = c.telefone?.replace(/\D/g, '');
              if (!contactPhone) return false;
              const p1 = phoneNumber.replace(/^55/, '');
              const p2 = contactPhone.replace(/^55/, '');
              if (p1 === p2) return true;
              if (p1.length >= 8 && p2.length >= 8) return p1.slice(-8) === p2.slice(-8);
              return false;
            });
            
            return {
              id: d.id,
              name: d.contact_name || 'Lead WhatsApp',
              lastMessage: d.last_message || '',
              time: d.updated_at ? new Date(d.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
              status: (d.status as any) || 'ia',
              unreadCount: d.unread_count || 0,
              remoteJid: d.remote_jid || '',
              updatedAt: d.updated_at || new Date().toISOString(),
              agent_name: d.agent_name || 'Robô IA',
              funilStatus: contact?.status_funil || 'Lead'
            };
          });
          const sorted = formatted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setThreads(sorted);
          
          const params = new URLSearchParams(window.location.search);
          const jidFromUrl = params.get('jid');
          if (jidFromUrl) {
            const match = sorted.find(t => t.remoteJid.includes(jidFromUrl));
            if (match) setSelectedThreadId(match.id);
          }
        }
      } catch (err) {
        console.error('[Inbox] Error setting up threads:', err);
        toast.error('Ocorreu uma instabilidade ao carregar as conversas.');
      } finally {
        setLoadingThreads(false);
        clearTimeout(timeoutId);
      }

      // Realtime listener
      const userId = user?.id; // Needed for the listener below
      if (!userId) return;

      channel = supabase
        .channel(`threads-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'threads', filter: `user_id=eq.${userId}` },
          async () => {
            const { data: freshData } = await supabase
              .from('threads')
              .select('*')
              .eq('user_id', userId)
              .order('updated_at', { ascending: false });
            
            if (freshData) {
              const { data: freshContacts } = await supabase
                .from('contacts')
                .select('telefone, status_funil')
                .eq('user_id', userId);
              
              const formatted = freshData.map(d => {
                const jid = d.remote_jid || '';
                const phoneNumber = jid.includes('@') ? jid.split('@')[0] : jid;
                const contact = freshContacts?.find(c => {
                  const contactPhone = c.telefone?.replace(/\D/g, '');
                  if (!contactPhone) return false;
                  const p1 = phoneNumber.replace(/^55/, '');
                  const p2 = contactPhone.replace(/^55/, '');
                  if (p1 === p2) return true;
                  if (p1.length >= 8 && p2.length >= 8) return p1.slice(-8) === p2.slice(-8);
                  return false;
                });
                return {
                  id: d.id,
                  name: d.contact_name || 'Lead WhatsApp',
                  lastMessage: d.last_message || '',
                  time: d.updated_at ? new Date(d.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
                  status: d.status as any,
                  unreadCount: d.unread_count || 0,
                  remoteJid: d.remote_jid,
                  updatedAt: d.updated_at,
                  agent_name: d.agent_name || 'Robô IA',
                  funilStatus: contact?.status_funil || 'Lead'
                };
              });
              const sorted = formatted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
              setThreads(sorted);
            }
          }
        )
        .subscribe();
    };

    setupThreads();

    // Fetch Quick Replies
    const fetchQuickReplies = async () => {
      const qrs = await listQuickReplies();
      setQuickReplies(qrs);
    };
    fetchQuickReplies();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Listen to messages
  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }

    let channel: any;

    const setupMessages = async () => {
      try {
        setLoadingMessages(true);

        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('thread_id', selectedThreadId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data) {
          const formatted = data.map(d => ({
            id: d.id,
            text: d.text || '',
            sender: d.id?.startsWith('private-') ? 'private' : (d.direction === 'inbound' ? 'lead' : (d.message_id?.startsWith('ai-') ? 'ia' : 'outbound')),
            time: d.created_at ? new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            timestamp: d.created_at,
            audio_url: d.audio_url
          }));
          setMessages(formatted as any);
        }

        // --- BUSCA DE DADOS PARA A LATERAL DIREITA ---
        const thread = threads.find(t => t.id === selectedThreadId);
        if (thread) {
          const cleanPhone = thread.remoteJid.split('@')[0].replace(/\D/g, '');
          
          // 1. Dados do Contato
          const { data: contact } = await supabase
            .from('contacts')
            .select('*')
            .ilike('telefone', `%${cleanPhone.slice(-8)}%`)
            .maybeSingle();
          setSelectedContact(contact);

          // 2. Agendamentos
          if (contact) {
            const { data: apps } = await supabase
              .from('appointments')
              .select('*')
              .eq('contact_id', contact.id)
              .order('start_time', { ascending: false })
              .limit(5);
            setAppointments(apps || []);
          } else {
            setAppointments([]);
          }
        }

        channel = supabase
          .channel(`messages-${selectedThreadId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${selectedThreadId}` },
            (payload) => {
              const d = payload.new;
              const newMessage = {
                id: d.id,
                text: d.text || '',
                sender: d.id?.startsWith('private-') ? 'private' : (d.direction === 'inbound' ? 'lead' : (d.message_id?.startsWith('ai-') ? 'ia' : 'outbound')),
                time: d.created_at ? new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
                timestamp: d.created_at,
                audio_url: d.audio_url
              };
              setMessages(prev => [...prev, newMessage as any]);
            }
          )
          .subscribe();

        await supabase
          .from('threads')
          .update({ unread_count: 0 })
          .eq('id', selectedThreadId);

      } catch (err) {
        console.error('[Inbox] Error setting up messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    setupMessages();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedThreadId]);


  const activeThread = threads.find(t => t.id === selectedThreadId);

  const toggleThreadStatus = async () => {
    if (!selectedThreadId || !activeThread) return;
    try {
      const newStatus = activeThread.status === 'ia' ? 'human' : 'ia';
      const { error } = await supabase
        .from('threads')
        .update({ status: newStatus })
        .eq('id', selectedThreadId);
      
      if (error) throw error;
      toast.success(`Modo de atendimento alterado para ${newStatus === 'ia' ? 'IA' : 'Humano'}`);
    } catch (err) {
      toast.error('Erro ao alterar modo de atendimento');
    }
  };

  const handleSendVoice = async (blob: Blob) => {
    if (!selectedThreadId || !activeThread) return;
    const userId = user?.id;
    if (!userId) return;

    try {
      const formData = new FormData();
      formData.append('audio', blob);
      formData.append('userId', userId);
      formData.append('remoteJid', activeThread.remoteJid);

      const response = await fetch('/api/whatsapp/send-voice', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Falha ao enviar áudio');
      
      toast.success('Mensagem de voz enviada!');
      
      await supabase
        .from('threads')
        .update({ status: 'human', updated_at: new Date().toISOString() })
        .eq('id', selectedThreadId);

    } catch (err) {
      console.error('Error sending voice:', err);
      toast.error('Erro ao enviar áudio');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedThreadId || !activeThread) return;
    
    const userId = user?.id;
    if (!userId) return;

    try {
      const formData = new FormData();
      formData.append('media', file);
      formData.append('userId', userId);
      formData.append('remoteJid', activeThread.remoteJid);

      const response = await fetch('/api/whatsapp/send-media', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Falha ao enviar arquivo');
      
      toast.success('Arquivo enviado com sucesso!');
      
      if (fileInputRef.current) fileInputRef.current.value = '';

      await supabase
        .from('threads')
        .update({ status: 'human', updated_at: new Date().toISOString() })
        .eq('id', selectedThreadId);

    } catch (err) {
      console.error('Error sending file:', err);
      toast.error('Erro ao enviar arquivo');
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedThreadId || !activeThread) return;

    const userId = user?.id;
    if (!userId) return;

    const text = messageText;
    setMessageText('');

    const isPrivate = isPrivateNoteMode || text.trim().startsWith('/nota ');
    const finalMessageText = text.trim().startsWith('/nota ') ? text.trim().substring(6).trim() : text.trim();
    if (!finalMessageText) return;

    if (isPrivate) {
      try {
        const privateId = `private-${Date.now()}`;
        const { error } = await supabase.from('messages').insert({
           id: privateId,
           user_id: userId,
           thread_id: selectedThreadId,
           text: finalMessageText,
           direction: 'outbound',
           timestamp: Date.now()
        });
        if (error) throw error;
        
        setIsPrivateNoteMode(false);
        // O Realtime listener do messages vai capturar e atualizar a lista
      } catch (err) {
        console.error('Error adding private note:', err);
        toast.error('Erro ao adicionar nota privada');
      }
      return;
    }

    try {
      await sendMessage(activeThread.remoteJid, text);
      
      await supabase
        .from('threads')
        .update({ 
          status: 'human',
          last_message: text,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedThreadId);
      
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('🚨 TEM CERTEZA? Isso vai apagar todas as mensagens e contatos do seu painel permanentemente.')) return;
    
    setIsCleaning(true);
    try {
      const userId = user?.id;
      if (!userId) return;

      await supabase.from('messages').delete().eq('user_id', userId);
      await supabase.from('threads').delete().eq('user_id', userId);
      await supabase.from('contacts').delete().eq('user_id', userId);

      toast.success('Caixa de entrada limpa com sucesso!');
      setThreads([]);
      setSelectedThreadId(null);
    } catch (err) {
      toast.error('Erro ao limpar caixa de entrada');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleDeleteThread = async (thread: Thread) => {
    if (!window.confirm(`Excluir conversa com ${thread.name}?`)) return;

    try {
      await supabase.from('messages').delete().eq('thread_id', thread.id);
      await supabase.from('threads').delete().eq('id', thread.id);
      
      const phoneNumber = thread.remoteJid.split('@')[0];
      await supabase.from('contacts').delete().ilike('telefone', `%${phoneNumber.slice(-8)}%`);

      toast.success('Conversa excluída');
      if (selectedThreadId === thread.id) setSelectedThreadId(null);
      setThreads(prev => prev.filter(t => t.id !== thread.id));
    } catch (err) {
      toast.error('Erro ao excluir conversa');
    }
  };

  useEffect(() => {
    (window as any).handleDeleteThread = handleDeleteThread;
  }, [threads, selectedThreadId]);

  const filteredThreads = threads.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.remoteJid.includes(searchTerm);
    const matchesFilter = filterStatus === 'Todos' || t.funilStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className={isFullscreen 
      ? "h-screen w-full bg-white flex overflow-hidden" 
      : "h-[calc(100vh-130px)] md:h-[calc(100vh-120px)] bg-white rounded-xl border border-gray-200 shadow-sm flex overflow-hidden"
    }>
      {isFullscreen && (
        <div className="w-[70px] bg-slate-900 flex flex-col items-center py-6 border-r border-slate-800 shrink-0 z-20">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold mb-8 shadow-lg shadow-blue-500/20">
            W
          </div>
          
          <div className="flex flex-col gap-4 w-full px-2">
            <button 
              onClick={() => setActiveTab('conversations')}
              className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all group relative
                ${activeTab === 'conversations' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Conversas"
            >
              <MessageCircle size={22} className={activeTab === 'conversations' ? 'fill-blue-400/20' : ''} />
              {activeTab === 'conversations' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />}
            </button>
            
            <button 
              onClick={() => setActiveTab('contacts')}
              className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all group relative
                ${activeTab === 'contacts' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Contatos"
            >
              <Users size={22} className={activeTab === 'contacts' ? 'fill-blue-400/20' : ''} />
              {activeTab === 'contacts' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'contacts' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10 p-4 md:p-6 lg:p-8">
          <Contacts user={user} role={user?.role || null} onTabChange={(tab) => {
            if (tab === 'inbox') setActiveTab('conversations');
          }} />
        </div>
      ) : (
        <>
          <div className={`${selectedThreadId ? 'hidden md:flex' : 'flex'} w-full md:w-[35%] lg:w-[30%] border-r border-gray-100 flex-col bg-gray-50/30`}>
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <MessageCircle size={14} className="text-blue-600" />
              Conversas
            </h2>
            <div className="flex items-center gap-1">
              {!isFullscreen && (
                <button
                  onClick={() => window.open('/?fullscreen=true', '_blank')}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                  title="Abrir em Nova Janela"
                >
                  <ExternalLink size={14} />
                </button>
              )}
              <button 
                onClick={handleClearAll}
                disabled={isCleaning || threads.length === 0}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Limpar tudo"
              >
                {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash size={14} />}
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] placeholder-slate-400 focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
            {(['Todos', 'Lead', 'Qualificado', 'Cliente'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all
                  ${filterStatus === f 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-2">
              <ListSkeleton rows={8} />
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center bg-gray-50/50 text-gray-400 p-8 text-center">
              <Search size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Nenhuma conversa encontrada com os filtros atuais.</p>
            </div>
          ) : (
            filteredThreads.map(thread => (
              <ContactItem 
                key={thread.id} 
                thread={thread} 
                active={selectedThreadId === thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Column: Chat Area */}
      <div className={`${selectedThreadId ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white overflow-hidden`}>
        {selectedThreadId && activeThread ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 md:px-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedThreadId(null)}
                  className="md:hidden p-2 -ml-2 text-slate-500 hover:text-blue-600 transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>

                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200/50">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-slate-900 leading-tight">{activeThread.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Online via WhatsApp</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <button 
                  onClick={toggleThreadStatus}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border shadow-sm flex items-center gap-2
                    ${activeThread.status === 'ia' 
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                >
                  {activeThread.status === 'ia' ? (
                    <><User size={14} /> <span className="hidden sm:inline">Assumir Atendimento</span></>
                  ) : (
                    <><Bot size={14} /> <span className="hidden sm:inline">Ativar Robô IA</span></>
                  )}
                </button>

                <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block"></div>

                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className={`p-2 rounded-lg transition-all ${showDetails ? 'text-blue-600 bg-blue-50 border border-blue-100' : 'text-slate-400 hover:bg-slate-50 border border-transparent'}`}
                  title={showDetails ? "Esconder Detalhes" : "Mostrar Detalhes"}
                >
                  <Info size={18} />
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Phone size={18} /></button>
                  <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"><MoreVertical size={18} /></button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 space-y-4">
              {loadingMessages ? (
                <div className="space-y-6">
                  <Skeleton variant="rect" width="60%" height={60} className="rounded-2xl rounded-tl-none" />
                  <Skeleton variant="rect" width="40%" height={40} className="rounded-2xl rounded-tr-none bg-blue-100 self-end" />
                </div>
              ) : (
                <>
                  {messages.map(msg => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Quick Replies chips */}
            {quickReplies.length > 0 && (
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                <span className="text-[10px] font-bold text-gray-400 uppercase mr-2 shrink-0">Atalhos:</span>
                {quickReplies.map(reply => (
                  <button
                    key={reply.id}
                    onClick={() => setMessageText(reply.content)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border border-blue-100 shadow-sm"
                  >
                    {reply.title}
                  </button>
                ))}
              </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-slate-100 bg-white shrink-0 relative">
              {showSlashMenu && (
                <div className="absolute bottom-[calc(100%+8px)] left-4 w-80 bg-white rounded-xl shadow-[0_0_40px_-10px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden z-50">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Bot size={12}/> Comandos Rápidos</span>
                    <span className="text-[9px] font-medium text-slate-400">Use ↑ ↓ para navegar</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {(() => {
                      const filtered = quickReplies.filter(r => 
                        r.title.toLowerCase().includes(slashFilter) || r.content.toLowerCase().includes(slashFilter)
                      ).slice(0, 6);
                      
                      if (filtered.length === 0) {
                        return <div className="p-4 text-center text-xs text-slate-500">Nenhum atalho encontrado</div>;
                      }

                      return filtered.map((reply, idx) => (
                        <button
                          key={reply.id}
                          type="button"
                          onClick={() => {
                            setMessageText(prev => prev.replace(/(?:\s|^)\/[^\s]*$/, ` ${reply.content} `).trimStart());
                            setShowSlashMenu(false);
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 transition-all
                            ${slashIndex === idx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                          onMouseEnter={() => setSlashIndex(idx)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[13px] font-bold ${slashIndex === idx ? 'text-blue-700' : 'text-slate-800'}`}>
                              {reply.title}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Enter ↵</span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1">{reply.content}</p>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-2">
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-slate-200 shadow-sm bg-white"
                    title="Anexar arquivo"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsPrivateNoteMode(!isPrivateNoteMode)} 
                    className={`p-2.5 rounded-xl transition-all shadow-sm
                      ${isPrivateNoteMode ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-white text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-slate-200'}`}
                    title="Nota Privada (Apenas para equipe)"
                  >
                    <Lock size={18} />
                  </button>
                  <VoiceRecorder onStop={handleSendVoice} />
                </div>

                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} 
                  className={`flex-1 flex items-end gap-3 p-3 rounded-2xl border transition-all shadow-sm
                    ${isPrivateNoteMode 
                      ? 'bg-amber-50 border-amber-200 focus-within:border-amber-400 focus-within:bg-amber-50 focus-within:ring-4 focus-within:ring-amber-100' 
                      : 'bg-slate-50 border-slate-200 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50'}`}
                >
                  <textarea 
                    rows={1} 
                    value={messageText} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setMessageText(val);
                      const match = val.match(/(?:\s|^)\/([^\s]*)$/);
                      if (match && quickReplies.length > 0) {
                        setShowSlashMenu(true);
                        setSlashFilter(match[1].toLowerCase());
                        setSlashIndex(0);
                      } else {
                        setShowSlashMenu(false);
                      }
                    }} 
                    onKeyDown={(e) => { 
                      if (showSlashMenu) {
                        const filtered = quickReplies.filter(r => r.title.toLowerCase().includes(slashFilter) || r.content.toLowerCase().includes(slashFilter)).slice(0, 6);
                        if (filtered.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setSlashIndex(prev => (prev + 1) % filtered.length);
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setSlashIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const selected = filtered[slashIndex];
                            if (selected) {
                              setMessageText(prev => prev.replace(/(?:\s|^)\/[^\s]*$/, ` ${selected.content} `).trimStart());
                              setShowSlashMenu(false);
                            }
                            return;
                          }
                          if (e.key === 'Escape') {
                            setShowSlashMenu(false);
                            return;
                          }
                        }
                      }

                      if (e.key === 'Enter' && !e.shiftKey) { 
                        e.preventDefault(); 
                        if (!showSlashMenu) handleSendMessage(); 
                      } 
                    }} 
                    placeholder={isPrivateNoteMode ? "Escreva uma nota privada... (o cliente não verá isso)" : "Escreva sua mensagem... (Digite / para respostas rápidas)"}
                    className={`flex-1 bg-transparent border-none focus:ring-0 text-[13px] py-1.5 px-1 resize-none max-h-32 min-h-[24px] leading-relaxed font-medium 
                      ${isPrivateNoteMode ? 'placeholder-amber-600/50 text-amber-900' : 'placeholder-slate-400 text-slate-700'}`} 
                  />
                  <button 
                    type="submit" 
                    className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center
                      ${messageText.trim() 
                        ? (isPrivateNoteMode ? 'bg-amber-600 text-white shadow-md shadow-amber-200' : 'bg-blue-600 text-white shadow-md shadow-blue-200') 
                        : 'bg-slate-200 text-white opacity-50 cursor-not-allowed'}`} 
                    disabled={!messageText.trim()}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 relative">
            {/* Soft decorative background pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-500/10 border border-slate-100/50">
                <MessageCircle size={56} className="text-blue-500/80" />
              </div>
              <h3 className="text-[22px] font-bold text-slate-800 mb-3 tracking-tight">Sua Caixa de Entrada</h3>
              <p className="max-w-sm text-[14px] text-slate-500 leading-relaxed">
                Selecione uma conversa na lista ao lado para visualizar as mensagens e gerenciar o atendimento de forma centralizada.
              </p>
              <div className="mt-10 flex gap-4">
                 <div className="px-5 py-2.5 bg-white rounded-full border border-slate-200/60 shadow-sm text-[12px] font-semibold text-slate-500 flex items-center gap-2">
                    <Bot size={16} className="text-blue-500" /> IA Ativa
                 </div>
                 <div className="px-5 py-2.5 bg-white rounded-full border border-slate-200/60 shadow-sm text-[12px] font-semibold text-slate-500 flex items-center gap-2">
                    <Users size={16} className="text-emerald-500" /> CRM Integrado
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Lead Details Sidebar */}
      {selectedThreadId && activeThread && showDetails && (
        <motion.div 
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: '28%' }}
          className="hidden lg:flex border-l border-gray-100 flex-col bg-white overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Perfil Header */}
            <div className="p-6 border-b border-slate-100 text-center bg-slate-50/30">
              <div className="w-20 h-20 rounded-2xl bg-white text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-200/50 shadow-sm">
                <User size={36} />
              </div>
              <h3 className="text-[15px] font-bold text-slate-900 truncate px-2">{activeThread.name}</h3>
              <div className="mt-2 flex items-center justify-center">
                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border
                  ${activeThread.funilStatus === 'Lead' ? 'bg-slate-50 text-slate-500 border-slate-200' : 
                    activeThread.funilStatus === 'Qualificado' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                    'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                  {activeThread.funilStatus || 'Lead'}
                </span>
              </div>
            </div>

            <div className="p-8 space-y-10">
              {/* Dados do Contato */}
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <Info size={14} className="text-blue-500" /> Informações
                </h4>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 border border-blue-100">
                      <Phone size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">WhatsApp</p>
                      <p className="text-sm font-black text-gray-800">{activeThread.remoteJid.split('@')[0]}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100">
                      <Clock size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Desde</p>
                      <p className="text-sm font-black text-gray-800">
                        {selectedContact?.created_at ? new Date(selectedContact.created_at).toLocaleDateString('pt-BR') : 'Hoje'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Agendamentos */}
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Calendar size={14} className="text-blue-500" /> Agendamentos</span>
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black shadow-sm">{appointments.length}</span>
                </h4>
                <div className="space-y-4">
                  {appointments.length > 0 ? (
                    appointments.map((app, idx) => (
                      <div key={idx} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2">
                           <Calendar size={32} className="text-blue-500/5 -mr-2 -mt-2 rotate-12" />
                        </div>
                        <div className="flex justify-between items-start mb-2 relative z-10">
                          <p className="text-[13px] font-bold text-slate-900 truncate flex-1">{app.service || 'Procedimento'}</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase ml-2 border
                            ${app.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                            {app.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold relative z-10">
                          <Clock size={12} className="text-slate-400" />
                          {new Date(app.start_time).toLocaleDateString('pt-BR')} • {new Date(app.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 bg-slate-50/30 rounded-2xl border border-dashed border-slate-200">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100">
                        <Calendar size={20} className="text-slate-300" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum agendamento</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Gestão do Funil */}
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <CreditCard size={14} className="text-blue-500" /> Gestão de Funil
                </h4>
                <div className="flex flex-col gap-2">
                  {(['Lead', 'Qualificado', 'Cliente'] as const).map((status) => {
                    const isActive = activeThread.funilStatus === status;
                    return (
                      <button 
                        key={status}
                        onClick={async () => {
                          const cleanPhone = activeThread.remoteJid.split('@')[0].replace(/\D/g, '');
                          const { error } = await supabase
                            .from('contacts')
                            .update({ status_funil: status })
                            .ilike('telefone', `%${cleanPhone.slice(-8)}%`);
                          
                          if (!error) {
                            toast.success(`Status alterado para ${status}`);
                            // Atualização local imediata para feedback instantâneo
                            setThreads(prev => prev.map(t => 
                              t.id === selectedThreadId ? { ...t, funilStatus: status } : t
                            ));
                          } else {
                            toast.error('Erro ao atualizar status');
                          }
                        }}
                        className={`group w-full flex items-center justify-between p-4 rounded-3xl border-2 transition-all
                          ${isActive 
                            ? 'bg-blue-50 border-blue-500 shadow-lg shadow-blue-500/10' 
                            : 'bg-white border-gray-100 hover:border-blue-200'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full 
                            ${status === 'Lead' ? 'bg-slate-400' : 
                              status === 'Qualificado' ? 'bg-indigo-500' : 'bg-emerald-500'}`} 
                          />
                          <span className={`text-[13px] font-semibold ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>{status}</span>
                        </div>
                        {isActive && <Check size={16} className="text-blue-600" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
      </>
      )}
    </div>
  );
}
