import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText,
  MapPin,
  Smartphone,
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
  ChevronLeft,
  CreditCard,
  Clock,
  ExternalLink,
  Check,
  Lock,
  Tag,
  AlertCircle,
  CheckCircle2,
  Bookmark,
  LayoutDashboard,
  BarChart3,
  Layers
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import { User as SupabaseUser } from '@supabase/supabase-js';

import { sendMessage } from '../services/whatsappService';
import { listQuickReplies, type QuickReply, listProfessionals, type Professional } from '../services/supabaseService';
import Contacts from './Contacts';
import KanbanBoard from './KanbanBoard';
import ReportsDashboard from './ReportsDashboard';
import Integrations from './Integrations';

interface Thread {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  status: 'ia' | 'human';
  unreadCount?: number;
  remoteJid: string;
  updatedAt: any;
  lastMessageTime?: any;
  agent_name?: string;
  funilStatus?: 'Lead' | 'Qualificado' | 'Cliente';
  ticketStatus?: 'open' | 'pending' | 'resolved';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: string | null;
  labels?: string[];
  photo_url?: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'lead' | 'ia' | 'outbound' | 'private';
  time: string;
  timestamp: any;
  audio_url?: string;
  message_type?: string;
  media_url?: string;
  media_mime_type?: string;
  media_filename?: string;
  caption?: string;
  is_external?: boolean;
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

const ContactItem: React.FC<{ thread: Thread, active: boolean, onClick: () => void, onDelete: (e: React.MouseEvent) => void }> = ({ thread, active, onClick, onDelete }) => (
  <div 
    onClick={onClick}
    className={`p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 border-b border-slate-100 last:border-0 relative group
      ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
  >
    <div className="relative shrink-0">
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg overflow-hidden shadow-sm"
        style={{ backgroundColor: !thread.photo_url ? getAvatarColor(thread.name) : 'transparent' }}
      >
        {thread.photo_url ? (
          <img src={thread.photo_url} alt={thread.name} className="w-full h-full object-cover" />
        ) : (
          getInitials(thread.name)
        )}
      </div>
      {thread.status === 'ia' && (
        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-blue-500 border-2 border-white rounded-full z-10" />
      )}
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <h4 className={(thread.unreadCount ?? 0) > 0 
          ? "text-[15px] truncate font-black text-slate-900" 
          : "text-[15px] truncate font-medium text-slate-600"}>
          {thread.name}
        </h4>
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(e);
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
            title="Excluir conversa"
          >
            <Trash size={12} />
          </button>
          <span className={(thread.unreadCount ?? 0) > 0 
            ? "text-[11px] font-bold text-emerald-500" 
            : "text-[11px] font-medium text-slate-400"}>
            {thread.time}
          </span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <p className={(thread.unreadCount ?? 0) > 0 
          ? "text-[13px] truncate leading-tight flex-1 mr-2 font-bold text-slate-900" 
          : "text-[13px] truncate leading-tight flex-1 mr-2 font-normal text-slate-500"}>
          {thread.lastMessage || 'Inicie uma conversa'}
        </p>
        {(thread.unreadCount ?? 0) > 0 && (
          <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-sm">
            {thread.unreadCount}
          </span>
        )}
      </div>
    </div>
  </div>
);

const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isLead = message.sender === 'lead';
  const isPrivate = message.sender === 'private';
  const isExternal = message.is_external;
  
  const renderMediaContent = () => {
    switch (message.message_type) {
      case 'audio':
        return (
          <div className="space-y-1">
            <AudioPlayer url={message.media_url || message.audio_url || ''} isOutbound={!isLead} />
            {message.text && message.text !== '[Áudio]' && (
              <p className="text-[12px] italic opacity-80 mt-1">
                "{message.text.replace('[Áudio]: ', '')}"
              </p>
            )}
          </div>
        );
      
      case 'image':
        return (
          <div className="space-y-2">
            <div className="rounded-lg overflow-hidden border border-black/5 bg-black/5 cursor-pointer hover:opacity-95 transition-opacity"
                 onClick={() => window.open(message.media_url, '_blank')}>
              <img src={message.media_url} alt="WhatsApp" className="max-w-full max-h-[300px] object-contain" />
            </div>
            {message.caption && <p className="whitespace-pre-wrap">{message.caption}</p>}
          </div>
        );

      case 'video':
        return (
          <div className="space-y-2">
            <video controls className="rounded-lg max-w-full max-h-[300px]">
              <source src={message.media_url} type={message.media_mime_type} />
              Seu navegador não suporta vídeos.
            </video>
            {message.caption && <p className="whitespace-pre-wrap">{message.caption}</p>}
          </div>
        );

      case 'document':
        return (
          <a href={message.media_url} target="_blank" rel="noopener noreferrer" 
             className="flex items-center gap-3 p-3 bg-black/5 rounded-xl hover:bg-black/10 transition-colors no-underline">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[13px] truncate text-slate-800">
                {message.media_filename || 'Arquivo'}
              </p>
              <p className="text-[10px] text-slate-500 uppercase">
                {message.media_mime_type?.split('/')[1] || 'Documento'}
              </p>
            </div>
          </a>
        );

      case 'sticker':
        return (
          <div className="w-32 h-32">
            <img src={message.media_url} alt="Sticker" className="w-full h-full object-contain" />
          </div>
        );

      case 'contact':
        return (
          <div className="flex items-center gap-3 p-2">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <User size={20} />
            </div>
            <p className="font-bold text-sm">{message.text}</p>
          </div>
        );

      case 'location':
        return (
          <div className="space-y-2">
             <div className="flex items-center gap-2 text-blue-600 font-bold">
               <MapPin size={16} /> Localização enviada
             </div>
             <p className="text-xs">{message.text}</p>
             <a href={`https://www.google.com/maps/search/?api=1&query=${message.text.split(': ')[1]}`} target="_blank" className="text-blue-500 underline text-xs">
               Ver no mapa
             </a>
          </div>
        );

      default:
        return (
          <p className="whitespace-pre-wrap break-all">
            {message.text || (message.message_type === 'unknown' ? '[Mídia não suportada]' : '')}
          </p>
        );
    }
  };
  
  return (
    <div className={`flex flex-col mb-3 ${!isLead ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed shadow-sm relative break-words
        ${isPrivate 
          ? 'bg-amber-100 text-amber-900 border border-amber-200' 
          : !isLead 
            ? 'bg-[#dcf8c6] text-[#075e54] rounded-tr-none' 
            : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/50'}`}>
        
        {isPrivate && (
          <div className="flex items-center gap-1.5 mb-1 text-amber-600 font-bold text-[9px] uppercase">
            <Lock size={9} /> Nota Privada
          </div>
        )}
        
        {renderMediaContent()}

        <div className={`flex items-center gap-1 mt-1 text-[10px] opacity-60 justify-end ${!isLead ? 'text-[#075e54]' : 'text-slate-400'}`}>
          {isExternal && !isLead && <Smartphone size={10} className="mr-0.5" />}
          {message.time}
          {!isLead && !isPrivate && <CheckCheck size={14} className="ml-1" />}
        </div>
      </div>
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
  const [filterStatus, setFilterStatus] = useState<'Abertos' | 'Resolvidos' | 'Todos' | 'Lead' | 'Qualificado' | 'Cliente'>('Abertos');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const contactsRef = useRef<any[]>([]);
  
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [isPrivateNoteMode, setIsPrivateNoteMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts' | 'kanban' | 'reports' | 'integrations'>('conversations');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  // Helper centralizado para resolver o nome do contato via CRM
  const getResolvedContact = (remoteJid: string, fallbackName: string) => {
    const phoneNumber = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Usamos o ref para garantir que o listener do Realtime sempre tenha os dados mais recentes
    const currentContacts = contactsRef.current;
    
    const contact = currentContacts.find(c => {
      const contactPhone = c.telefone?.replace(/\D/g, '');
      if (!contactPhone) return false;
      const p1 = cleanPhone.replace(/^55/, '');
      const p2 = contactPhone.replace(/^55/, '');
      if (p1 === p2) return true;
      if (p1.length >= 8 && p2.length >= 8) return p1.slice(-8) === p2.slice(-8);
      return false;
    });

    return {
      name: contact?.nome || fallbackName,
      funilStatus: contact?.status_funil || 'Lead'
    };
  };

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

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    // Usamos um pequeno timeout para garantir que o DOM atualizou
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 100);
  };

  useEffect(() => {
    // Se as mensagens mudarem e não estivermos carregando, rola para o fim
    if (!loadingMessages && messages.length > 0) {
      // Se for a primeira carga de uma conversa selecionada, pulamos direto (instant)
      // Se for uma mensagem nova chegando, fazemos o smooth
      scrollToBottom(messages.length <= 1 ? "auto" : "smooth");
    }
  }, [messages, loadingMessages]);

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
          console.warn('[Inbox] setupThreads aborted: No user ID available');
          clearTimeout(timeoutId);
          setLoadingThreads(false);
          return;
        }
        
        // Ensure we have a session before proceeding
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
           console.warn('[Inbox] No session found, waiting for auth...');
           // If we don't have a session yet, don't fail immediately, just wait for next trigger
           clearTimeout(timeoutId);
           return;
        }

        console.log('[Inbox] Fetching threads for:', userId);
        
        // Initial Fetch: Threads + Contacts using the fixed UUID
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', userId);

        const { data, error } = await supabase
          .from('threads')
          .select('*')
          .eq('user_id', userId)
          .order('last_message_time', { ascending: false });

        if (error) throw error;
        if (contactsError) console.warn('[Inbox] Contacts fetch warning:', contactsError);

        if (contactsData) {
          setContacts(contactsData);
        }

        if (data) {
          const currentContacts = contactsData || [];
          const formatted = data.map(d => {
            // Helper local para usar os dados recém-buscados
            const phoneNumber = (d.remote_jid || '').split('@')[0].replace(/\D/g, '');
            const contact = currentContacts.find(c => {
              const contactPhone = c.telefone?.replace(/\D/g, '');
              if (!contactPhone) return false;
              const p1 = phoneNumber.replace(/^55/, '');
              const p2 = contactPhone.replace(/^55/, '');
              return p1 === p2 || (p1.length >= 8 && p2.length >= 8 && p1.slice(-8) === p2.slice(-8));
            });

            return {
              id: d.id,
              name: contact?.nome || d.contact_name || 'Lead WhatsApp',
              lastMessage: d.last_message || '',
              time: d.last_message_time ? new Date(d.last_message_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
              status: (d.status as any) || 'ia',
              unreadCount: d.unread_count || 0,
              remoteJid: d.remote_jid || '',
              updatedAt: d.updated_at || new Date().toISOString(),
              lastMessageTime: d.last_message_time,
              agent_name: d.agent_name || 'Robô IA',
              funilStatus: contact?.status_funil || 'Lead',
              ticketStatus: d.ticket_status || 'open',
              priority: d.priority || 'normal',
              assignedTo: d.assigned_to || null,
              labels: Array.isArray(d.labels) ? d.labels : [],
              photo_url: d.photo_url,
              createdAt: d.created_at || d.updated_at || new Date().toISOString()
            };
          });
          setThreads(formatted);
          
          const params = new URLSearchParams(window.location.search);
          const jidFromUrl = params.get('jid');
          if (jidFromUrl) {
            const match = formatted.find(t => t.remoteJid.includes(jidFromUrl));
            if (match) setSelectedThreadId(match.id);
          }
        }
      } catch (err: any) {
        console.error('[Inbox] Error setting up threads:', err);
        const detail = err?.message || err?.error_description || 'Erro desconhecido';
        toast.error(`Falha ao carregar conversas: ${detail}`);
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
          async (payload) => {
            if (payload.eventType === 'INSERT') {
              setThreads(prev => {
                if (prev.some(t => t.id === payload.new.id)) return prev;
                const resolved = getResolvedContact(payload.new.remote_jid || '', payload.new.contact_name || 'Lead WhatsApp');
                const newThread = {
                  id: payload.new.id,
                  name: resolved.name,
                  lastMessage: payload.new.last_message || '',
                  time: payload.new.last_message_time ? new Date(payload.new.last_message_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
                  status: payload.new.status,
                  unreadCount: payload.new.unread_count || 0,
                  remoteJid: payload.new.remote_jid,
                  updatedAt: payload.new.updated_at,
                  lastMessageTime: payload.new.last_message_time,
                  agent_name: payload.new.agent_name || 'Robô IA',
                  ticketStatus: payload.new.ticket_status || 'open',
                  photo_url: payload.new.photo_url,
                  assignedTo: payload.new.assigned_to,
                  funilStatus: resolved.funilStatus
                };
                return [newThread as any, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              setThreads(prev => {
                const existingIndex = prev.findIndex(t => t.id === payload.new.id);
                
                // Se não existe, podemos ignorar ou adicionar (melhor mover para o topo se for atualização relevante)
                const baseThread = existingIndex !== -1 ? prev[existingIndex] : null;
                const resolved = getResolvedContact(payload.new.remote_jid || baseThread?.remoteJid || '', payload.new.contact_name || baseThread?.name || 'Lead WhatsApp');

                const updatedThread = {
                  ...(baseThread || {}),
                  id: payload.new.id,
                  name: resolved.name,
                  lastMessage: payload.new.last_message || baseThread?.lastMessage || '',
                  status: payload.new.status || baseThread?.status || 'ia',
                  unreadCount: payload.new.unread_count ?? baseThread?.unreadCount ?? 0,
                  updatedAt: payload.new.updated_at || baseThread?.updatedAt || new Date().toISOString(),
                  lastMessageTime: payload.new.last_message_time || baseThread?.lastMessageTime,
                  ticketStatus: payload.new.ticket_status || baseThread?.ticketStatus || 'open',
                  assignedTo: payload.new.assigned_to ?? baseThread?.assignedTo ?? null,
                  time: payload.new.last_message_time ? new Date(payload.new.last_message_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : (baseThread?.time || ''),
                  funilStatus: resolved.funilStatus
                };

                // BUG 1 FIX: Só move para o topo se a última mensagem mudou
                const isNewMessage = payload.new.last_message_time && 
                                   (!baseThread?.lastMessageTime || 
                                    new Date(payload.new.last_message_time).getTime() > new Date(baseThread.lastMessageTime).getTime());

                if (isNewMessage) {
                  const filtered = prev.filter(t => t.id !== payload.new.id);
                  return [updatedThread as any, ...filtered];
                } else {
                  // Apenas atualiza dados (ex: unreadCount = 0) sem mudar a ordem
                  return prev.map(t => (t.id === payload.new.id ? (updatedThread as any) : t));
                }
              });
            } else if (payload.eventType === 'DELETE') {
              setThreads(prev => prev.filter(t => t.id !== payload.old.id));
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

    // Fetch Team (Professionals)
    const fetchTeam = async () => {
      try {
        const profs = await listProfessionals();
        setProfessionals(profs || []);
      } catch (err) {
        console.warn('[Inbox] Error fetching professionals:', err);
      }
    };
    fetchTeam();

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
      // ── BLOCO 1: Mensagens (crítico) ──────────────────────────────────
      // Este bloco é totalmente independente. Erros nos dados da barra lateral
      // NÃO vão interferir no carregamento das mensagens.
      setLoadingMessages(true);
      setMessages([]);

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('thread_id', selectedThreadId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[Inbox] Erro ao buscar mensagens:', error);
        } else if (data) {
          const formatted = data.map(d => ({
            id: d.id,
            text: d.text || '',
            sender: d.id?.startsWith('private-') ? 'private' : (d.direction === 'inbound' || d.direction === 'received' ? 'lead' : (d.whatsapp_id?.startsWith('ai-') ? 'ia' : 'outbound')),
            time: d.created_at ? new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            timestamp: d.created_at,
            audio_url: d.audio_url,
            message_type: d.message_type || 'text',
            media_url: d.media_url,
            media_mime_type: d.media_mime_type,
            media_filename: d.media_filename,
            caption: d.caption,
            is_external: d.is_external
          }));
          setMessages(formatted as any);
        }
      } catch (msgErr) {
        console.error('[Inbox] Falha crítica ao carregar mensagens:', msgErr);
      } finally {
        setLoadingMessages(false);
      }

      // ── BLOCO 2: Realtime listener ────────────────────────────────────
      // Fase 4: escuta INSERT (novas mensagens) e UPDATE (mudança de status)
      const formatMsg = (d: any) => ({
        id: d.id,
        text: d.text || '',
        sender: d.id?.startsWith('private-') ? 'private' : (d.direction === 'inbound' || d.direction === 'received' ? 'lead' : (d.whatsapp_id?.startsWith('ai-') ? 'ia' : 'outbound')),
        time: d.created_at ? new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        timestamp: d.created_at,
        audio_url: d.audio_url,
        status: d.status,
        message_type: d.message_type || 'text',
        media_url: d.media_url,
        media_mime_type: d.media_mime_type,
        media_filename: d.media_filename,
        caption: d.caption,
        is_external: d.is_external
      });

      channel = supabase
        .channel(`messages-${selectedThreadId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${selectedThreadId}` },
          (payload) => {
            setMessages(prev => {
              const newMsg = formatMsg(payload.new);
              
              // 1. Deduplicação por ID (ID idêntico já está no estado)
              if (prev.some(m => m.id === newMsg.id)) return prev;

              const isTemp = newMsg.id.toString().startsWith('sending-');
              const newTime = new Date(newMsg.timestamp).getTime();

              // 2. Se for uma mensagem DEFINITIVA chegando:
              if (!isTemp) {
                // Procura se já existe uma temporária correspondente
                const tempIdx = prev.findIndex(m => 
                  m.id.toString().startsWith('sending-') && 
                  (Math.abs(new Date(m.timestamp).getTime() - newTime) < 2000 || m.text === newMsg.text)
                );
                
                if (tempIdx !== -1) {
                  const updated = [...prev];
                  updated[tempIdx] = newMsg as any;
                  return updated;
                }
              } else {
                // 3. Se for uma mensagem TEMPORÁRIA chegando:
                // Verifica se a definitiva já não chegou antes por algum atraso de rede
                const hasDefinitive = prev.some(m => 
                  !m.id.toString().startsWith('sending-') && 
                  (Math.abs(new Date(m.timestamp).getTime() - newTime) < 2000 || m.text === newMsg.text)
                );
                if (hasDefinitive) return prev; // Ignora a temporária se a real já está lá
              }

              return [...prev, newMsg as any];
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `thread_id=eq.${selectedThreadId}` },
          (payload) => {
            // Atualiza a mensagem existente (ex: status sending → sent)
            setMessages(prev => prev.map(m =>
              m.id === payload.new.id ? { ...m, ...formatMsg(payload.new) } : m
            ));
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages', filter: `thread_id=eq.${selectedThreadId}` },
          (payload) => {
            // Remove a mensagem do estado local (ex: mensagem temporária removida pelo backend)
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        )
        .subscribe();

      // Zerar não-lidas (Optimistic + Backend)
      setThreads(prev => prev.map(t => t.id === selectedThreadId ? { ...t, unreadCount: 0 } : t));
      supabase.from('threads').update({ unread_count: 0 }).eq('id', selectedThreadId).then(() => {});

      // ── BLOCO 3: Dados da barra lateral (não-crítico, isolado) ────────
      // Erros aqui NÃO afetam as mensagens.
      const thread = threads.find(t => t.id === selectedThreadId);
      if (!thread) return;

      try {
        const cleanPhone = thread.remoteJid.split('@')[0].replace(/\D/g, '');
        const { data: contact } = await supabase
          .from('contacts')
          .select('*')
          .ilike('telefone', `%${cleanPhone.slice(-8)}%`)
          .maybeSingle();
        setSelectedContact(contact);

        // Appointments são linkados por client_phone, não por contact_id
        const { data: apps, error: appsError } = await supabase
          .from('appointments')
          .select('*')
          .eq('user_id', user?.id)
          .ilike('client_phone', `%${cleanPhone.slice(-8)}%`)
          .order('created_at', { ascending: false })
          .limit(5);

        if (appsError) {
          console.warn('[Inbox] Appointments query warning:', appsError.message);
          setAppointments([]);
        } else {
          setAppointments(apps || []);
        }
      } catch (sidebarErr) {
        console.warn('[Inbox] Erro não-crítico na barra lateral:', sidebarErr);
        setAppointments([]);
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
      // Fase 4: apenas envia — o banco é atualizado pelo backend (Fase 2)
      // e o Realtime listener reflete a mensagem assim que for inserida.
      await sendMessage(activeThread.remoteJid, finalMessageText);

      // Atualiza status da thread para 'human'
      await supabase
        .from('threads')
        .update({ 
          status: 'human',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedThreadId);
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem');
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
    let matchesFilter = true;
    if (filterStatus === 'Abertos') matchesFilter = t.ticketStatus !== 'resolved';
    else if (filterStatus === 'Resolvidos') matchesFilter = t.ticketStatus === 'resolved';
    else if (filterStatus !== 'Todos') matchesFilter = t.funilStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className={isFullscreen 
      ? "h-screen w-full bg-[#f0f2f5] flex overflow-hidden relative" 
      : "h-[calc(100vh-130px)] md:h-[calc(100vh-120px)] bg-white rounded-xl border border-gray-200 shadow-sm flex overflow-hidden"
    }>
      {isFullscreen && (
        <div className={`${isSidebarExpanded ? 'w-[200px]' : 'w-[70px]'} transition-all duration-300 ease-in-out bg-slate-900 hidden md:flex flex-col items-center py-6 border-r border-slate-800 shrink-0 z-20 relative`}>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold mb-8 shadow-lg shadow-blue-500/20">
            W
          </div>
          
          <div className="flex flex-col gap-4 w-full px-2">
            <button 
              onClick={() => setActiveTab('conversations')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'conversations' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Conversas"
            >
              <MessageCircle size={22} className={activeTab === 'conversations' ? 'fill-blue-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Conversas</span>}
              {activeTab === 'conversations' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />}
            </button>
            
            <button 
              onClick={() => setActiveTab('contacts')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'contacts' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Contatos"
            >
              <Users size={22} className={activeTab === 'contacts' ? 'fill-blue-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Contatos</span>}
              {activeTab === 'contacts' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />}
            </button>

            <button 
              onClick={() => setActiveTab('kanban')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'kanban' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Kanban"
            >
              <LayoutDashboard size={22} className={activeTab === 'kanban' ? 'fill-blue-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Kanban</span>}
              {activeTab === 'kanban' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />}
            </button>

            <button 
              onClick={() => setActiveTab('reports')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'reports' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Relatórios"
            >
              <BarChart3 size={22} className={activeTab === 'reports' ? 'fill-blue-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Relatórios</span>}
              {activeTab === 'reports' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />}
            </button>
          </div>

          <button 
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="absolute -right-3 top-8 bg-slate-800 text-slate-400 p-1.5 rounded-full border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors z-30 shadow-lg"
          >
            {isSidebarExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      )}

      {activeTab === 'kanban' ? (
        <KanbanBoard user={user} threads={threads} onThreadsChange={setThreads} />
      ) : activeTab === 'reports' ? (
        <ReportsDashboard />
      ) : activeTab === 'integrations' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10">
          <Integrations user={user} role={user?.role || null} />
        </div>
      ) : activeTab === 'contacts' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10 p-4 md:p-6 lg:p-8">
          <Contacts user={user} role={user?.role || null} onTabChange={(tab, passedPhone) => {
            if (tab === 'inbox') {
              setActiveTab('conversations');
              if (passedPhone) {
                const thread = threads.find(t => t.remoteJid.includes(passedPhone));
                if (thread) {
                   setSelectedThreadId(thread.id);
                } else {
                   toast.error('Nenhuma conversa encontrada para este contato.');
                }
              }
            }
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
            {(['Abertos', 'Resolvidos', 'Todos', 'Lead', 'Qualificado', 'Cliente'] as const).map(f => (
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
                onDelete={() => handleDeleteThread(thread)}
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

                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200/50 overflow-hidden shrink-0">
                  {activeThread.photo_url ? (
                    <img src={activeThread.photo_url} alt={activeThread.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: getAvatarColor(activeThread.name) }}>
                      {getInitials(activeThread.name)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-900 leading-tight truncate">{activeThread.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px] text-slate-500 font-medium truncate">Online via WhatsApp</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <button
                  onClick={async () => {
                    const newStatus = activeThread.ticketStatus === 'resolved' ? 'open' : 'resolved';
                    await supabase.from('threads').update({ ticket_status: newStatus }).eq('id', activeThread.id);
                    setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, ticketStatus: newStatus } : t));
                    if (newStatus === 'resolved') toast.success('Conversa marcada como resolvida!');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border shadow-sm flex items-center gap-1.5
                    ${activeThread.ticketStatus === 'resolved' 
                      ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <CheckCircle2 size={14} className={activeThread.ticketStatus === 'resolved' ? "text-white" : "text-emerald-500"} />
                  <span className="hidden sm:inline">{activeThread.ticketStatus === 'resolved' ? 'Resolvido' : 'Marcar Resolvido'}</span>
                </button>

                <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block"></div>

                <button 
                  onClick={toggleThreadStatus}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border shadow-sm flex items-center gap-2
                    ${activeThread.status === 'ia' 
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                >
                  {activeThread.status === 'ia' ? (
                    <><User size={14} /> <span className="hidden lg:inline">Assumir</span></>
                  ) : (
                    <><Bot size={14} /> <span className="hidden lg:inline">Robô IA</span></>
                  )}
                </button>

                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className={`p-2 rounded-lg transition-all ${showDetails ? 'text-blue-600 bg-blue-50 border border-blue-100' : 'text-slate-400 hover:bg-slate-50 border border-transparent'}`}
                  title={showDetails ? "Esconder Detalhes" : "Mostrar Detalhes"}
                >
                  <Info size={18} />
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Phone size={18} /></button>
                  <button 
                    onClick={() => handleDeleteThread(activeThread)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Excluir conversa"
                  >
                    <Trash size={18} />
                  </button>
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
                  {messages
                    .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
                    .map(msg => (
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
            <div className="p-2 border-t border-slate-200 bg-[#f0f2f5] shrink-0 relative">
              {showSlashMenu && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[60]">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Bot size={12}/> Respostas Rápidas</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {quickReplies.filter(r => 
                      r.title.toLowerCase().includes(slashFilter) || r.content.toLowerCase().includes(slashFilter)
                    ).slice(0, 6).map((reply, idx) => (
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
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{reply.content}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="p-2 text-slate-500 hover:text-blue-600 transition-all"
                  title="Anexar"
                >
                  <Paperclip size={22} />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />

                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} 
                  className="flex-1 flex items-center gap-2 bg-white rounded-full px-4 py-1 border border-slate-200"
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
                      if (e.key === 'Enter' && !e.shiftKey) { 
                        e.preventDefault(); 
                        handleSendMessage(); 
                      } 
                    }} 
                    placeholder="Mensagem"
                    className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] py-2 resize-none max-h-32 min-h-[40px]" 
                  />
                  <div className="flex items-center gap-1">
                    <button 
                      type="button" 
                      onClick={() => setIsPrivateNoteMode(!isPrivateNoteMode)} 
                      className={`p-1.5 transition-all ${isPrivateNoteMode ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Lock size={18} />
                    </button>
                  </div>
                </form>

                {messageText.trim() ? (
                  <button 
                    type="submit" 
                    onClick={handleSendMessage}
                    className="w-11 h-11 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-md shrink-0"
                  >
                    <Send size={18} className="ml-0.5" />
                  </button>
                ) : (
                  <VoiceRecorder onStop={handleSendVoice} />
                )}
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
              
              {/* Contexto da Conversa: Status, Prioridade e Atribuição */}
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Bookmark size={14} className="text-blue-500" /> Contexto do Ticket
                </h4>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Prioridade</label>
                    <select 
                      value={activeThread.priority || 'normal'}
                      onChange={async (e) => {
                        const val = e.target.value as any;
                        await supabase.from('threads').update({ priority: val }).eq('id', activeThread.id);
                        setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, priority: val } : t));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg text-[13px] px-3 py-2 font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    >
                      <option value="low">Baixa 🟢</option>
                      <option value="normal">Normal ⚪</option>
                      <option value="high">Alta 🔴</option>
                      <option value="urgent">Urgente 🔥</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Atribuído a</label>
                    <select 
                      value={activeThread.assignedTo || ''}
                      onChange={async (e) => {
                        const val = e.target.value || null;
                        await supabase.from('threads').update({ assigned_to: val }).eq('id', activeThread.id);
                        setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, assignedTo: val } : t));
                        toast.success(val ? 'Conversa atribuída!' : 'Atribuição removida.');
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg text-[13px] px-3 py-2 font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    >
                      <option value="">Não atribuído</option>
                      <option value={user?.id || 'me'}>Você ({user?.email?.split('@')[0]})</option>
                      {professionals.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Equipe)</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Etiquetas (Labels) */}
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Tag size={14} className="text-blue-500" /> Etiquetas
                </h4>
                <div className="flex flex-wrap gap-2 mb-3">
                  {activeThread.labels && activeThread.labels.length > 0 ? (
                    activeThread.labels.map((label, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-lg text-[11px] font-bold text-blue-700 group">
                        {label}
                        <button 
                          onClick={async () => {
                            const newLabels = activeThread.labels!.filter(l => l !== label);
                            await supabase.from('threads').update({ labels: newLabels }).eq('id', activeThread.id);
                            setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, labels: newLabels } : t));
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400 font-medium">Nenhuma etiqueta</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Adicionar..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg text-[12px] px-3 py-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && (!activeThread.labels || !activeThread.labels.includes(val))) {
                          const newLabels = [...(activeThread.labels || []), val];
                          await supabase.from('threads').update({ labels: newLabels }).eq('id', activeThread.id);
                          setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, labels: newLabels } : t));
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>

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

      {/* Mobile Bottom Navigation */}
      {isFullscreen && (
        <div className={`md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 items-center justify-around z-50 px-2
          ${selectedThreadId ? 'hidden' : 'flex'}`}>
          <button 
            onClick={() => { setActiveTab('conversations'); setSelectedThreadId(null); }}
            className={`flex flex-col items-center gap-1 ${activeTab === 'conversations' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <MessageCircle size={24} fill={activeTab === 'conversations' ? 'currentColor' : 'none'} className={activeTab === 'conversations' ? 'opacity-20' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Conversas</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('contacts')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'contacts' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <Users size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Contatos</span>
          </button>

          <button 
            onClick={() => setActiveTab('integrations')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'integrations' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <Layers size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Integrações</span>
          </button>

          <button 
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'reports' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <BarChart3 size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Analytics</span>
          </button>
        </div>
      )}
    </div>
  );
}
