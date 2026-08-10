import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, Suspense, lazy } from 'react';
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
  Layers,
  Star,
  Ban,
  Smile,
  Edit2,
  Globe,
  Instagram,
  Download,
  MessageSquare,
  ChevronDown,
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Image as ImageIcon,
  MessageSquarePlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import { User as SupabaseUser } from '@supabase/supabase-js';

import { sendMessage, SendMessageError } from '../services/whatsappService';
import MetaTemplatesModal from './MetaTemplatesModal';
import { getMetaStatus } from '../services/supabaseService';
import { listQuickReplies, type QuickReply, listProfessionals, type Professional, updateContact } from '../services/supabaseService';
import { notificationService } from '../services/notificationService';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';
import { ContactAvatar } from './ContactAvatar';

// Code splitting: estas abas só carregam quando o usuário navega para elas
const Finance = lazy(() => import('./Finance'));
const Contacts = lazy(() => import('./Contacts'));
const KanbanBoard = lazy(() => import('./KanbanBoard'));
const ReportsDashboard = lazy(() => import('./ReportsDashboard'));
const Integrations = lazy(() => import('./Integrations'));
const QuickReplies = lazy(() => import('./QuickReplies'));

const LazyFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50">
    <Loader2 size={28} className="animate-spin text-primary-500" />
  </div>
);

interface Thread {
  id: string;
  contactId?: string;
  name: string;
  lastMessage: string;
  time: string;
  status: 'ia' | 'human';
  unreadCount?: number;
  remoteJid: string;
  updatedAt: any;
  lastMessageTime?: number;
  ticketStatus: 'open' | 'resolved';
  funilStatus: string;
  is_client?: boolean;
  priority?: string;
  profilePictureUrl?: string;
  profilePictureUpdatedAt?: string;
  pending_followup?: {
    message: string;
    scheduled_at: string;
    type: 'ai' | 'manual';
  };
  ad_tracking?: any;
  assignedTo?: string | null;
  agentId?: string | null;
  labels?: string[];
  lastInboundAt?: number;
}

const FUNIL_COMPAT: Record<string, string> = {
  'Lead': 'novo_lead',
  'Qualificado': 'qualificado',
  'Agendado': 'agendamento',
  'Resolvido': 'cliente',
};
function normFunil(s?: string | null): string {
  if (!s) return 'novo_lead';
  return FUNIL_COMPAT[s] ?? s;
}

// ── Meta 24h Window ────────────────────────────────────────────────────────────
// Apos 24h sem mensagem do cliente, o Meta rejeita mensagens livres (131047) e
// so templates aprovados podem ser enviados. Calcula estado e tempo restante.
type WindowState = 'never' | 'open' | 'safe' | 'warning' | 'urgent' | 'closed';

interface WindowInfo {
  state: WindowState;
  msLeft: number;
  hoursLeft: number;
  minutesLeft: number;
  label: string;       // formato "Xh Ym" ou "Xm"
}

function computeWindow(lastInboundMs: number | undefined, nowMs: number = Date.now()): WindowInfo {
  if (!lastInboundMs) {
    return { state: 'never', msLeft: 0, hoursLeft: 0, minutesLeft: 0, label: '—' };
  }
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const elapsed = nowMs - lastInboundMs;
  const msLeft = Math.max(0, WINDOW_MS - elapsed);
  const hoursLeft = msLeft / (1000 * 60 * 60);
  const minutesLeft = Math.floor(msLeft / 60000);

  let state: WindowState;
  if (msLeft === 0)              state = 'closed';
  else if (hoursLeft < 1)        state = 'urgent';
  else if (hoursLeft < 3)        state = 'warning';
  else if (hoursLeft < 6)        state = 'safe';
  else                            state = 'open';

  // Formato compacto
  let label: string;
  if (msLeft === 0)              label = 'fechada';
  else if (hoursLeft >= 1)       label = `${Math.floor(hoursLeft)}h ${minutesLeft % 60}m`;
  else                           label = `${minutesLeft}m`;

  return { state, msLeft, hoursLeft, minutesLeft, label };
}

// Componente leve que recalcula a janela a cada 30s — suficiente para countdown
// de 24h sem virar fogo de palha no event loop.
const WindowCountdown: React.FC<{
  lastInboundAt?: number;
  variant: 'badge' | 'panel' | 'banner';
  onTemplatesClick?: () => void;
}> = ({ lastInboundAt, variant, onTemplatesClick }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);
  const info = useMemo(() => computeWindow(lastInboundAt, now), [lastInboundAt, now]);

  // Badge: aparece somente em estados criticos para nao poluir a lista
  if (variant === 'badge') {
    if (info.state === 'open' || info.state === 'safe' || info.state === 'never') return null;
    const colors: Record<WindowState, string> = {
      never:   '',
      open:    '',
      safe:    '',
      warning: 'bg-amber-100 text-amber-700 border-amber-200',
      urgent:  'bg-orange-100 text-orange-700 border-orange-200 animate-pulse',
      closed:  'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span
        title={info.state === 'closed' ? 'Janela 24h fechada — precisa template' : `Janela 24h: ${info.label} restantes`}
        className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${colors[info.state]}`}
      >
        {info.state === 'closed' ? '24h ⚠' : info.label}
      </span>
    );
  }

  // Panel: bloco no painel direito do lead — sempre visivel quando inbound existe
  if (variant === 'panel') {
    if (info.state === 'never') {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] text-slate-600">
          <p className="font-black uppercase tracking-widest text-[10px] text-slate-400 mb-1">Janela WhatsApp</p>
          <p>Cliente ainda não enviou mensagem.</p>
        </div>
      );
    }
    const tone: Record<WindowState, string> = {
      never:   '',
      open:    'bg-emerald-50 border-emerald-200 text-emerald-800',
      safe:    'bg-sky-50 border-sky-200 text-sky-800',
      warning: 'bg-amber-50 border-amber-200 text-amber-800',
      urgent:  'bg-orange-50 border-orange-200 text-orange-800',
      closed:  'bg-red-50 border-red-200 text-red-800',
    };
    const headline: Record<WindowState, string> = {
      never:   '',
      open:    'Janela aberta',
      safe:    'Janela aberta',
      warning: 'Atenção: pouco tempo',
      urgent:  'Urgente: <1h restante',
      closed:  'Janela fechada',
    };
    return (
      <div className={`rounded-xl border px-4 py-3 ${tone[info.state]}`}>
        <p className="font-black uppercase tracking-widest text-[10px] mb-1 opacity-70">Janela WhatsApp 24h</p>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold">{headline[info.state]}</span>
          <span className="text-base font-black tabular-nums">{info.label}</span>
        </div>
        {info.state === 'closed' && onTemplatesClick && (
          <button
            onClick={onTemplatesClick}
            className="mt-2 w-full px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-red-100"
          >
            Enviar template
          </button>
        )}
      </div>
    );
  }

  // Banner: aparece acima do input apenas em warning / urgent / closed
  if (info.state === 'open' || info.state === 'safe') return null;
  const banner: Record<WindowState, string> = {
    never:   'bg-red-50 border-red-200 text-red-800',
    open:    '',
    safe:    '',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    urgent:  'bg-orange-50 border-orange-200 text-orange-800',
    closed:  'bg-red-50 border-red-200 text-red-800',
  };
  const isCriticalOrNever = info.state === 'closed' || info.state === 'never';
  return (
    <div className={`mx-2 mb-2 px-3 py-2.5 rounded-xl border text-xs flex items-start gap-2 ${banner[info.state]}`}>
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-black uppercase tracking-widest text-[10px] mb-0.5">
          {info.state === 'closed' ? 'Janela de 24h fechada'
            : info.state === 'never' ? 'Cliente nunca enviou mensagem'
            : info.state === 'urgent' ? `Janela fechando em ${info.label}`
            : `Janela fechando em ${info.label}`}
        </p>
        <p className="text-[11px] leading-snug">
          {isCriticalOrNever
            ? 'Mensagens livres serão rejeitadas pela Meta. Use um template aprovado.'
            : `Após esse tempo só templates aprovados pelo Meta poderão ser enviados.`}
        </p>
      </div>
      {isCriticalOrNever && onTemplatesClick && (
        <button
          onClick={onTemplatesClick}
          className="px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all"
        >
          Templates
        </button>
      )}
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  
  // Zera as horas para comparação apenas de data
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (msgDate.getTime() === today.getTime()) {
    return 'Hoje';
  } else if (msgDate.getTime() === yesterday.getTime()) {
    return 'Ontem';
  }
  
  // Se for nos últimos 6 dias, mostra o dia da semana
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString('pt-BR', { weekday: 'long' })
      .replace(/^\w/, (c) => c.toUpperCase()); // Capitaliza primeira letra
  }
  
  // Fallback para data completa
  return date.toLocaleDateString('pt-BR');
};

function renderFormattedText(text: string, query?: string) {
  if (!text) return '';

  let parts: { type: 'text' | 'bold' | 'italic' | 'strike' | 'code'; text: string }[] = [{ type: 'text', text }];

  const rules = [
    { type: 'code' as const, regex: /```([\s\S]*?)```/g },
    { type: 'bold' as const, regex: /\*([^\*]+?)\*/g },
    { type: 'italic' as const, regex: /_([^_]+?)_/g },
    { type: 'strike' as const, regex: /~([^~]+?)~/g }
  ];

  for (const rule of rules) {
    const newParts: typeof parts = [];
    for (const part of parts) {
      if (part.type !== 'text') {
        newParts.push(part);
        continue;
      }

      let lastIndex = 0;
      let match;
      rule.regex.lastIndex = 0;

      while ((match = rule.regex.exec(part.text)) !== null) {
        if (match.index > lastIndex) {
          newParts.push({ type: 'text', text: part.text.substring(lastIndex, match.index) });
        }
        newParts.push({ type: rule.type, text: match[1] });
        lastIndex = rule.regex.lastIndex;
      }

      if (lastIndex < part.text.length) {
        newParts.push({ type: 'text', text: part.text.substring(lastIndex) });
      }
    }
    parts = newParts;
  }

  const renderTextWithHighlight = (txt: string, q?: string) => {
    if (!q || !q.trim()) return txt;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const segments = txt.split(regex);
    return segments.map((seg, i) =>
      seg.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className="bg-yellow-300 text-slate-900 rounded px-0.5">{seg}</mark>
        : seg
    );
  };

  return parts.map((part, index) => {
    const content = renderTextWithHighlight(part.text, query);
    switch (part.type) {
      case 'bold':
        return <strong key={index} className="font-bold">{content}</strong>;
      case 'italic':
        return <em key={index} className="italic">{content}</em>;
      case 'strike':
        return <del key={index} className="line-through">{content}</del>;
      case 'code':
        return <code key={index} className="font-mono bg-black/5 px-1 rounded text-xs">{content}</code>;
      default:
        return <span key={index}>{content}</span>;
    }
  });
}


const PAGE_SIZE = 50;

const formatMsgRow = (d: any): Message => ({
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
  is_external: d.is_external,
  reaction: d.reaction,
  whatsapp_id: d.whatsapp_id,
  status: d.status,
  is_starred: d.is_starred || false,
  quoted_id: d.quoted_id,
  quoted_text: d.quoted_text,
  contact_jid: d.contact_jid,
});

const formatPhone = (phone: string) => {
  const p = phone.replace(/\D/g, '');
  if (p.length === 13) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,9)}-${p.slice(9)}`;
  if (p.length === 12) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,8)}-${p.slice(8)}`;
  if (p.length === 11) return `(${p.slice(0,2)}) ${p.slice(2,7)}-${p.slice(7)}`;
  return phone;
};

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
  reaction?: string;
  quoted_id?: string;
  quoted_text?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'sending';
  is_starred?: boolean;
  whatsapp_id?: string;
  contact_jid?: string;
}



const AudioPlayer: React.FC<{ url: string, isOutbound: boolean }> = ({ url, isOutbound }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.playbackRate = playbackRate; // Mantém a velocidade se mudar o áudio
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

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  return (
    <div className={`flex items-center gap-3 py-1.5 px-3 rounded-2xl min-w-[240px] mb-1 relative group/audio
      ${isOutbound ? 'bg-white/10' : 'bg-primary-50/50'}`}>
      
      <button 
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm shrink-0
          ${isOutbound ? 'bg-white text-primary-600' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1.5">
        <div className="h-1 bg-black/10 rounded-full overflow-hidden cursor-pointer" 
             onClick={(e) => {
               e.stopPropagation();
               if (!audioRef.current || !duration) return;
               const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
               const x = e.clientX - rect.left;
               const pct = x / rect.width;
               audioRef.current.currentTime = pct * duration;
             }}>
          <motion.div 
            className={`h-full ${isOutbound ? 'bg-white' : 'bg-primary-600'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "tween", ease: "linear", duration: 0.1 }}
          />
        </div>
        <div className={`flex justify-between text-[9px] font-black uppercase tracking-tighter
          ${isOutbound ? 'text-primary-100' : 'text-slate-400'}`}>
          <div className="flex items-center gap-2">
             <span>{playing ? 'Reproduzindo' : 'Mensagem de voz'}</span>
             {playing && <span className="flex gap-0.5 items-center h-2">
                {[0,1,2].map(i => (
                  <motion.span 
                    key={i}
                    animate={{ height: [2, 6, 2] }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                    className={`w-0.5 rounded-full ${isOutbound ? 'bg-white' : 'bg-primary-600'}`} 
                  />
                ))}
             </span>}
          </div>
          <span>{duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '--:--'}</span>
        </div>
      </div>

      {/* Speed Selector (WhatsApp Style) */}
      <button 
        onClick={toggleSpeed}
        className={`ml-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all shrink-0 border shadow-sm
          ${isOutbound 
            ? 'bg-white border-primary-100 text-primary-700 hover:bg-primary-50' 
            : 'bg-white border-primary-100 text-primary-700 hover:bg-primary-50'}`}

      >
        {playbackRate}x
      </button>
    </div>
  );
};


const VoiceRecorder: React.FC<{ onStop: (blob: Blob) => void, onRecordingChange?: (isRecording: boolean) => void }> = ({ onStop, onRecordingChange }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelledRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus') 
        ? 'audio/ogg; codecs=opus' 
        : 'audio/webm; codecs=opus';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      isCancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!isCancelledRef.current && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          onStop(audioBlob);
        }
        // Cleanup stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      recorder.start(200);
      setIsRecording(true);
      onRecordingChange?.(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      toast.error('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      isCancelledRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      onRecordingChange?.(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      isCancelledRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      onRecordingChange?.(false);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.error('Gravação cancelada');
    }
  };

  if (isRecording) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-between md:justify-start w-full md:w-auto gap-1 md:gap-3 bg-white px-2 md:px-4 py-1.5 rounded-[26px] border border-slate-200 shadow-sm"
      >
        <button 
          onClick={cancelRecording}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          title="Cancelar gravação"
        >
          <Trash2 size={20} />
        </button>

        <div className="flex-1 md:flex-initial flex items-center justify-center gap-2 md:gap-3 px-2 md:px-4 border-x border-slate-100">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          <span className="text-slate-700 text-[10px] md:text-xs font-black font-mono w-8 md:w-10">
            {Math.floor(recordingTime / 60)}:{Math.floor(recordingTime % 60).toString().padStart(2, '0')}
          </span>
          
          <div className="flex gap-0.5 items-center w-8 md:w-16 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <motion.div 
                key={i}
                className="w-0.5 bg-primary-400 rounded-full"
                animate={{ height: [4, 12, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </div>
        </div>

        <button 
          onClick={stopAndSend}
          className="p-2.5 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-500/20 hover:bg-primary-700 active:scale-95 transition-all"
          title="Enviar áudio"
        >
          <Send size={18} />
        </button>
      </motion.div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      className="w-11 h-11 md:w-[52px] md:h-[52px] bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 transition-all duration-300 shadow-lg shadow-emerald-500/20 active:scale-90 shrink-0"
      title="Gravar áudio"
    >
      <Mic size={20} className="md:size-[22px]" />
    </button>
  );
};

const ContactItem: React.FC<{ thread: Thread, active: boolean, showWindow?: boolean, lastInboundAtOverride?: number, onClick: () => void, onDelete: (e: React.MouseEvent) => void }> = ({ thread, active, showWindow, lastInboundAtOverride, onClick, onDelete }) => (
  <div 
    onClick={onClick}
    className={`p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 border-b border-slate-100 last:border-0 relative group
      ${active ? 'bg-slate-50/80 border-l-2 border-emerald-500' : 'hover:bg-slate-50/50 border-l-2 border-transparent'}`}
  >
    <div className="relative shrink-0">
      <ContactAvatar url={thread.profilePictureUrl} name={thread.name} size="lg" threadId={thread.id} />
      {thread.status === 'ia' && (
        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-primary-500 border-2 border-white rounded-full z-10" />
      )}
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <h4 className={`text-[15px] truncate flex items-center gap-2
          ${(thread.unreadCount ?? 0) > 0 ? "font-black text-slate-900" : "font-medium text-slate-600"}`}>
          {/^\d+$/.test(thread.name) ? formatPhone(thread.name) : thread.name}
          {thread.is_client && <Star size={12} className="fill-amber-500 text-amber-500 shrink-0" />}
          {thread.priority === 'urgent' && <span className="text-xs" title="Urgente">🔥</span>}
          {thread.priority === 'high' && <span className="text-xs" title="Alta">🔴</span>}
          {showWindow && <WindowCountdown lastInboundAt={lastInboundAtOverride ?? thread.lastInboundAt} variant="badge" />}
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
      
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[10px] text-slate-400 font-mono truncate">
          {thread.remoteJid.split('@')[0]}
        </span>
        {thread.labels && thread.labels.slice(0, 2).map((lbl, i) => (
          <span key={i} className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 border border-primary-100 shrink-0 leading-none">
            {lbl}
          </span>
        ))}
        {thread.labels && thread.labels.length > 2 && (
          <span className="text-[9px] font-bold text-slate-400 shrink-0">+{thread.labels.length - 2}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className={(thread.unreadCount ?? 0) > 0 
          ? "text-[13px] truncate leading-tight flex-1 mr-2 font-bold text-slate-900" 
          : "text-[13px] truncate leading-tight flex-1 mr-2 font-normal text-slate-500"}>
          {thread.lastMessage || 'Inicie uma conversa'}
        </p>
        {(thread as any).isTyping ? (
          <span className="text-[10px] text-emerald-500 font-bold animate-pulse shrink-0">
            Digitando...
          </span>
        ) : (thread.unreadCount ?? 0) > 0 && (
          <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-sm">
            {thread.unreadCount}
          </span>
        )}
      </div>
    </div>
  </div>
);

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-300 text-slate-900 rounded px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

const TypingIndicator: React.FC = () => (
  <div className="flex items-start mb-1.5">
    <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-white border border-slate-200/50 shadow-sm rounded-tl-none flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  </div>
);

type ChatBubbleProps = {
  message: Message;
  onPreview: (media: any) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onStar: (messageId: string, currentStatus: boolean) => void;
  onOpenContact: (jid: string) => void;
  onImageLoad?: () => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onSelect?: (id: string) => void;
  onForward?: (msg: Message) => void;
  highlightQuery?: string;
};

const ChatBubbleInner: React.FC<ChatBubbleProps> = ({ message, onPreview, onDelete, onReact, onReply, onStar, onOpenContact, onImageLoad, isSelected, isSelectionMode, onSelect, onForward, highlightQuery }) => {
  const isLead = message.sender === 'lead';
  const isPrivate = message.sender === 'private';
  const isExternal = message.is_external;
  const isRevoked = message.message_type === 'revoked';

  const [showMobileActions, setShowMobileActions] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setShowMobileActions(true);
      if (window.navigator?.vibrate) window.navigator.vibrate(30);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!showMobileActions) return;
    const timer = setTimeout(() => {
      const close = () => setShowMobileActions(false);
      document.addEventListener('touchstart', close, { once: true });
      return () => document.removeEventListener('touchstart', close);
    }, 150);
    return () => clearTimeout(timer);
  }, [showMobileActions]);
  
  const renderMediaContent = () => {
    if (isRevoked) {
      return (
        <div className="flex items-center gap-2 italic opacity-50 py-1">
          <Ban size={14} />
          <span className="text-[13px]">Esta mensagem foi apagada</span>
        </div>
      );
    }

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
            <div className="rounded-lg overflow-hidden border border-black/5 bg-black/5 cursor-pointer hover:opacity-95 transition-opacity min-w-[120px]"
                 onClick={() => message.media_url && onPreview({ url: message.media_url, type: 'image', name: message.media_filename })}>
              {message.media_url ? (
                <img
                  src={message.media_url}
                  alt="Imagem"
                  loading="lazy"
                  decoding="async"
                  className="max-w-full max-h-[300px] object-contain"
                  onLoad={() => { if (onImageLoad) onImageLoad(); }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`flex flex-col items-center justify-center gap-2 p-6 text-slate-400 ${message.media_url ? 'hidden' : ''}`}>
                <ImageIcon size={32} className="opacity-40" />
                <span className="text-[11px]">Imagem indisponível</span>
              </div>
            </div>
            {message.caption && <p className="whitespace-pre-wrap">{message.caption}</p>}
          </div>
        );


      case 'video':
        return (
          <div className="space-y-2">
            <div className="rounded-lg overflow-hidden border border-black/5 bg-black/5 cursor-pointer hover:opacity-95 transition-opacity relative group/video"
                 onClick={() => onPreview({ url: message.media_url, type: 'video', name: message.media_filename })}>
              <video className="max-w-full max-h-[300px]" preload="none" playsInline>
                <source src={message.media_url} type={message.media_mime_type} />
              </video>
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/video:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                  <Play size={24} className="fill-white ml-1" />
                </div>
              </div>
            </div>
            {message.caption && <p className="whitespace-pre-wrap">{message.caption}</p>}
          </div>
        );

      case 'document':
        return (
          <div onClick={() => onPreview({ url: message.media_url, type: 'document', name: message.media_filename })}
             className="flex items-center gap-3 p-3 bg-black/5 rounded-xl hover:bg-black/10 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-white shrink-0">
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
          </div>
        );

      case 'sticker':
        return (
          <div className="w-32 h-32">
            <img src={message.media_url} alt="Sticker" loading="lazy" decoding="async" className="w-full h-full object-contain" />
          </div>
        );

      case 'contact':
        return (
          <div className="flex flex-col gap-2 p-1 min-w-[200px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 border border-primary-100">
                <User size={20} />
              </div>
              <p className="font-bold text-sm text-slate-800">{message.text}</p>
            </div>
            {message.contact_jid && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenContact(message.contact_jid!);
                }}
                className="w-full mt-2 py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
              >
                <MessageSquare size={14} /> Conversar
              </button>
            )}
          </div>
        );

      case 'location':
        return (
          <div className="space-y-2">
             <div className="flex items-center gap-2 text-primary-600 font-bold">
               <MapPin size={16} /> Localização enviada
             </div>
             <p className="text-xs">{message.text}</p>
             <a href={`https://www.google.com/maps/search/?api=1&query=${message.text.split(': ')[1]}`} target="_blank" className="text-primary-500 underline text-xs">
               Ver no mapa
             </a>
          </div>
        );

      default:
        return (
          <p className="whitespace-pre-wrap break-all leading-relaxed">
            {renderFormattedText(
              message.text || (message.message_type === 'unknown' ? '[Mídia não suportada]' : ''),
              highlightQuery
            )}
          </p>
        );
    }
  };
  
  return (
    <div
      className={`flex flex-col mb-1.5 group ${!isLead ? 'items-end' : 'items-start'} relative overflow-hidden transition-colors ${isSelected ? 'bg-primary-50/60 rounded-2xl' : ''}`}
      onTouchStart={isSelectionMode ? undefined : handleTouchStart}
      onTouchEnd={isSelectionMode ? undefined : handleTouchEnd}
      onTouchMove={isSelectionMode ? undefined : handleTouchEnd}
      onClick={isSelectionMode ? () => onSelect?.(message.id) : undefined}
    >
      {/* Long press mobile action sheet */}
      <AnimatePresence>
        {showMobileActions && !isRevoked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex flex-col justify-end"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileActions(false)} />
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="relative bg-white rounded-t-3xl px-4 pt-4 pb-8 shadow-2xl"
            >
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
              {/* Emoji rápido */}
              <div className="flex justify-around mb-4 px-2">
                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(message.id, emoji); setShowMobileActions(false); }}
                    className="text-3xl active:scale-110 transition-transform p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="h-px bg-slate-100 mb-2" />
              {/* Ações */}
              <button
                onClick={() => { onReply(message); setShowMobileActions(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 rounded-2xl transition-all text-left"
              >
                <ChevronLeft size={20} className="rotate-180 text-primary-600 shrink-0" />
                <span className="text-[15px] font-semibold text-slate-800">Responder</span>
              </button>
              <button
                onClick={() => { onStar(message.id, !!message.is_starred); setShowMobileActions(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 rounded-2xl transition-all text-left"
              >
                <Star size={20} className={message.is_starred ? 'fill-amber-500 text-amber-500 shrink-0' : 'text-slate-400 shrink-0'} />
                <span className="text-[15px] font-semibold text-slate-800">
                  {message.is_starred ? 'Remover dos favoritos' : 'Favoritar'}
                </span>
              </button>
              {onForward && (
                <button
                  onClick={() => { onForward(message); setShowMobileActions(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 rounded-2xl transition-all text-left"
                >
                  <ChevronRight size={20} className="text-primary-600 shrink-0" />
                  <span className="text-[15px] font-semibold text-slate-800">Encaminhar</span>
                </button>
              )}
              {onSelect && (
                <button
                  onClick={() => { onSelect(message.id); setShowMobileActions(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 rounded-2xl transition-all text-left"
                >
                  <CheckCircle2 size={20} className="text-slate-400 shrink-0" />
                  <span className="text-[15px] font-semibold text-slate-800">Selecionar</span>
                </button>
              )}
              <button
                onClick={() => { onDelete(message.id); setShowMobileActions(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 active:bg-red-100 rounded-2xl transition-all text-left"
              >
                <Trash size={20} className="text-red-500 shrink-0" />
                <span className="text-[15px] font-semibold text-red-500">Apagar</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Reply Icon (appears when dragging) */}
      <div className={`absolute inset-y-0 left-0 flex items-center pl-6 pointer-events-none text-primary-500 opacity-0 group-active:opacity-100 transition-opacity`}>
        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
          <ChevronLeft size={20} className="rotate-180" />
        </div>
      </div>

      <motion.div 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        onDragEnd={(_e, info) => {
          if (info.offset.x > 50) {
            onReply(message);
            if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
              window.navigator.vibrate(15);
            }
          }
        }}
        onDoubleClick={() => onReply(message)}
        whileDrag={{ scale: 1.02 }}
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-[14.5px] leading-relaxed shadow-sm relative break-words z-10 cursor-grab active:cursor-grabbing
        ${isRevoked
          ? 'bg-slate-50 text-slate-400 border border-slate-100 italic'
          : isPrivate 
            ? 'bg-amber-100 text-amber-900 border border-amber-200' 
            : !isLead 
              ? 'bg-[#dcf8c6] text-slate-800 rounded-tr-none' 
              : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/50'}`}>
        
        {message.quoted_text && (
          <div className={`mb-2 p-2 rounded-lg border-l-4 text-xs truncate max-w-full
            ${!isLead ? 'bg-black/5 border-primary-500 text-slate-600' : 'bg-slate-50 border-primary-500 text-slate-500'}`}>
            {message.quoted_text}
          </div>
        )}

        {isPrivate && (
          <div className="flex items-center gap-1.5 mb-1 text-amber-600 font-bold text-[9px] uppercase" title="Esta é uma nota interna visível apenas para você">
            <Lock size={9} /> Nota Privada
          </div>
        )}

        {message.is_starred && (
          <div className={`absolute top-1.5 ${isLead ? '-right-1' : '-left-1'} bg-white rounded-full p-0.5 shadow-sm border border-slate-100 z-10`}>
            <Star size={10} className="fill-amber-500 text-amber-500" />
          </div>
        )}
        
        {renderMediaContent()}

        {!isRevoked && (
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-all z-10 hidden md:block">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete(message.id);
              }}
              className="p-1 bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white transition-all"
              title="Apagar mensagem"
            >
              <Trash size={14} />
            </button>
          </div>
        )}

        <div className={`flex items-center gap-1 mt-1 text-[10px] opacity-50 justify-end ${!isLead && !isRevoked ? 'text-[#075e54]' : 'text-slate-400'}`}>
          {isExternal && !isLead && !isRevoked && <Smartphone size={10} className="mr-0.5" />}
          {message.time}
          {!isLead && !isPrivate && !isRevoked && (
            <>
              {(message as any).status === 'read' ? (
                <CheckCheck size={14} className="ml-1 text-[#34b7f1]" />
              ) : (message as any).status === 'delivered' ? (
                <CheckCheck size={14} className="ml-1 text-slate-400" />
              ) : (message as any).status === 'sent' ? (
                <Check size={14} className="ml-1 text-slate-400" />
              ) : (
                <Clock size={10} className="ml-1 text-slate-400" />
              )}
            </>
          )}
        </div>

        {message.reaction && (
          <div className={`absolute -bottom-2 ${isLead ? 'right-0' : 'left-0'} bg-white border border-slate-100 rounded-full px-1 py-0.5 shadow-sm text-[12px] z-20 animate-in zoom-in-50 duration-200`}>
            {message.reaction}
          </div>
        )}
      </motion.div>

      {!isRevoked && (
        <div className={`hidden md:flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all px-2 ${!isLead ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className="relative group/emoji">
            <button 
              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              title="Reagir"
            >
              <Smile size={14} />
            </button>
            <div className={`absolute bottom-full mb-2 ${isLead ? 'left-0' : 'right-0'} bg-white border border-slate-200 rounded-2xl shadow-xl p-2 hidden group-focus-within/emoji:grid grid-cols-6 gap-1.5 z-[100] animate-in slide-in-from-bottom-2 duration-200 min-w-[220px]`}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '💡', '✅', '❌', '🚀', '👀', '🤔', '💯', '⭐', '🤝'].map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-xl transition-all text-[18px] hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          
          <button 
            onClick={() => onStar(message.id, !!message.is_starred)}
            className={`p-1.5 rounded-lg transition-all ${message.is_starred ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}
            title={message.is_starred ? "Remover dos favoritos" : "Favoritar"}
          >
            <Star size={14} className={message.is_starred ? "fill-amber-500" : ""} />
          </button>
          
          <button 
            onClick={() => onReply(message)}
            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
            title="Responder"
          >
            <ChevronLeft size={14} className="rotate-180" />
          </button>
          
          <button 
            onClick={() => onDelete(message.id)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Apagar"
          >
            <Trash size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

const ChatBubble = React.memo(ChatBubbleInner, (prev, next) => {
  const pm = prev.message;
  const nm = next.message;
  return (
    pm.id === nm.id &&
    pm.text === nm.text &&
    (pm as any).status === (nm as any).status &&
    pm.is_starred === nm.is_starred &&
    pm.reaction === nm.reaction &&
    pm.message_type === nm.message_type &&
    pm.media_url === nm.media_url &&
    pm.quoted_text === nm.quoted_text &&
    prev.isSelected === next.isSelected &&
    prev.isSelectionMode === next.isSelectionMode &&
    prev.highlightQuery === next.highlightQuery
  );
});

const TrackingModal: React.FC<{
  isOpen: boolean, 
  onClose: () => void, 
  trackingData: any 
}> = ({ isOpen, onClose, trackingData }) => {
  if (!isOpen || !trackingData) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white">
              <Globe size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 leading-tight">Rastreamento de Origem</h3>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Informações de onde o contato veio</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Main Card */}
          <div className="bg-gradient-to-br from-primary-50/50 to-white border border-primary-100 rounded-3xl p-6 relative overflow-hidden">
             <div className="flex items-start gap-4 relative z-10">
                <div className="w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center shrink-0 border border-slate-100">
                   {trackingData.source === 'Meta Ads' ? (
                     <Instagram className="text-pink-600" size={32} />
                   ) : (
                     <Globe className="text-primary-600" size={32} />
                   )}
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-primary-600 text-white text-[9px] font-black uppercase rounded-md tracking-widest">
                        {trackingData.source || 'Plataforma'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">Origem do contato</span>
                   </div>
                   <h4 className="text-lg font-black text-slate-900 leading-tight mb-2">
                     {trackingData.headline || 'Campanha Direta'}
                   </h4>
                   <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                     {trackingData.body || 'O lead iniciou uma conversa através de um link direto ou anúncio sem descrição adicional.'}
                   </p>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                   <Layers size={14} />
                   <span className="text-[9px] font-black uppercase tracking-widest">Plataforma</span>
                </div>
                <p className="text-sm font-bold text-slate-800">{trackingData.source || 'Instagram / Facebook'}</p>
             </div>
             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                   <Bot size={14} />
                   <span className="text-[9px] font-black uppercase tracking-widest">Campanha</span>
                </div>
                <p className="text-sm font-bold text-slate-800 truncate">{trackingData.headline || 'N/A'}</p>
             </div>
          </div>

          {trackingData.sourceUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 px-1">
                 <ExternalLink size={14} />
                 <span className="text-[9px] font-black uppercase tracking-widest">Link do Anúncio</span>
              </div>
              <div className="p-4 bg-primary-50/30 border border-primary-100 rounded-2xl flex items-center justify-between group cursor-pointer hover:bg-primary-50 transition-all"
                   onClick={() => window.open(trackingData.sourceUrl, '_blank')}>
                 <span className="text-xs font-medium text-primary-600 truncate flex-1 mr-4">{trackingData.sourceUrl}</span>
                 <ExternalLink size={14} className="text-primary-400 group-hover:text-primary-600" />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-400 px-1">
               <Info size={14} />
               <span className="text-[9px] font-black uppercase tracking-widest">Dados Técnicos (JSON)</span>
            </div>
            <pre className="p-4 bg-slate-900 rounded-2xl text-[10px] text-emerald-400 font-mono overflow-x-auto">
               {JSON.stringify(trackingData, null, 2)}
            </pre>
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-center">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

const FollowUpModal: React.FC<{ 
  isOpen: boolean, 
  onClose: () => void, 
  onSchedule: (message: string, delay: number, isAi: boolean) => void,
  contactName: string
}> = ({ isOpen, onClose, onSchedule, contactName }) => {
  const [message, setMessage] = useState('');
  const [delay, setDelay] = useState(60);
  const [isAi, setIsAi] = useState(true);
  const [customDelay, setCustomDelay] = useState('');

  if (!isOpen) return null;

  const options = [
    { label: '15 min', value: 15 },
    { label: '1 hora', value: 60 },
    { label: '4 horas', value: 240 },
    { label: 'Amanhã', value: 1440 },
  ];

  const isCustomActive = customDelay !== '';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Clock size={18} className="text-primary-500" />
            Agendar Follow-up
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Quanto tempo depois?</label>
            <div className="grid grid-cols-2 gap-2">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setDelay(opt.value);
                    setCustomDelay('');
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all
                    ${delay === opt.value && !isCustomActive ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-white border-slate-200 text-slate-600 hover:border-primary-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-3 relative">
               <input 
                type="number"
                placeholder="Ou digite os minutos..."
                value={customDelay}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomDelay(val);
                  if (val) setDelay(parseInt(val));
                }}
                className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none transition-all
                  ${isCustomActive ? 'border-primary-500 ring-2 ring-primary-50 bg-white' : 'border-slate-200 focus:border-primary-300'}`}
               />
               {isCustomActive && (
                 <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-primary-500 uppercase tracking-widest">minutos</span>
               )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Tipo de Mensagem</label>
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button 
                onClick={() => setIsAi(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2
                  ${isAi ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Bot size={14} /> Sofia (IA)
              </button>
              <button 
                onClick={() => setIsAi(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2
                  ${!isAi ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <MessageCircle size={14} /> Texto Fixo
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">
              {isAi ? 'Instrução para a Sofia' : 'Mensagem de Follow-up'}
            </label>
            <textarea
              placeholder={isAi ? "Ex: Seja amigável e pergunte se ele conseguiu ler a proposta..." : "Ex: Olá! Passando para saber se ficou alguma dúvida..."}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:border-primary-400 focus:ring-4 focus:ring-primary-50 outline-none transition-all resize-none"
              rows={3}
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
          <button
            onClick={() => onSchedule(message, delay, isAi)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-500/20 hover:bg-primary-700"
          >
            Confirmar Agendamento
          </button>
        </div>
      </div>
    </div>
  );
};

export default function Inbox({ user, role, isFullscreen, initialTab, onTabChange }: { user: SupabaseUser | null, role: string | null, isFullscreen?: boolean, initialTab?: 'conversations' | 'contacts' | 'kanban' | 'reports' | 'integrations' | 'quick_replies' | 'finance', onTabChange?: (tab: string, subTab?: string) => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  // Meta Cloud API state — used for the 24h re-engagement modal and provider badge
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [templatesModalTo, setTemplatesModalTo] = useState<string>('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Ativos' | 'Não Lidos' | 'Encerrados' | 'Todos'>('Ativos');
  const [filterSub, setFilterSub] = useState<'Todos' | 'Lead' | 'Em Suporte' | 'Clientes'>('Todos');
  const [filterBadge, setFilterBadge] = useState<'sem_resposta' | 'follow_up' | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [agents, setAgents] = useState<{ id: string; nome: string; company_name?: string }[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const contactsRef = useRef<any[]>([]);
  
  // States for Image Pasting (Ctrl+V)
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteCaption, setPasteCaption] = useState('');
  const [isUploadingPaste, setIsUploadingPaste] = useState(false);
  const [pastedImageUrl, setPastedImageUrl] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  // Fase 3 — search, seleção múltipla, encaminhar
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchDebounced, setMessageSearchDebounced] = useState('');
  const [searchResultIdx, setSearchResultIdx] = useState(0);

  // Debounce da busca para evitar filtrar a cada keystroke
  useEffect(() => {
    const t = setTimeout(() => setMessageSearchDebounced(messageSearchQuery), 200);
    return () => clearTimeout(t);
  }, [messageSearchQuery]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [threadsRefreshKey, setThreadsRefreshKey] = useState(0);
  const [pullDelta, setPullDelta] = useState(0);
  const [isRefreshingThreads, setIsRefreshingThreads] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const pullStartYRef = useRef(0);
  const isPullingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastThreadIdRef = useRef<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const [predefinedLabels, setPredefinedLabels] = useState<string[]>([]);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  // Restaura posição do scroll após carregar mensagens antigas (sem pular para o fundo)
  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current !== null && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight - pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
      setLoadingOlder(false);
    }
  }, [messages]);

  // Fix do teclado virtual no mobile via visualViewport API
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setViewportHeight(vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Monitor de conexão via eventos de rede do navegador
  useEffect(() => {
    const handleOnline = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setConnectionStatus('reconnecting');
      setTimeout(() => setConnectionStatus('connected'), 2000);
    };
    const handleOffline = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setConnectionStatus('disconnected');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Loads the active provider once on mount — used for the provider badge and
  // to decide whether to surface the 24h re-engagement modal on send failures.
  useEffect(() => {
    if (!user?.id) return;
    getMetaStatus()
      .then(s => setCurrentProvider(s.provider || 'evolution'))
      .catch(() => setCurrentProvider('evolution'));
  }, [user?.id]);

  const { setActiveThreadId } = useNotification();

  useEffect(() => {
    setActiveThreadId(selectedThreadId);
  }, [selectedThreadId, setActiveThreadId]);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [isPrivateNoteMode, setIsPrivateNoteMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts' | 'kanban' | 'reports' | 'integrations' | 'quick_replies' | 'finance'>(initialTab || 'conversations');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{url: string, type: string, name?: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const navigationLayerRef = useRef(0);

  // Estados para edição rápida de nome na barra lateral
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  // ─── Lógica de Busca de Fotos em Lote ──────────────────────────────────────────
  // Só busca fotos que ainda não estão cacheadas no banco (sem foto ou expiradas)
  const fetchProfilePicturesInBatch = async (threadsToSync: Thread[]) => {
    // Filtra apenas threads sem foto ou com foto expirada (>24h)
    const stale = threadsToSync.filter(t => {
      if (!t.profilePictureUrl) return true;
      if (!t.profilePictureUpdatedAt) return true;
      const ageHours = (Date.now() - new Date(t.profilePictureUpdatedAt).getTime()) / 3600000;
      return ageHours >= 24;
    });

    if (stale.length === 0) return;

    // Máximo de 5 simultâneas para não sobrecarregar a Evolution API
    const batchSize = 5;
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;

    for (let i = 0; i < stale.length; i += batchSize) {
      const chunk = stale.slice(i, i + batchSize);
      await Promise.allSettled(chunk.map(async (t) => {
        try {
          const phone = t.remoteJid.split('@')[0].replace(/\D/g, '');
          const res = await fetch(`/api/v2/contacts/profile-picture/${phone}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (!res.ok) return;
          const result = await res.json();
          if (result.success && result.url) {
            // Atualiza localmente
            setThreads(prev => prev.map(pt => pt.id === t.id ? { 
              ...pt, 
              profilePictureUrl: result.url,
              profilePictureUpdatedAt: new Date().toISOString()
            } : pt));
          }
        } catch (e) {}
      }));
      // Pequeno delay entre batches para não estrangular a API
      if (i + batchSize < stale.length) await new Promise(r => setTimeout(r, 500));
    }
  };

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
      funilStatus: normFunil(contact?.status_funil)
    };
  };

  // Handle JID from URL - Robust version
  useEffect(() => {
    const handleUrlJid = () => {
      const params = new URLSearchParams(window.location.search);
      const jid = params.get('jid');
      if (!jid || !user?.id) return;

      const cleanJid = jid.split('@')[0];
      const threadId = `${user.id}_${cleanJid}`;
      
      // Se já estivermos com essa thread selecionada, não faz nada
      if (selectedThreadIdRef.current === threadId) return;

      // Busca nas threads existentes
      const existingThread = threads.find(t => t.id === threadId || (t.remoteJid || '').split('@')[0] === cleanJid);
      
      if (existingThread) {
        setSelectedThreadId(existingThread.id);
        console.log(`[Inbox] 🔗 JID from URL selected: ${existingThread.id}`);
      } else if (threads.length > 0) {
        // Se já carregamos as threads e não achamos, criamos uma temporária
        const hasTemp = threads.some(t => (t as any).isTemp && (t.remoteJid || '').split('@')[0] === cleanJid);
        if (!hasTemp) {
          const tempThread: Thread & { isTemp?: boolean } = {
            id: threadId,
            remoteJid: `${cleanJid}@s.whatsapp.net`,
            name: cleanJid,
            lastMessage: 'Iniciar conversa...',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'human',
            updatedAt: new Date().toISOString(),
            ticketStatus: 'open',
            funilStatus: 'novo_lead',
            isTemp: true
          };

          const resolved = getResolvedContact(cleanJid, tempThread.name);
          tempThread.name = resolved.name;
          tempThread.funilStatus = resolved.funilStatus;

          setThreads(prev => [tempThread, ...prev]);
          setSelectedThreadId(threadId);
          console.log(`[Inbox] 🔗 Temp JID thread created: ${threadId}`);
        }
      }
    };

    // Executa imediatamente
    handleUrlJid();

    // E escuta mudanças na URL (popstate)
    window.addEventListener('popstate', handleUrlJid);
    return () => window.removeEventListener('popstate', handleUrlJid);
  }, [threads.length, user?.id, window.location.search]);


  const playSound = (type: 'send' | 'receive') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'send') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(1100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.07);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      }
      setTimeout(() => ctx.close(), 500);
    } catch {}
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const performScroll = () => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    };
    performScroll();
    setTimeout(performScroll, 100);
    setTimeout(performScroll, 500);
  };

  const loadOlderMessages = async () => {
    if (!hasMoreMessages || loadingOlder || !selectedThreadId) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    setLoadingOlder(true);
    const oldestTimestamp = messages[0]?.timestamp;
    if (!oldestTimestamp) { setLoadingOlder(false); return; }

    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', selectedThreadId)
        .lt('created_at', oldestTimestamp)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!data || data.length === 0) {
        setHasMoreMessages(false);
        setLoadingOlder(false);
        return;
      }

      setHasMoreMessages(data.length === PAGE_SIZE);
      // Salva scrollHeight antes de prepender — useLayoutEffect restaura após render
      pendingScrollRestoreRef.current = container.scrollHeight;
      setMessages(prev => [...[...data].reverse().map(formatMsgRow) as any, ...prev]);
    } catch (err) {
      console.error('[Inbox] Erro ao carregar mensagens antigas:', err);
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    // Se as mensagens mudarem e não estivermos carregando, rola para o fim
    if (!loadingMessages && messages.length > 0) {
      const isNewThread = lastThreadIdRef.current !== selectedThreadId;
      
      // No mobile ou troca de thread, o scroll instantâneo é melhor
      scrollToBottom(isNewThread ? "auto" : "smooth");
      
      lastThreadIdRef.current = selectedThreadId;
      setShowScrollButton(false);
    }
  }, [messages, loadingMessages, selectedThreadId]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceToBottom > 150);
    // Carrega mensagens mais antigas quando o usuário chegar perto do topo
    if (scrollTop < 120 && hasMoreMessages && !loadingOlder) {
      loadOlderMessages();
    }
  };


  // ─── Manuseio do Botão Voltar (Mobile) ─────────────────────────────────────────
  const lastBackPressRef = useRef<number>(0);

  useEffect(() => {
    const handlePopState = () => {
      if (isMobileDetailsOpen) {
        setIsMobileDetailsOpen(false);
      } else if (selectedThreadId) {
        setSelectedThreadId(null);
      } else {
        // Estamos na Camada 0 (Lista de Conversas)
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          // Segunda vez em menos de 2s, permite sair (voltando no histórico real)
          window.history.back();
        } else {
          // Primeira vez ou passou o tempo
          lastBackPressRef.current = now;
          toast('Pressione novamente para sair', {
            duration: 2000,
            position: 'bottom-center',
            style: {
              background: '#334155',
              color: '#fff',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 'bold',
              border: 'none'
            }
          });
          // Re-injetamos o estado para manter o usuário aqui na próxima tentativa
          window.history.pushState({ layer: 0 }, '');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Injetamos um estado inicial se estivermos no topo para poder interceptar o "voltar"
    if (!window.history.state || window.history.state.layer === undefined) {
      window.history.replaceState({ layer: 0 }, '');
      // Push inicial para ter algo para "voltar" sem sair
      window.history.pushState({ layer: 0 }, '');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedThreadId, isMobileDetailsOpen]);

  useEffect(() => {
    let currentLayer = 0;
    if (selectedThreadId) currentLayer = 1;
    if (isMobileDetailsOpen) currentLayer = 2;

    // Apenas adicionamos ao histórico se estivermos indo "mais fundo"
    if (currentLayer > navigationLayerRef.current) {
      window.history.pushState({ layer: currentLayer }, '');
    }
    
    navigationLayerRef.current = currentLayer;
  }, [selectedThreadId, isMobileDetailsOpen]);

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

        // Fetch Predefined Labels from Profile
        const { data: profile } = await supabase.from('profiles').select('predefined_labels').eq('id', userId).single();
        if (profile?.predefined_labels) {
          setPredefinedLabels(profile.predefined_labels);
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
              contactId: contact?.id,
              name: contact?.nome || d.contact_name || 'Lead WhatsApp',
              lastMessage: d.last_message || '',
              time: d.last_message_time ? new Date(d.last_message_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
              status: (d.status as any) || 'ia',
              unreadCount: d.unread_count || 0,
              remoteJid: d.remote_jid || '',
              updatedAt: d.updated_at || new Date().toISOString(),
              lastMessageTime: d.last_message_time ? new Date(d.last_message_time).getTime() : 0,
              ticketStatus: d.ticket_status || 'open',
              funilStatus: normFunil(contact?.status_funil),
              is_client: contact?.is_client || false,
              priority: contact?.priority,
              profilePictureUrl: d.profile_picture_url,
              profilePictureUpdatedAt: d.profile_picture_updated_at,
              labels: d.labels || [],
              pending_followup: d.pending_followup,
              assignedTo: d.assigned_to || null,
              agentId: d.agent_id || null,
              lastInboundAt: d.last_inbound_at ? new Date(d.last_inbound_at).getTime() : 0
            };
          });
          setThreads(formatted);
          
          // ─── Busca fotos em lote (novas ou expiradas > 24h) ─────────────────────────
          const threadsToUpdate = formatted.filter(t => {
            if (!t.profilePictureUrl) return true;
            if (!t.profilePictureUpdatedAt) return true;
            
            const lastUpdate = new Date(t.profilePictureUpdatedAt);
            const diffHours = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
            return diffHours >= 24;
          });

          if (threadsToUpdate.length > 0) {
            fetchProfilePicturesInBatch(threadsToUpdate);
          }
          
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
        .on('system', {}, (status: any) => {
          if (status === 'SUBSCRIBED') {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            setConnectionStatus(prev => prev !== 'connected' ? 'connected' : prev);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnectionStatus('reconnecting');
            reconnectTimerRef.current = setTimeout(() => setConnectionStatus('disconnected'), 10000);
          }
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'threads', filter: `user_id=eq.${userId}` },
          async (payload) => {
            if (payload.eventType === 'INSERT') {
              setThreads(prev => {
                // Se já existe e NÃO é temporária, ignora. Se for temporária, substitui pela real.
                if (prev.some(t => t.id === payload.new.id && !(t as any).isTemp)) return prev;
                
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
                  lastMessageTime: payload.new.last_message_time ? new Date(payload.new.last_message_time).getTime() : 0,
                  ticketStatus: payload.new.ticket_status || 'open',
                  funilStatus: resolved.funilStatus,
                  profilePictureUrl: payload.new.profile_picture_url,
                  pending_followup: payload.new.pending_followup,
                  lastInboundAt: payload.new.last_inbound_at ? new Date(payload.new.last_inbound_at).getTime() : 0
                };

                const filtered = prev.filter(t => t.id !== payload.new.id);
                return [newThread as any, ...filtered];
              });
            } else if (payload.eventType === 'UPDATE') {
              setThreads(prev => {
                const existingIndex = prev.findIndex(t => t.id === payload.new.id);
                const baseThread = existingIndex !== -1 ? prev[existingIndex] : null;

                // [FIX] Nunca deixa o número sobrescrever o nome real (ex: +55 (32) ...)
                const isPhone = (s: string) => !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;

                const resolvedFromCRM = getResolvedContact(
                  payload.new.remote_jid || baseThread?.remoteJid || '',
                  '' // Não passamos fallback aqui — queremos saber se o CRM tem mesmo
                );

                const crmName = resolvedFromCRM.name && !isPhone(resolvedFromCRM.name) 
                  ? resolvedFromCRM.name 
                  : null;

                
                const existingName = baseThread?.name && !isPhone(baseThread.name)
                  ? baseThread.name
                  : null;

                const dbContactName = payload.new.contact_name && !isPhone(payload.new.contact_name)
                  ? payload.new.contact_name
                  : null;

                const finalName = crmName || existingName || dbContactName || payload.new.contact_name || baseThread?.name || 'Lead WhatsApp';


                const updatedThread = {
                  ...(baseThread || {}),
                  id: payload.new.id,
                  name: finalName,
                  lastMessage: payload.new.last_message || baseThread?.lastMessage || '',
                  status: payload.new.status || baseThread?.status || 'ia',
                  unreadCount: payload.new.unread_count ?? baseThread?.unreadCount ?? 0,
                  updatedAt: payload.new.updated_at || baseThread?.updatedAt || new Date().toISOString(),
                  lastMessageTime: payload.new.last_message_time ? new Date(payload.new.last_message_time).getTime() : (baseThread?.lastMessageTime || 0),
                  ticketStatus: payload.new.ticket_status || baseThread?.ticketStatus || 'open',
                  time: payload.new.last_message_time ? new Date(payload.new.last_message_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : (baseThread?.time || ''),
                  funilStatus: resolvedFromCRM.funilStatus !== 'novo_lead' ? resolvedFromCRM.funilStatus : (baseThread?.funilStatus || 'novo_lead'),
                  // Usa !== undefined para respeitar null explícito do banco
                  // (ex: quando o refresh invalidou a URL expirada)
                  profilePictureUrl: payload.new.profile_picture_url !== undefined
                    ? payload.new.profile_picture_url
                    : baseThread?.profilePictureUrl,
                  pending_followup: payload.new.pending_followup ?? baseThread?.pending_followup,
                  lastInboundAt: payload.new.last_inbound_at
                    ? new Date(payload.new.last_inbound_at).getTime()
                    : (baseThread?.lastInboundAt || 0)
                };

                // Só move para o topo se a última mensagem mudou
                const isNewMessage = payload.new.last_message_time && 
                                   (!baseThread?.lastMessageTime || 
                                    new Date(payload.new.last_message_time).getTime() > new Date(baseThread.lastMessageTime).getTime());

                if (isNewMessage) {
                  const filtered = prev.filter(t => t.id !== payload.new.id);
                  return [updatedThread as any, ...filtered];
                } else {
                  return prev.map(t => (t.id === payload.new.id ? (updatedThread as any) : t));
                }
              });
            } else if (payload.eventType === 'DELETE') {
              setThreads(prev => prev.filter(t => t.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      // Contacts listener para garantir que mudanças de nome no CRM reflitam no chat
      const contactsChannel = supabase
        .channel(`contacts-realtime-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'contacts', filter: `user_id=eq.${userId}` },
          (payload) => {
            console.log('[Inbox] 👤 Mudança no contato detectada:', payload.eventType);
            if (payload.eventType === 'INSERT') {
              setContacts(prev => [...prev, payload.new]);
            } else if (payload.eventType === 'UPDATE') {
              setContacts(prev => prev.map(c => c.id === payload.new.id ? payload.new : c));
              // Atualiza o nome nas threads existentes
              setThreads(prevThreads => prevThreads.map(t => {
                const phoneNumber = (t.remoteJid || '').split('@')[0].replace(/\D/g, '');
                const contactPhone = payload.new.telefone?.replace(/\D/g, '');
                if (!contactPhone) return t;
                
                const p1 = phoneNumber.replace(/^55/, '');
                const p2 = contactPhone.replace(/^55/, '');
                const isMatch = p1 === p2 || (p1.length >= 8 && p2.length >= 8 && p1.slice(-8) === p2.slice(-8));
                
                if (isMatch) {
                  return { 
                    ...t, 
                    name: payload.new.nome || t.name,
                    funilStatus: normFunil(payload.new.status_funil) || t.funilStatus,
                    is_client: payload.new.is_client ?? t.is_client
                  };
                }
                return t;
              }));
            } else if (payload.eventType === 'DELETE') {
              setContacts(prev => prev.filter(c => c.id === payload.old.id));
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

    // Fetch Agents
    const fetchAgents = async () => {
      const uid = user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from('agents')
        .select('id, nome, company_name')
        .eq('user_id', uid)
        .eq('status_ativo', true)
        .order('created_at', { ascending: true });
      setAgents(data || []);
    };
    fetchAgents();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, threadsRefreshKey]);

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
        // Carrega as últimas PAGE_SIZE mensagens (DESC) e reverte para ordem cronológica
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('thread_id', selectedThreadId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (error) {
          console.error('[Inbox] Erro ao buscar mensagens:', error);
        } else if (data) {
          setHasMoreMessages(data.length === PAGE_SIZE);
          setMessages([...data].reverse().map(formatMsgRow) as any);
        }
      } catch (msgErr) {
        console.error('[Inbox] Falha crítica ao carregar mensagens:', msgErr);
      } finally {
        setLoadingMessages(false);
      }

      // ── BLOCO 2: Realtime listener ────────────────────────────────────
      const formatMsg = formatMsgRow;

      // Variável para guardar o timestamp da última mensagem conhecida (reconciliação de lacunas)
      let lastKnownMsgTimestamp: string | null = null;

      channel = supabase
        .channel(`messages-${selectedThreadId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${selectedThreadId}` },
          (payload) => {
            // Atualiza o timestamp da última mensagem conhecida
            if (payload.new.created_at) lastKnownMsgTimestamp = payload.new.created_at;

            setMessages(prev => {
              const newMsg = formatMsg(payload.new);

              // 1. Deduplicação por ID (ID idêntico já está no estado)
              if (prev.some(m => m.id === newMsg.id)) return prev;

              // Ignora pré-persists do backend (status=sending com whatsapp_id=sending-*)
              // O frontend gerencia seu próprio estado otimista; o temp do backend causaria duplicação.
              if (payload.new.status === 'sending' && String(payload.new.whatsapp_id || '').startsWith('sending-')) {
                return prev;
              }

              // Som de recebimento apenas para mensagens inbound (lead)
              if (newMsg.sender === 'lead') playSound('receive');

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
            // [FIX] Atualiza APENAS os campos enviados pelo Supabase Realtime
            // (Se REPLICA IDENTITY = DEFAULT, payload.new só traz id e os campos alterados, como status)
            // Se passarmos tudo para formatMsg, a mensagem perderia o 'text' e a 'data'!
            setMessages(prev => prev.map(m =>
              m.id === payload.new.id 
                ? { ...m, status: payload.new.status || m.status } 
                : m
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
        .on('system', {}, (status: any) => {
          // ── RECONCILIAÇÃO DE LACUNAS (Gap Detection) ──────────────────
          // Quando o Realtime reconecta após queda de rede, busca mensagens perdidas
          if (status === 'SUBSCRIBED' && lastKnownMsgTimestamp) {
            console.log('[Inbox] 🔄 Realtime reconnected. Fetching messages since', lastKnownMsgTimestamp);
            supabase
              .from('messages')
              .select('*')
              .eq('thread_id', selectedThreadIdRef.current!)
              .gt('created_at', lastKnownMsgTimestamp)
              .order('created_at', { ascending: true })
              .then(({ data }) => {
                if (data && data.length > 0) {
                  console.log(`[Inbox] 🔄 Gap fill: ${data.length} message(s) recovered.`);
                  setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const newMsgs = data.filter(d => !existingIds.has(d.id)).map(formatMsg);
                    return newMsgs.length > 0 ? [...prev, ...newMsgs as any] : prev;
                  });
                }
              });
          }
        })
        .subscribe();

      // Zerar não-lidas (Optimistic + Backend)
      setThreads(prev => prev.map(t => t.id === selectedThreadId ? { ...t, unreadCount: 0 } : t));
      supabase.from('threads').update({ unread_count: 0 }).eq('id', selectedThreadId).then(() => {});

      // ── BLOCO 3: Dados da barra lateral (não-crítico, isolado) ────────
      // Erros aqui NÃO afetam as mensagens.
      const thread = threads.find(t => t.id === selectedThreadId);
      if (!thread) return;

      try {
        const cleanPhone = (thread.remoteJid || '').split('@')[0].replace(/\D/g, '');
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

  // Mostra os indicadores de janela 24h apenas para tenants no Meta oficial.
  // O calculo e a renderizacao em si vivem no componente WindowCountdown (top).
  // lastInbound vem da coluna last_inbound_at em threads (populada no persistMessage)
  // com fallback para o maximo timestamp das mensagens em memoria.
  const showMeta24hWindow = currentProvider === 'meta_official';
  const activeThreadLastInbound = useMemo(() => {
    if (!activeThread) return undefined;
    // Timestamp mais recente das mensagens inbound em memória (fonte confiável)
    const messagesTs = messages
      .filter(m => m.sender === 'lead')
      .map(m => {
        const t = typeof m.timestamp === 'number' ? m.timestamp : new Date(m.timestamp).getTime();
        return isNaN(t) ? 0 : t;
      })
      .reduce((max, t) => Math.max(max, t), 0);
    // Usa o máximo entre o valor do DB e as mensagens em memória.
    // Isso corrige casos onde last_inbound_at ficou preso em timestamp antigo/errado.
    const dbTs = activeThread.lastInboundAt || 0;
    const maxTs = Math.max(dbTs, messagesTs);
    return maxTs > 0 ? maxTs : undefined;
  }, [activeThread, messages]);

  // Dedupe O(N) via Set — antes era O(N²) com findIndex a cada render
  const dedupedMessages = useMemo(() => {
    const seen = new Set<string>();
    const out: Message[] = [];
    for (const m of messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [messages]);

  const searchHits = useMemo(() => {
    if (!messageSearchDebounced) return [] as Message[];
    const q = messageSearchDebounced.toLowerCase();
    return dedupedMessages.filter(m => m.text?.toLowerCase().includes(q));
  }, [dedupedMessages, messageSearchDebounced]);

  const visibleMessages = dedupedMessages;
  const currentSearchHitId = searchHits[searchResultIdx]?.id;

  // Refs estáveis para handlers passados ao ChatBubble — preservam memoização
  const showScrollButtonRef = useRef(showScrollButton);
  useEffect(() => { showScrollButtonRef.current = showScrollButton; }, [showScrollButton]);
  const onImageLoadStable = React.useCallback(() => {
    if (!showScrollButtonRef.current) scrollToBottom("smooth");
  }, []);
  const onMessageSelect = React.useCallback((id: string) => {
    setIsSelectionMode(prev => prev || true);
    setSelectedMsgIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const renderContactDetails = () => {
    if (!activeThread) return null;
    
    // Check if we have tracking data from the contact or thread
    const trackingData = selectedContact?.ad_tracking || activeThread.ad_tracking;

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {/* Perfil Header */}
        <div className="p-5 border-b border-slate-100 text-center bg-slate-50/30 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: `url(${activeThread.profilePictureUrl || ''})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px)' }}></div>
          
          <div className="relative z-10">
            <div className="w-20 h-20 rounded-[1.5rem] bg-white text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-200/50 shadow-xl overflow-hidden group">
              {activeThread.profilePictureUrl ? (
                <img src={activeThread.profilePictureUrl} alt={activeThread.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <User size={48} className="text-slate-200" />
              )}
            </div>
            {isEditingName ? (
              <div className="flex flex-col gap-2 px-4">
                <input 
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const cleanPhone = activeThread.remoteJid.split('@')[0].replace(/\D/g, '');
                      const contactId = `${user?.id}_${cleanPhone}`;
                      try {
                        await updateContact(contactId, { nome: newName });
                        setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, name: newName } : t));
                        setIsEditingName(false);
                        toast.success('Nome atualizado!');
                      } catch (err) {
                        toast.error('Erro ao atualizar nome');
                      }
                    } else if (e.key === 'Escape') {
                      setIsEditingName(false);
                    }
                  }}
                  className="w-full bg-white border-2 border-primary-500 rounded-xl px-4 py-2 text-center text-sm font-bold focus:outline-none shadow-lg"
                  autoFocus
                />
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Pressione Enter para salvar</p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 px-4 group/name">
                <h3 className="text-xl font-black text-slate-900 tracking-tight truncate max-w-[200px]">{activeThread.name}</h3>
                <button 
                  onClick={() => {
                    setNewName(activeThread.name);
                    setIsEditingName(true);
                  }}
                  className="p-1.5 text-slate-300 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-all opacity-0 group-hover/name:opacity-100"
                  title="Editar nome"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border shadow-sm
                ${{
                  novo_lead:      'bg-slate-50 text-slate-600 border-slate-200',
                  primeiro_atend: 'bg-blue-50 text-blue-600 border-blue-100',
                  sem_resposta:   'bg-amber-50 text-amber-600 border-amber-100',
                  qualificado:    'bg-violet-50 text-violet-600 border-violet-100',
                  agendamento:    'bg-indigo-50 text-indigo-600 border-indigo-100',
                  cliente:        'bg-emerald-50 text-emerald-600 border-emerald-100',
                }[activeThread.funilStatus as string] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                {{
                  novo_lead: 'Novo Lead', primeiro_atend: 'Primeiro Atend.',
                  sem_resposta: 'Sem Resposta', qualificado: 'Qualificado',
                  agendamento: 'Agendamento', cliente: 'Cliente',
                }[activeThread.funilStatus as string] || activeThread.funilStatus || 'Novo Lead'}
              </span>
              {activeThread.is_client && (
                <span className="bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1">
                  <Star size={10} className="fill-amber-500" /> Cliente
                </span>
              )}
              {currentProvider === 'meta_official' && (
                <span
                  className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm"
                  title="Este número usa a API Oficial da Meta. Mensagens livres só funcionam dentro da janela de 24h após a última mensagem do cliente."
                >
                  Meta Oficial
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-400">
               <Phone size={12} />
               <span className="text-xs font-bold font-mono tracking-wider">
                 {activeThread.remoteJid.split('@')[0]}
               </span>
            </div>
            <div className="mt-4 px-4">
               <button 
                onClick={() => setShowTrackingModal(true)}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-black uppercase tracking-widest text-[11px] transition-all
                  ${trackingData 
                    ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-200 hover:bg-primary-700' 
                    : 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'}`}
                disabled={!trackingData}
               >
                 <Globe size={16} />
                 {trackingData ? 'Ver Tracking de Origem' : 'Sem Dados de Origem'}
               </button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-8">
          {/* Contexto da Conversa: Status, Prioridade e Atribuição */}
          <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Bookmark size={14} className="text-primary-500" /> Contexto do Ticket
            </h4>
            {showMeta24hWindow && (
              <div className="mb-3">
                <WindowCountdown
                  lastInboundAt={activeThreadLastInbound}
                  variant="panel"
                  onTemplatesClick={() => {
                    setTemplatesModalTo((activeThread.remoteJid || '').split('@')[0]);
                    setTemplatesModalOpen(true);
                  }}
                />
              </div>
            )}
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Etapa no Kanban</label>
                <select
                  value={activeThread.funilStatus || 'novo_lead'}
                  onChange={async (e) => {
                    const val = e.target.value;
                    const cleanPhone = (activeThread.remoteJid || '').split('@')[0].replace(/\D/g, '');
                    await supabase.from('contacts').update({ status_funil: val }).ilike('telefone', `%${cleanPhone.slice(-8)}%`);
                    setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, funilStatus: val } : t));
                    toast.success(`Etapa alterada`);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-[13px] px-4 py-3 font-semibold text-slate-700 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all"
                >
                  <option value="novo_lead">Novo Lead</option>
                  <option value="primeiro_atend">Primeiro Atend.</option>
                  <option value="sem_resposta">Sem Resposta</option>
                  <option value="qualificado">Qualificado</option>
                  <option value="agendamento">Agendamento</option>
                  <option value="cliente">Cliente</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Prioridade</label>
                <select 
                  value={activeThread.priority || 'normal'}
                  onChange={async (e) => {
                    const val = e.target.value as any;
                    await supabase.from('threads').update({ priority: val }).eq('id', activeThread.id);
                    setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, priority: val } : t));
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-[13px] px-4 py-3 font-semibold text-slate-700 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-[13px] px-4 py-3 font-semibold text-slate-700 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all"
                >
                  <option value="">Não atribuído</option>
                  <option value={user?.id || 'me'}>Você ({user?.email?.split('@')[0]})</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Equipe)</option>
                  ))}
                </select>
              </div>
              {agents.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Agente IA</label>
                  <select
                    value={activeThread.agentId || ''}
                    onChange={async (e) => {
                      const val = e.target.value || null;
                      try {
                        const r = await fetch(`/api/messages/threads/${activeThread.id}/agent`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
                          body: JSON.stringify({ agent_id: val })
                        });
                        const res = await r.json();
                        if (!res.success) { toast.error(res.error || 'Erro ao atualizar agente.'); return; }
                        setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, agentId: val } : t));
                        const agent = agents.find(a => a.id === val);
                        toast.success(val ? `Agente "${agent?.nome || agent?.company_name}" selecionado!` : 'Usando agente padrão.');
                      } catch { toast.error('Erro de conexão.'); }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-[13px] px-4 py-3 font-semibold text-slate-700 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all"
                  >
                    <option value="">🤖 Agente padrão</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.nome || a.company_name || 'Agente sem nome'}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Etiqueta Especial</label>
                <button
                  onClick={async () => {
                    const newVal = !activeThread.is_client;
                    const cleanPhone = (activeThread.remoteJid || '').split('@')[0].replace(/\D/g, '');
                    await supabase.from('contacts').update({ is_client: newVal }).ilike('telefone', `%${cleanPhone.slice(-8)}%`);
                    setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, is_client: newVal } : t));
                    toast.success(newVal ? 'Marcado como Cliente! ⭐' : 'Etiqueta de Cliente removida.');
                  }}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-2xl border text-[12px] font-black uppercase tracking-widest transition-all
                    ${activeThread.is_client 
                      ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-lg shadow-amber-500/5' 
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-500'}`}
                >
                  <Star size={16} className={activeThread.is_client ? 'fill-amber-500' : ''} />
                  {activeThread.is_client ? 'É Cliente' : 'Marcar como Cliente'}
                </button>
              </div>
            </div>
          </div>

          {/* Etiquetas (Labels) */}
          <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Tag size={14} className="text-primary-500" /> Etiquetas
            </h4>
            <div className="flex flex-wrap gap-2 mb-3">
              {activeThread.labels && activeThread.labels.length > 0 ? (
                activeThread.labels.map((label, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border border-primary-100 rounded-xl text-[11px] font-bold text-primary-700 group shadow-sm">
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
            <div className="flex flex-col gap-3">
              <input 
                type="text" 
                placeholder="Criar nova etiqueta..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl text-[12px] px-4 py-2.5 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value.trim();
                    if (val) {
                      // Se não existe na lista global, adiciona
                      if (!predefinedLabels.includes(val)) {
                        const newGlobal = [...predefinedLabels, val];
                        await supabase.from('profiles').update({ predefined_labels: newGlobal }).eq('id', user?.id);
                        setPredefinedLabels(newGlobal);
                      }
                      
                      // Adiciona ao contato atual
                      if (!activeThread.labels || !activeThread.labels.includes(val)) {
                        const newLabels = [...(activeThread.labels || []), val];
                        await supabase.from('threads').update({ labels: newLabels }).eq('id', activeThread.id);
                        setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, labels: newLabels } : t));
                      }
                      e.currentTarget.value = '';
                    }
                  }
                }}
              />
              
              {predefinedLabels.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Suas Etiquetas</p>
                  <div className="flex flex-wrap gap-2">
                    {predefinedLabels.map((lbl, idx) => {
                      const isActive = activeThread.labels && activeThread.labels.includes(lbl);
                      return (
                        <div key={idx} className="relative group/lbl flex items-center">
                          <button
                            onClick={async () => {
                              let newLabels = [...(activeThread.labels || [])];
                              if (isActive) {
                                newLabels = newLabels.filter(l => l !== lbl);
                              } else {
                                newLabels.push(lbl);
                              }
                              await supabase.from('threads').update({ labels: newLabels }).eq('id', activeThread.id);
                              setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, labels: newLabels } : t));
                            }}
                            className={`pl-3 pr-6 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
                              isActive
                                ? 'bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-primary-300 hover:text-primary-600'
                            }`}
                          >
                            {lbl}
                          </button>
                          <button
                            title="Excluir etiqueta"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newGlobal = predefinedLabels.filter(l => l !== lbl);
                              await supabase.from('profiles').update({ predefined_labels: newGlobal }).eq('id', user?.id);
                              setPredefinedLabels(newGlobal);
                              if (isActive) {
                                const newLabels = (activeThread.labels || []).filter(l => l !== lbl);
                                await supabase.from('threads').update({ labels: newLabels }).eq('id', activeThread.id);
                                setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, labels: newLabels } : t));
                              }
                              toast.success(`Etiqueta "${lbl}" excluída.`);
                            }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/lbl:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-red-100 hover:text-red-500 text-slate-400"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dados do Contato */}
          <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Info size={14} className="text-primary-500" /> Informações
            </h4>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600 shrink-0 border border-primary-100 shadow-sm">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">WhatsApp</p>
                  <p className="text-sm font-black text-gray-800">{(activeThread.remoteJid || '').split('@')[0]}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 shrink-0 border border-primary-100 shadow-sm">
                  <Clock size={18} />
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
              <span className="flex items-center gap-2"><Calendar size={14} className="text-primary-500" /> Agendamentos</span>
              <span className="bg-primary-600 text-white px-2.5 py-1 rounded-xl text-[10px] font-black shadow-lg shadow-primary-500/20">{appointments.length}</span>
            </h4>
            <div className="space-y-4">
              {appointments.length > 0 ? (
                appointments.map((app, idx) => (
                  <div key={idx} className="p-5 bg-slate-50/50 rounded-[2rem] border border-slate-100 hover:border-primary-200 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2">
                       <Calendar size={48} className="text-primary-500/5 -mr-4 -mt-4 rotate-12" />
                    </div>
                    <div className="flex justify-between items-start mb-3 relative z-10">
                      <p className="text-[14px] font-black text-slate-900 truncate flex-1">{app.service || 'Agendamento'}</p>
                      <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase ml-2 border shadow-sm
                        ${app.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {app.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold relative z-10 bg-white/50 w-fit px-3 py-1 rounded-full border border-slate-100/50">
                      <Clock size={12} className="text-primary-500" />
                      {app.data ? new Date(app.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} • {app.time || '—'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-slate-50/30 rounded-[2.5rem] border border-dashed border-slate-200">
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                    <Calendar size={24} className="text-slate-300" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-4">Nenhum agendamento futuro</p>
                </div>
              )}
            </div>
          </div>

          {/* Gestão do Funil */}
          <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <CreditCard size={14} className="text-primary-500" /> Gestão de Funil
            </h4>
            <div className="flex flex-col gap-2">
              {([
                { id: 'novo_lead',      label: 'Novo Lead',        dot: 'bg-slate-400' },
                { id: 'primeiro_atend', label: 'Primeiro Atend.',  dot: 'bg-blue-400' },
                { id: 'sem_resposta',   label: 'Sem Resposta',     dot: 'bg-amber-400' },
                { id: 'qualificado',    label: 'Qualificado',      dot: 'bg-violet-500' },
                { id: 'agendamento',    label: 'Agendamento',      dot: 'bg-indigo-400' },
                { id: 'cliente',        label: 'Cliente',          dot: 'bg-emerald-500' },
              ] as const).map(({ id: status, label, dot }) => {
                const isActive = activeThread.funilStatus === status;
                return (
                  <button
                    key={status}
                    onClick={async () => {
                      const cleanPhone = (activeThread.remoteJid || '').split('@')[0].replace(/\D/g, '');
                      const { error } = await supabase
                        .from('contacts')
                        .update({ status_funil: status })
                        .ilike('telefone', `%${cleanPhone.slice(-8)}%`);
                      if (!error) {
                        toast.success(`Etapa alterada para ${label}`);
                        setThreads(prev => prev.map(t =>
                          t.id === selectedThreadId ? { ...t, funilStatus: status } : t
                        ));
                      } else {
                        toast.error('Erro ao atualizar status');
                      }
                    }}
                    className={`group w-full flex items-center justify-between p-5 rounded-[2rem] border-2 transition-all
                      ${isActive
                        ? 'bg-primary-50 border-primary-500 shadow-xl shadow-primary-500/10 scale-[1.02]'
                        : 'bg-white border-slate-100 hover:border-primary-200'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full shadow-sm ${dot}`} />
                      <span className={`text-[14px] font-bold ${isActive ? 'text-primary-700' : 'text-slate-600'}`}>{label}</span>
                    </div>
                    {isActive && <Check size={18} className="text-primary-600" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mensagens Favoritas */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2"><Star size={14} className="text-amber-500 fill-amber-500" /> Favoritas</span>
              <span className="bg-amber-500 text-white px-2.5 py-1 rounded-xl text-[10px] font-black shadow-lg shadow-amber-500/20">
                {messages.filter(m => m.is_starred).length}
              </span>
            </h4>
            <div className="space-y-3">
              {messages.filter(m => m.is_starred).length > 0 ? (
                messages.filter(m => m.is_starred).map((msg, idx) => (
                  <div key={idx} className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 hover:border-amber-300 transition-all group cursor-pointer"
                       onClick={() => {
                         const el = document.getElementById(`msg-${msg.id}`);
                         if (el) {
                           el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                           el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'rounded-2xl');
                           setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2', 'rounded-2xl'), 2000);
                         }
                       }}>
                    <p className="text-[13px] text-slate-700 line-clamp-3 leading-relaxed">
                      {msg.text || (msg.message_type === 'image' ? '📸 Imagem' : msg.message_type === 'audio' ? '🎤 Áudio' : '📎 Arquivo')}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-amber-600 font-bold uppercase">
                      <span>{msg.time}</span>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          handleToggleStar(msg.id, true); 
                        }}
                        className="hover:underline"
                      >
                         Remover
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-slate-50/30 rounded-2xl border border-dashed border-slate-200">
                  <Star size={20} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">Nenhuma favoritada</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
      formData.append('remoteJid', activeThread.remoteJid);

      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch('/api/whatsapp/send-voice', {
        method: 'POST',
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {},
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

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const uploadFileDirectly = async (file: File) => {
    if (!selectedThreadId || !activeThread) return;
    const userId = user?.id;
    if (!userId) return;

    try {
      const formData = new FormData();
      formData.append('media', file);
      formData.append('remoteJid', activeThread.remoteJid);

      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch('/api/whatsapp/send-media', {
        method: 'POST',
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {},
        body: formData
      });

      if (!response.ok) throw new Error('Falha ao enviar arquivo');
      
      toast.success('Arquivo enviado com sucesso!');
      
      await supabase
        .from('threads')
        .update({ status: 'human', updated_at: new Date().toISOString() })
        .eq('id', selectedThreadId);

    } catch (err) {
      console.error('Error sending file:', err);
      toast.error('Erro ao enviar arquivo');
    }
  };

  const handleDropFile = (file: File) => {
    if (!selectedThreadId || !activeThread) return;
    if (file.type.startsWith('image/')) {
      setPastedFile(file);
      const url = URL.createObjectURL(file);
      setPastedImageUrl(url);
      setShowPasteModal(true);
      setPasteCaption('');
    } else {
      uploadFileDirectly(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleDropFile(file);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleDropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenContactChat = (jid: string) => {
    if (!jid || !user?.id) return;

    const cleanJid = jid.split('@')[0];
    const threadId = `${user.id}_${cleanJid}`;
    
    // Se já estivermos com essa thread selecionada, não faz nada
    if (selectedThreadId === threadId) return;

    // Busca nas threads existentes
    const existingThread = threads.find(t => t.id === threadId || (t.remoteJid || '').split('@')[0] === cleanJid);
    
    if (existingThread) {
      setSelectedThreadId(existingThread.id);
      console.log(`[Inbox] 🔗 Contact JID selected: ${existingThread.id}`);
    } else {
      // Cria uma temporária se não existir
      const tempThread: Thread & { isTemp?: boolean } = {
        id: threadId,
        remoteJid: `${cleanJid}@s.whatsapp.net`,
        name: cleanJid,
        lastMessage: 'Conversar com contato compartilhado...',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'human',
        updatedAt: new Date().toISOString(),
        ticketStatus: 'open',
        funilStatus: 'novo_lead',
        isTemp: true
      };

      const resolved = getResolvedContact(cleanJid, tempThread.name);
      tempThread.name = resolved.name;
      tempThread.funilStatus = resolved.funilStatus;

      setThreads(prev => {
        const hasTemp = prev.some(t => t.id === threadId);
        if (hasTemp) return prev;
        return [tempThread, ...prev];
      });
      setSelectedThreadId(threadId);
      console.log(`[Inbox] 🔗 Temp contact thread created: ${threadId}`);
    }
    
    toast.success('Abrindo conversa...');
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedThreadId || !activeThread || isSending) return;

    const userId = user?.id;
    if (!userId) return;

    setIsSending(true);
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
           timestamp: Date.now(),
           whatsapp_id: privateId // Resolve erro de NOT NULL e constraint UNIQUE
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
      const currentQuotedId = replyingTo?.whatsapp_id || replyingTo?.id;
      const currentQuotedText = replyingTo?.text;
      setReplyingTo(null);

      // Update otimista: exibe a mensagem imediatamente sem esperar o Realtime.
      // O backend insere via Service Role Key, que não dispara eventos Realtime
      // para clientes autenticados, então não podemos depender disso.
      const optimisticId = `sending-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: optimisticId,
        text: finalMessageText,
        sender: 'outbound',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        status: 'sending',
        message_type: 'text',
        whatsapp_id: undefined,
        quoted_id: currentQuotedId,
        quoted_text: currentQuotedText,
        is_starred: false,
      } as any]);

      await sendMessage(activeThread.remoteJid, finalMessageText, currentQuotedId);
      playSound('send');

      // O backend insere a mensagem via BullMQ (assíncrono), então o registro
      // ainda não existe no banco imediatamente após o sendMessage retornar.
      // Buscamos com delay para substituir o otimista pelo real quando disponível.
      // Só remove o otimista se o registro real for encontrado.
      const threadIdAtSend = selectedThreadId;
      const replaceOptimistic = async (attempt = 1) => {
        const { data: latestMsgs } = await supabase
          .from('messages')
          .select('*')
          .eq('thread_id', threadIdAtSend)
          .order('created_at', { ascending: false })
          .limit(10);

        if (latestMsgs) {
          setMessages(prev => {
            const withoutTemps = prev.filter(m => !String(m.id).startsWith('sending-'));
            const existingIds = new Set(withoutTemps.map(m => m.id));
            const toAdd = [...latestMsgs].reverse().map(formatMsgRow).filter(m => !existingIds.has(m.id));
            if (toAdd.length === 0) return prev; // Real ainda não chegou, mantém otimista
            return [...withoutTemps, ...toAdd as any];
          });
          // Verifica se o otimista ainda está presente (real não encontrado) e tenta de novo
          setMessages(prev => {
            const stillHasTemp = prev.some(m => String(m.id).startsWith('sending-'));
            if (stillHasTemp && attempt < 3) {
              setTimeout(() => replaceOptimistic(attempt + 1), 2000);
            }
            return prev;
          });
        }
      };
      setTimeout(() => replaceOptimistic(), 1500);

      // Atualiza status da thread para 'human'
      await supabase
        .from('threads')
        .update({
          status: 'human',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedThreadId);

    } catch (error: any) {
      // Remove a mensagem otimista se o envio falhou
      setMessages(prev => prev.filter(m => !String(m.id).startsWith('sending-')));

      console.error('Error sending message:', error);
      // If the Meta 24h window is closed, restore the input and open the templates modal
      if (error instanceof SendMessageError && error.errorInfo?.is24hWindowClosed) {
        setMessageText(text);
        setTemplatesModalTo((activeThread.remoteJid || '').split('@')[0]);
        setTemplatesModalOpen(true);
        toast.warning('Janela de 24h fechada. Use um template aprovado para re-engajar este contato.');
      } else if (error instanceof SendMessageError && error.errorInfo?.isAuthError) {
        setMessageText(text);
        toast.error('Credenciais Meta expiradas. Avise o admin para renovar o token.');
      } else {
        toast.error(error?.message || 'Erro ao enviar mensagem');
      }
    } finally {
      setIsSending(false);
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
      const userId = user?.id;
      if (!userId) return;

      const phoneNumber = (thread.remoteJid || '').split('@')[0];
      const phoneEnd = phoneNumber.slice(-8);

      // 1. Buscar contatos correspondentes para obter seus IDs
      const { data: contactsToDelete } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', userId)
        .ilike('telefone', `%${phoneEnd}%`);

      if (contactsToDelete && contactsToDelete.length > 0) {
        const contactIds = contactsToDelete.map(c => c.id);
        
        // 2. Deletar os logs de campanha vinculados a esses contatos para evitar erros de chave estrangeira
        await supabase
          .from('campaign_logs')
          .delete()
          .in('contact_id', contactIds);
          
        // 3. Deletar os contatos
        await supabase
          .from('contacts')
          .delete()
          .in('id', contactIds);
      } else {
        // Fallback caso não encontre por ID de contato direto
        await supabase
          .from('contacts')
          .delete()
          .eq('user_id', userId)
          .ilike('telefone', `%${phoneEnd}%`);
      }

      // 4. Deletar as threads correspondentes (o CASCADE no banco deleta automaticamente as mensagens)
      await supabase
        .from('threads')
        .delete()
        .eq('user_id', userId)
        .ilike('remote_jid', `%${phoneEnd}%`);

      toast.success('Conversa excluída');
      if (selectedThreadId === thread.id) setSelectedThreadId(null);
      
      // Atualizar o estado local removendo todas as threads afetadas
      setThreads(prev => prev.filter(t => !t.remoteJid.includes(phoneEnd)));
    } catch (err) {
      console.error('Erro ao excluir conversa:', err);
      toast.error('Erro ao excluir conversa');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm('Deseja apagar esta mensagem? No WhatsApp ela será apagada para todos.')) return;
    
    try {
      const userId = user?.id;
      if (!userId) return;

      const response = await fetch('/api/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, messageId })
      });

      if (!response.ok) throw new Error('Falha ao apagar mensagem');
      toast.success('Mensagem apagada');
    } catch (err) {
      console.error('Error deleting message:', err);
      toast.error('Erro ao apagar mensagem');
    }
  };
  
  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!selectedThreadId || !activeThread) return;
    
    try {
      const userId = user?.id;
      if (!userId) return;

      const response = await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          messageId, 
          reaction: emoji,
          remoteJid: activeThread.remoteJid
        })
      });

      if (!response.ok) throw new Error('Falha ao reagir');
      
      // Update local state optimistically
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reaction: emoji } : m));
      
    } catch (err) {
      console.error('Error reacting to message:', err);
      toast.error('Erro ao reagir');
    }
  };
  
  const handleToggleStar = async (messageId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_starred: !currentStatus })
        .eq('id', messageId);
      
      if (error) throw error;
      
      // Update local state
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_starred: !currentStatus } : m));
      toast.success(!currentStatus ? 'Mensagem favoritada! ⭐' : 'Removida dos favoritos');
    } catch (err) {
      console.error('Error toggling star:', err);
      toast.error('Erro ao favoritar mensagem');
    }
  };

  const handleScheduleFollowUp = async (msg: string, delay: number, isAi: boolean) => {
    if (!selectedThreadId || !activeThread) return;
    
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch('/api/whatsapp/followup/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          remoteJid: activeThread.remoteJid,
          message: msg,
          delayMinutes: delay,
          isAi
        })
      });

      if (!response.ok) throw new Error('Falha ao agendar follow-up');
      
      toast.success('Follow-up agendado com sucesso!');
      setShowFollowUpModal(false);
      
      // Update local state to show the banner immediately
      const scheduledAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
      setThreads(prev => prev.map(t => t.id === selectedThreadId ? {
        ...t,
        pending_followup: { message: msg, scheduled_at: scheduledAt, type: isAi ? 'ai' : 'manual' }
      } : t));

    } catch (err) {
      toast.error('Erro ao agendar follow-up');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setPastedFile(file);
          const url = URL.createObjectURL(file);
          setPastedImageUrl(url);
          setShowPasteModal(true);
          setPasteCaption('');
          e.preventDefault();
        }
      }
    }
  };

  const handleSendPastedImage = async () => {
    if (!pastedFile || !selectedThreadId || !activeThread) return;
    
    const userId = user?.id;
    if (!userId) return;

    setIsUploadingPaste(true);
    try {
      const formData = new FormData();
      formData.append('media', pastedFile);
      formData.append('remoteJid', activeThread.remoteJid);
      if (pasteCaption.trim()) formData.append('caption', pasteCaption.trim());

      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch('/api/whatsapp/send-media', {
        method: 'POST',
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {},
        body: formData
      });

      if (!response.ok) throw new Error('Falha ao enviar imagem colada');
      
      toast.success('Imagem enviada!');
      
      // Cleanup
      if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
      setShowPasteModal(false);
      setPastedFile(null);
      setPastedImageUrl(null);
      setPasteCaption('');
      
      await supabase
        .from('threads')
        .update({ status: 'human', updated_at: new Date().toISOString() })
        .eq('id', selectedThreadId);

    } catch (err) {
      console.error('Error sending pasted image:', err);
      toast.error('Erro ao enviar imagem colada');
    } finally {
      setIsUploadingPaste(false);
    }
  };

  useEffect(() => {
    (window as any).handleDeleteThread = handleDeleteThread;
  }, [threads, selectedThreadId]);

  // Close filter panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Contadores para badges
  const semRespostaCount = useMemo(() => threads.filter(t =>
    t.ticketStatus !== 'resolved' && t.status === 'human' && (t.unreadCount || 0) > 0
  ).length, [threads]);

  const followUpCount = useMemo(() => threads.filter(t => !!t.pending_followup).length, [threads]);

  const filteredThreads = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return threads.filter(t => {
      const matchesSearch = !lowerSearch || t.name.toLowerCase().includes(lowerSearch) || t.remoteJid.includes(searchTerm);

      // Filtro principal (linha 1)
      let matchesMain = true;
      if (filterStatus === 'Ativos') matchesMain = t.ticketStatus !== 'resolved' && t.funilStatus !== 'cliente';
      else if (filterStatus === 'Encerrados') matchesMain = t.ticketStatus === 'resolved' || t.funilStatus === 'cliente';
      else if (filterStatus === 'Não Lidos') matchesMain = (t.unreadCount || 0) > 0;
      // 'Todos' → matchesMain permanece true

      // Sub-filtro (linha 2)
      let matchesSub = true;
      if (filterSub === 'Lead') matchesSub = !t.is_client && t.status !== 'human';
      else if (filterSub === 'Em Suporte') matchesSub = t.status === 'human';
      else if (filterSub === 'Clientes') matchesSub = !!t.is_client;

      // Badge de alerta (linha 3)
      let matchesBadge = true;
      if (filterBadge === 'sem_resposta') matchesBadge = t.ticketStatus !== 'resolved' && t.status === 'human' && (t.unreadCount || 0) > 0;
      else if (filterBadge === 'follow_up') matchesBadge = !!t.pending_followup;

      return matchesSearch && matchesMain && matchesSub && matchesBadge;
    });
  }, [threads, searchTerm, filterStatus, filterSub, filterBadge]);

  return (
    <div className={isFullscreen
      ? "h-screen w-full bg-[#f0f2f5] flex overflow-hidden relative"
      : "flex-1 min-h-0 bg-white rounded-xl border border-gray-200 shadow-sm flex overflow-hidden"
    }>
      {isFullscreen && (
        <div className={`${isSidebarExpanded ? 'w-[200px]' : 'w-[70px]'} transition-all duration-300 ease-in-out bg-slate-900 hidden md:flex flex-col items-center py-6 border-r border-slate-800 shrink-0 z-20 relative`}>
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-primary-500/20 border border-slate-700 bg-slate-800 shrink-0">
              <img src="/sofia-face.png" alt="Sofia" className="w-full h-full object-cover" />
            </div>
            {isSidebarExpanded && (
              <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-white font-black text-sm tracking-tight">Chat Sofia</span>
                <span className="text-primary-500 text-[9px] font-bold uppercase tracking-widest">Inteligência</span>
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-4 w-full px-2">
            <button 
              onClick={() => setActiveTab('conversations')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'conversations' ? 'bg-primary-600/10 text-primary-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Conversas"
            >
              <MessageCircle size={22} className={activeTab === 'conversations' ? 'fill-primary-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Conversas</span>}
              {activeTab === 'conversations' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />}
            </button>
            
            <button 
              onClick={() => setActiveTab('finance')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'finance' ? 'bg-primary-600/10 text-primary-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Financeiro"
            >
              <Wallet size={22} className={activeTab === 'finance' ? 'fill-primary-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Financeiro</span>}
              {activeTab === 'finance' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />}
            </button>

            <button 
              onClick={() => setActiveTab('contacts')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'contacts' ? 'bg-primary-600/10 text-primary-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Contatos"
            >
              <Users size={22} className={activeTab === 'contacts' ? 'fill-primary-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Contatos</span>}
              {activeTab === 'contacts' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />}
            </button>

            <button 
              onClick={() => setActiveTab('kanban')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'kanban' ? 'bg-primary-600/10 text-primary-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Kanban"
            >
              <LayoutDashboard size={22} className={activeTab === 'kanban' ? 'fill-primary-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Kanban</span>}
              {activeTab === 'kanban' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />}
            </button>

            <button 
              onClick={() => setActiveTab('reports')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'reports' ? 'bg-primary-600/10 text-primary-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Relatórios"
            >
              <BarChart3 size={22} className={activeTab === 'reports' ? 'fill-primary-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Relatórios</span>}
              {activeTab === 'reports' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />}
            </button>

            <button 
              onClick={() => setActiveTab('quick_replies')}
              className={`w-full ${isSidebarExpanded ? 'py-3 px-4 justify-start' : 'aspect-square justify-center'} rounded-xl flex items-center gap-3 transition-all group relative
                ${activeTab === 'quick_replies' ? 'bg-primary-600/10 text-primary-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
              title="Respostas Rápidas"
            >
              <MessageSquare size={22} className={activeTab === 'quick_replies' ? 'fill-primary-400/20 shrink-0' : 'shrink-0'} />
              {isSidebarExpanded && <span className="font-semibold text-sm whitespace-nowrap overflow-hidden opacity-100">Atalhos</span>}
              {activeTab === 'quick_replies' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />}
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
        <Suspense fallback={<LazyFallback />}><KanbanBoard user={user} threads={threads} onThreadsChange={setThreads} /></Suspense>
      ) : activeTab === 'reports' ? (
        <Suspense fallback={<LazyFallback />}><ReportsDashboard /></Suspense>
      ) : activeTab === 'quick_replies' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10">
          <Suspense fallback={<LazyFallback />}><QuickReplies /></Suspense>
        </div>
      ) : activeTab === 'integrations' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10">
          <Suspense fallback={<LazyFallback />}><Integrations user={user} role={user?.role || null} /></Suspense>
        </div>
      ) : activeTab === 'contacts' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10 p-4 md:p-6 lg:p-8">
          <Suspense fallback={<LazyFallback />}>
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
          </Suspense>
        </div>
      ) : activeTab === 'finance' ? (
        <Suspense fallback={<LazyFallback />}><Finance /></Suspense>
      ) : (
        <>
          <div className={`${selectedThreadId ? 'hidden md:flex' : 'flex'} w-full md:w-[32%] lg:w-[26%] border-r border-gray-100 flex-col bg-gray-50/30`}>
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <MessageCircle size={14} className="text-primary-600" />
              Conversas
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (onTabChange) {
                    localStorage.setItem('openNewCampaign', 'true');
                    onTabChange('campaigns');
                  }
                }}
                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                title="Nova Campanha"
              >
                <MessageSquarePlus size={14} />
              </button>
              {!isFullscreen && (
                <button
                  onClick={() => window.open('/?fullscreen=true', '_blank')}
                  className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
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

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Pesquisar nome, telefone..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[13px] placeholder-slate-400 focus:bg-white focus:border-primary-300 focus:ring-4 focus:ring-primary-50 transition-all outline-none"
              />
            </div>
            <button
              onClick={() => setIsFilterOpen(v => !v)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold transition-all flex-shrink-0
                ${isFilterOpen
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-200/50'}`}
            >
              <Filter size={14} />
              Filtrar
              {(filterStatus !== 'Ativos' || filterSub !== 'Todos' || filterBadge !== null) && (
                <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5" />
              )}
            </button>
          </div>

          {/* Filtros — active filters summary */}
          <div ref={filterPanelRef}>
            {(filterStatus !== 'Ativos' || filterSub !== 'Todos' || filterBadge !== null) && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtros Ativos:</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
                  {filterStatus !== 'Ativos' && (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1">
                      {filterStatus}
                      <button onClick={() => { setFilterStatus('Ativos'); setFilterBadge(null); }} className="hover:text-emerald-800 ml-0.5">×</button>
                    </span>
                  )}
                  {filterSub !== 'Todos' && (
                    <span className={`px-2.5 py-1 border rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1 ${
                      filterSub === 'Em Suporte' ? 'bg-amber-50 text-amber-600 border-amber-200' : filterSub === 'Clientes' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-primary-50 text-primary-600 border-primary-200'
                    }`}>
                      {filterSub}
                      <button onClick={() => setFilterSub('Todos')} className="hover:opacity-80 ml-0.5">×</button>
                    </span>
                  )}
                  {filterBadge === 'sem_resposta' && (
                    <span className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1">
                      Sem resposta
                      <button onClick={() => setFilterBadge(null)} className="hover:text-red-900 ml-0.5">×</button>
                    </span>
                  )}
                  {filterBadge === 'follow_up' && (
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1">
                      Follow-up
                      <button onClick={() => setFilterBadge(null)} className="hover:text-amber-900 ml-0.5">×</button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Dropdown panel */}
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-3">
                    {/* Status */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['Ativos', 'Não Lidos', 'Encerrados', 'Todos'] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => { setFilterStatus(f); setFilterBadge(null); }}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all
                              ${filterStatus === f && filterBadge === null
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'bg-white text-slate-500 border border-slate-200 hover:border-primary-200 hover:text-primary-600'}`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Perfil */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Perfil</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['Todos', 'Lead', 'Em Suporte', 'Clientes'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setFilterSub(s)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all border
                              ${filterSub === s
                                ? s === 'Em Suporte'
                                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                                  : s === 'Clientes'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : 'bg-primary-100 text-primary-700 border-primary-200'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                          >
                            {s === 'Todos' ? 'Geral' : s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Alertas */}
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Alertas</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setFilterBadge(prev => prev === 'sem_resposta' ? null : 'sem_resposta')}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition-all border
                            ${filterBadge === 'sem_resposta'
                              ? 'bg-red-500 text-white border-red-500'
                              : 'bg-white text-red-500 border-red-100 hover:border-red-300'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          Sem resposta
                          {semRespostaCount > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${filterBadge === 'sem_resposta' ? 'bg-white/30' : 'bg-red-500 text-white'}`}>
                              {semRespostaCount}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setFilterBadge(prev => prev === 'follow_up' ? null : 'follow_up')}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition-all border
                            ${filterBadge === 'follow_up'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-amber-600 border-amber-100 hover:border-amber-300'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          Em follow-up
                          {followUpCount > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${filterBadge === 'follow_up' ? 'bg-white/30' : 'bg-amber-500 text-white'}`}>
                              {followUpCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Limpar */}
                    {(filterStatus !== 'Ativos' || filterSub !== 'Todos' || filterBadge !== null) && (
                      <button
                        onClick={() => { setFilterStatus('Ativos'); setFilterSub('Todos'); setFilterBadge(null); }}
                        className="w-full py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div
          className="flex-1 overflow-y-auto relative"
          onTouchStart={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop === 0) {
              pullStartYRef.current = e.touches[0].clientY;
              isPullingRef.current = true;
            }
          }}
          onTouchMove={(e) => {
            if (!isPullingRef.current) return;
            const delta = e.touches[0].clientY - pullStartYRef.current;
            if (delta > 0 && delta < 90) setPullDelta(delta);
          }}
          onTouchEnd={async () => {
            if (!isPullingRef.current) return;
            isPullingRef.current = false;
            if (pullDelta >= 60) {
              if (window.navigator?.vibrate) window.navigator.vibrate(10);
              setIsRefreshingThreads(true);
              setThreadsRefreshKey(k => k + 1);
              setTimeout(() => setIsRefreshingThreads(false), 1200);
            }
            setPullDelta(0);
          }}
        >
          {/* Indicador pull-to-refresh */}
          <div
            className="flex items-center justify-center overflow-hidden transition-all duration-200"
            style={{ height: pullDelta > 0 ? pullDelta : isRefreshingThreads ? 44 : 0 }}
          >
            <Loader2
              size={18}
              className={`text-primary-500 ${isRefreshingThreads || pullDelta >= 60 ? 'animate-spin' : ''}`}
              style={{ opacity: pullDelta > 0 ? Math.min(pullDelta / 60, 1) : 1 }}
            />
          </div>

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
                showWindow={currentProvider === 'meta_official'}
                // Para o thread ativo, usa o cálculo com fallback de mensagens em memória
                // (mesmo que o painel direito usa). Evita badge "24H ⚠" obsoleta.
                lastInboundAtOverride={selectedThreadId === thread.id ? activeThreadLastInbound : undefined}
                onClick={() => setSelectedThreadId(thread.id)}
                onDelete={() => handleDeleteThread(thread)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Column: Chat Area */}
      <div
        className={`${selectedThreadId ? 'flex fixed inset-0 z-[60] md:relative md:inset-auto md:z-0' : 'hidden md:flex'} flex-1 flex-col bg-white overflow-hidden`}
        style={viewportHeight && selectedThreadId && viewportHeight < window.innerHeight ? { height: viewportHeight } : undefined}
      >
        {selectedThreadId && activeThread ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-2 md:px-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 shadow-sm z-[40]">
              <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                <button 
                  onClick={() => window.history.back()}
                  className="md:hidden p-2 -ml-2 text-slate-500 hover:text-primary-600 transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>

                <ContactAvatar url={activeThread.profilePictureUrl} name={activeThread.name} size="md" threadId={activeThread.id} />
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-slate-900 leading-tight truncate flex items-center gap-2">
                    {/^\d+$/.test(activeThread.name) ? formatPhone(activeThread.name) : activeThread.name}
                    {activeThread.is_client && <Star size={14} className="fill-amber-500 text-amber-500" />}
                    <span className={`hidden md:inline px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm
                      ${{
                        novo_lead:      'bg-slate-50 text-slate-600 border-slate-200',
                        primeiro_atend: 'bg-blue-50 text-blue-600 border-blue-100',
                        sem_resposta:   'bg-amber-50 text-amber-600 border-amber-100',
                        qualificado:    'bg-violet-50 text-violet-600 border-violet-100',
                        agendamento:    'bg-indigo-50 text-indigo-600 border-indigo-100',
                        cliente:        'bg-emerald-50 text-emerald-600 border-emerald-100',
                      }[activeThread.funilStatus as string] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      {{
                        novo_lead: 'Novo Lead', primeiro_atend: 'Primeiro Atend.',
                        sem_resposta: 'Sem Resposta', qualificado: 'Qualificado',
                        agendamento: 'Agendamento', cliente: 'Cliente',
                      }[activeThread.funilStatus as string] || activeThread.funilStatus || 'Novo Lead'}
                    </span>
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {(activeThread as any).isTyping ? (
                      <span className="text-[11px] text-emerald-500 font-bold animate-pulse">Digitando...</span>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span className="text-[11px] text-slate-500 font-medium truncate">Online via WhatsApp</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 md:gap-3 shrink-0">
                <button
                  onClick={() => {
                    setIsSearchingMessages(v => !v);
                    setMessageSearchQuery('');
                    setSearchResultIdx(0);
                  }}
                  className={`p-2 rounded-lg transition-all ${isSearchingMessages ? 'text-primary-600 bg-primary-50 border border-primary-100' : 'text-slate-400 hover:bg-slate-50 border border-transparent'}`}
                  title="Buscar na conversa"
                >
                  <Search size={18} />
                </button>
                <button
                  onClick={() => {
                    if (window.innerWidth < 1024) {
                      setIsMobileDetailsOpen(true);
                    } else {
                      setShowDetails(!showDetails);
                    }
                  }}
                  className={`p-2 rounded-lg transition-all ${showDetails ? 'text-primary-600 bg-primary-50 border border-primary-100' : 'text-slate-400 hover:bg-slate-50 border border-transparent'}`}
                  title={showDetails ? "Esconder Detalhes" : "Mostrar Detalhes"}
                >
                  <Info size={18} />
                </button>

                <div className="relative">
                  <button 
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className={`p-2 rounded-lg transition-all ${showMoreMenu ? 'text-primary-600 bg-primary-50' : 'text-slate-400 hover:bg-slate-50'}`}
                    title="Mais opções"
                  >
                    <MoreVertical size={20} />
                  </button>

                  <AnimatePresence>
                    {showMoreMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-[998]" 
                          onClick={() => setShowMoreMenu(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[999] overflow-hidden"
                        >
                          <button 
                            className="w-full flex items-center justify-start text-left gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            onClick={async () => {
                              setShowMoreMenu(false);
                              const newStatus = activeThread.ticketStatus === 'resolved' ? 'open' : 'resolved';
                              const newFunil = newStatus === 'resolved' ? 'cliente' : 'novo_lead';
                              const cleanPhone = (activeThread.remoteJid || '').split('@')[0].replace(/\D/g, '');
                              await supabase.from('threads').update({ ticket_status: newStatus }).eq('id', activeThread.id);
                              await supabase.from('contacts').update({ status_funil: newFunil }).ilike('telefone', `%${cleanPhone.slice(-8)}%`);
                              setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, ticketStatus: newStatus, funilStatus: newFunil } : t));
                              if (newStatus === 'resolved') toast.success('Conversa marcada como resolvida!');
                            }}
                          >
                            <CheckCircle2 size={16} className={activeThread.ticketStatus === 'resolved' ? "text-emerald-600" : "text-slate-400"} />
                            {activeThread.ticketStatus === 'resolved' ? 'Reabrir Conversa' : 'Marcar como Resolvido'}
                          </button>

                          <button 
                            className="w-full flex items-center justify-start text-left gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            onClick={() => {
                              setShowMoreMenu(false);
                              setShowFollowUpModal(true);
                            }}
                          >
                            <Clock size={16} className={activeThread.pending_followup ? "text-amber-500" : "text-slate-400"} />
                            {activeThread.pending_followup ? 'Ver Follow-up' : 'Agendar Follow-up'}
                          </button>

                          <button 
                            className="w-full flex items-center justify-start text-left gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            onClick={() => {
                              setShowMoreMenu(false);
                              toggleThreadStatus();
                            }}
                          >
                            {activeThread.status === 'ia' ? (
                              <><User size={16} className="text-slate-400" /> Assumir Atendimento</>
                            ) : (
                              <><Bot size={16} className="text-emerald-500" /> Ativar Robô IA</>
                            )}
                          </button>
                          
                          <div className="h-px bg-slate-50 my-1" />
                          
                          <button 
                            className="w-full flex items-center justify-start text-left gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                            onClick={() => {
                              setShowMoreMenu(false);
                              handleDeleteThread(activeThread);
                            }}
                          >
                            <Trash size={16} />
                            Excluir Conversa
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Follow-up Active Banner */}
            {activeThread.pending_followup && (
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <p className="text-[11px] font-bold text-amber-700">
                    Follow-up {activeThread.pending_followup.type === 'ai' ? 'IA' : 'Manual'} agendado para as {new Date(activeThread.pending_followup.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={async () => {
                      const msg = activeThread.pending_followup?.message;
                      const isAi = activeThread.pending_followup?.type === 'ai';
                      if (!msg) return;
                      await handleScheduleFollowUp(msg, 0, isAi);
                      toast.success('Follow-up enviado agora!');
                    }}
                    className="text-[10px] font-black text-amber-800 hover:underline uppercase tracking-widest"
                  >
                    Enviar Agora
                  </button>
                  <button 
                    onClick={async () => {
                      await supabase.from('threads').update({ pending_followup: null }).eq('id', activeThread.id);
                      setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, pending_followup: undefined } : t));
                      toast.success('Agendamento cancelado');
                    }}
                    className="text-[10px] font-black text-red-600 hover:underline uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Barra de busca dentro da conversa */}
            <AnimatePresence>
              {isSearchingMessages && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden shrink-0 bg-white border-b border-slate-100 px-3 py-2 flex items-center gap-2"
                >
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={messageSearchQuery}
                    onChange={e => { setMessageSearchQuery(e.target.value); setSearchResultIdx(0); }}
                    placeholder="Buscar na conversa..."
                    className="flex-1 text-sm outline-none bg-transparent placeholder-slate-400"
                  />
                  {messageSearchDebounced && (
                    searchHits.length > 0 ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-slate-400 font-medium">{searchResultIdx + 1}/{searchHits.length}</span>
                        <button onClick={() => setSearchResultIdx(i => Math.max(0, i - 1))} className="p-1 text-slate-400 hover:text-primary-600 rounded">
                          <ChevronLeft size={14} />
                        </button>
                        <button onClick={() => setSearchResultIdx(i => Math.min(searchHits.length - 1, i + 1))} className="p-1 text-slate-400 hover:text-primary-600 rounded">
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 shrink-0">Sem resultados</span>
                    )
                  )}
                  <button onClick={() => { setIsSearchingMessages(false); setMessageSearchQuery(''); }} className="p-1 text-slate-400 hover:text-red-500 rounded shrink-0">
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Banner de status de conexão */}
            <AnimatePresence>
              {connectionStatus !== 'connected' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`overflow-hidden shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold z-20 ${
                    connectionStatus === 'reconnecting'
                      ? 'bg-amber-500 text-white'
                      : 'bg-red-600 text-white'
                  }`}
                >
                  <Loader2 size={12} className="animate-spin" />
                  {connectionStatus === 'reconnecting'
                    ? 'Reconectando ao servidor...'
                    : 'Sem conexão — verifique sua internet'}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages Area */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              onDragOver={handleDragOver}
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative no-scrollbar"
              style={{
                backgroundColor: '#e5ddd5',
                backgroundImage: 'url(/chat-bg.png)',
                backgroundSize: '400px',
                backgroundRepeat: 'repeat'
              }}>
              {/* Overlay suave para integrar melhor com o tema claro */}
              <div className="absolute inset-0 bg-white/40 pointer-events-none" />

              {isDraggingOver && (
                <div 
                  className="absolute inset-0 bg-primary-500/20 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-dashed border-primary-500 transition-all m-2 rounded-2xl"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="bg-white p-6 rounded-3xl shadow-xl flex flex-col items-center gap-3 animate-in zoom-in-95 duration-200 pointer-events-none">
                    <Paperclip size={40} className="text-primary-500 animate-bounce" />
                    <p className="font-black text-slate-800 text-sm">Arraste seu arquivo aqui</p>
                    <p className="text-xs text-slate-400">Solte para anexar à conversa</p>
                  </div>
                </div>
              )}

              <div className="relative z-10 space-y-4">
              {loadingMessages ? (
                <div className="space-y-6">
                  <Skeleton variant="rect" width="60%" height={60} className="rounded-2xl rounded-tl-none" />
                  <Skeleton variant="rect" width="40%" height={40} className="rounded-2xl rounded-tr-none bg-primary-100 self-end" />
                </div>
              ) : (
                <>
                  {/* Indicador de carregamento de mensagens antigas */}
                  {loadingOlder && (
                    <div className="flex justify-center py-3">
                      <div className="flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full shadow-sm text-xs text-slate-500 font-medium">
                        <Loader2 size={12} className="animate-spin text-primary-500" />
                        Carregando mensagens anteriores...
                      </div>
                    </div>
                  )}
                  {/* Botão para carregar mais quando não está carregando */}
                  {!loadingOlder && hasMoreMessages && messages.length > 0 && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={loadOlderMessages}
                        className="px-4 py-1.5 bg-white/80 rounded-full shadow-sm text-xs text-slate-500 font-medium hover:bg-white transition-colors"
                      >
                        Ver mensagens anteriores
                      </button>
                    </div>
                  )}
                  {visibleMessages.map((msg, idx, arr) => {
                    const prevMsg = idx > 0 ? arr[idx - 1] : null;
                    const showDateHeader = !prevMsg ||
                      new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();
                    const isCurrentSearchHit = msg.id === currentSearchHitId;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateHeader && (
                          <div className="flex justify-center my-8 sticky top-2 z-[30]">
                            <span className="px-5 py-1.5 bg-white/70 backdrop-blur-md text-slate-500 text-[12.5px] font-semibold rounded-2xl shadow-sm border border-white/50">
                              {formatDateHeader(msg.timestamp)}
                            </span>
                          </div>
                        )}
                        <div
                          id={`msg-${msg.id}`}
                          className="transition-all duration-500"
                          ref={isCurrentSearchHit ? (el) => { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } : undefined}
                        >
                          <ChatBubble
                            message={msg}
                            onPreview={setPreviewMedia}
                            onDelete={handleDeleteMessage}
                            onReact={handleReactToMessage}
                            onReply={setReplyingTo}
                            onStar={handleToggleStar}
                            onOpenContact={handleOpenContactChat}
                            onImageLoad={onImageLoadStable}
                            isSelected={selectedMsgIds.has(msg.id)}
                            isSelectionMode={isSelectionMode}
                            onSelect={onMessageSelect}
                            onForward={setForwardingMessage}
                            highlightQuery={messageSearchDebounced || undefined}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {/* Indicador de digitação */}
                  {(activeThread as any)?.isTyping && (
                    <div className="px-1">
                      <TypingIndicator />
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
              </div>

              {/* Scroll to Bottom Floating Button */}
              <AnimatePresence>
                {showScrollButton && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 20 }}
                    onClick={() => {
                      scrollToBottom("smooth");
                      setShowScrollButton(false);
                    }}
                    className="absolute bottom-6 right-8 w-12 h-12 bg-white text-primary-600 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-all z-[100] active:scale-90 group"
                    title="Ir para o final"
                  >
                    <ChevronDown size={24} className="group-hover:translate-y-0.5 transition-transform" />

                    {activeThread.unreadCount && activeThread.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                        {activeThread.unreadCount}
                      </span>
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Replies chips */}
            {quickReplies.length > 0 && (
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                <span className="text-[10px] font-bold text-gray-400 uppercase mr-2 shrink-0">Atalhos:</span>
                {quickReplies.map(reply => (
                  <button
                    key={reply.id}
                    onClick={() => setMessageText(reply.content)}
                    className="px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-600 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border border-primary-100 shadow-sm"
                  >
                    {reply.title}
                  </button>
                ))}
              </div>
            )}

            {/* Barra de seleção múltipla */}
            <AnimatePresence>
              {isSelectionMode && (
                <motion.div
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 60, opacity: 0 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                  className="border-t border-slate-200 bg-white shrink-0 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setIsSelectionMode(false); setSelectedMsgIds(new Set()); }}
                      className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                    >
                      <X size={20} />
                    </button>
                    <span className="text-sm font-bold text-slate-700">
                      {selectedMsgIds.size} selecionada{selectedMsgIds.size !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={selectedMsgIds.size === 0 || isDeletingSelected}
                      onClick={async () => {
                        if (selectedMsgIds.size === 0) return;
                        setIsDeletingSelected(true);
                        try {
                          await supabase.from('messages').delete().in('id', Array.from(selectedMsgIds));
                          setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
                          setSelectedMsgIds(new Set());
                          setIsSelectionMode(false);
                          toast.success(`${selectedMsgIds.size} mensagem${selectedMsgIds.size > 1 ? 's apagadas' : ' apagada'}`);
                        } catch {
                          toast.error('Erro ao apagar mensagens');
                        } finally {
                          setIsDeletingSelected(false);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                    >
                      {isDeletingSelected ? <Loader2 size={14} className="animate-spin" /> : <Trash size={14} />}
                      Apagar
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            {!isSelectionMode && (
            <div className="p-1 md:p-2 border-t border-slate-200 bg-[#f0f2f5] shrink-0 relative">
              {showMeta24hWindow && (
                <WindowCountdown
                  lastInboundAt={activeThreadLastInbound}
                  variant="banner"
                  onTemplatesClick={() => {
                    setTemplatesModalTo((activeThread.remoteJid || '').split('@')[0]);
                    setTemplatesModalOpen(true);
                  }}
                />
              )}
              {replyingTo && (
                <div className="mx-2 mb-2 bg-white rounded-xl border-l-4 border-primary-500 p-3 shadow-sm flex items-start justify-between animate-in slide-in-from-bottom-2 duration-200">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-1">
                      Respondendo a {replyingTo.sender === 'lead' ? activeThread.name : 'Você'}
                    </p>
                    <p className="text-xs text-slate-500 truncate leading-relaxed">
                      {replyingTo.text || (replyingTo.message_type === 'image' ? '📸 Imagem' : replyingTo.message_type === 'audio' ? '🎤 Áudio' : '📎 Arquivo')}
                    </p>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

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
                          ${slashIndex === idx ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
                        onMouseEnter={() => setSlashIndex(idx)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[13px] font-bold ${slashIndex === idx ? 'text-primary-700' : 'text-slate-800'}`}>
                            {reply.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{reply.content}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-end gap-1 md:gap-2 max-w-5xl mx-auto w-full relative">
                <div className={`flex-1 min-w-0 bg-white rounded-[26px] shadow-sm flex items-end px-1 md:px-1.5 py-1 min-h-[52px] relative ${isRecording ? 'hidden md:flex' : 'flex'}`}>
                  {/* Emoji Button */}
                  <div className="relative">
                    <button 
                      type="button" 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                      className={`p-2.5 transition-all ${isRecording ? 'hidden md:block' : 'block'} ${showEmojiPicker ? 'text-primary-600' : 'text-slate-400 hover:text-primary-500'}`}
                    >
                      <Smile size={24} />
                    </button>
                    
                    {showEmojiPicker && (
                      <div className="absolute bottom-full mb-4 left-0 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 w-[280px] md:w-[320px] grid grid-cols-6 gap-2 z-[150] animate-in slide-in-from-bottom-4 duration-300">
                        {['😊', '😂', '🥰', '😍', '🤔', '😎', '👍', '🙏', '❤️', '🔥', '✨', '⭐', '👏', '🙌', '💪', '🤝', '✅', '🚀', '📞', '💬', '📍', '🎁', '💰', '🎉', '💡', '⚠️', '🏠', '🚗', '🍕', '☕'].map(emoji => (
                          <button 
                            key={emoji}
                            onClick={() => {
                              setMessageText(prev => prev + emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="w-10 h-10 flex items-center justify-center hover:bg-primary-50 rounded-xl transition-all text-[20px] hover:scale-125 active:scale-95"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Input Textarea */}
                  <textarea 
                    rows={1} 
                    value={messageText} 
                    onPaste={handlePaste}
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
                      
                      // Auto-resize
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }} 
                    onKeyDown={(e) => { 
                      if (e.key === 'Enter' && !e.shiftKey) { 
                        e.preventDefault(); 
                        handleSendMessage(); 
                      } 
                    }} 
                    placeholder="Mensagem"
                    className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] py-3 px-2 resize-none max-h-48 min-h-[48px] placeholder:text-slate-400" 
                  />

                  {/* Right Icons inside Capsule */}
                  <div className="flex items-center pb-1">
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()} 
                      className="p-1.5 md:p-2.5 text-slate-400 hover:text-primary-500 transition-colors shrink-0"
                    >
                      <Paperclip size={20} className="md:size-[22px] rotate-45" />
                    </button>

                    <button 
                      type="button" 
                      onClick={() => setIsPrivateNoteMode(!isPrivateNoteMode)} 
                      className={`p-1.5 md:p-2.5 transition-all shrink-0 ${isPrivateNoteMode ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Lock size={18} />
                    </button>
                  </div>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </div>

                {/* Floating Action Button */}
                <div className={`${isRecording ? 'flex-1 md:shrink-0' : 'shrink-0'} pb-0.5`}>
                  {messageText.trim() ? (
                    <button
                      onClick={handleSendMessage}
                      disabled={isSending}
                      className="w-12 h-12 md:w-[52px] md:h-[52px] bg-primary-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-primary-500/20 hover:bg-primary-700 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSending
                        ? <Loader2 size={20} className="animate-spin" />
                        : <Send size={20} className="md:size-[22px] ml-1" />}
                    </button>
                  ) : (
                    <VoiceRecorder onStop={handleSendVoice} onRecordingChange={setIsRecording} />
                  )}
                </div>
              </div>
            </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 relative">
            {/* Soft decorative background pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10 flex flex-col items-center max-w-2xl w-full">
              {/* Avatar with Glow */}
              <div className="w-24 h-24 rounded-[2rem] bg-white flex items-center justify-center mb-8 shadow-xl shadow-primary-500/10 border border-slate-100 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary-50 to-transparent"></div>
                <img src="/sofiamini.png" alt="Sofia" className="w-16 h-16 object-cover relative z-10 drop-shadow-sm" />
              </div>
              
              <h3 className="text-[28px] font-black text-slate-800 mb-4 tracking-tight">Atendimento em tempo real</h3>
              <p className="text-[15px] text-slate-500 leading-relaxed mb-12 max-w-lg mx-auto">
                Selecione uma conversa ao lado para visualizar as mensagens, gerenciar o contato e acionar a IA.
              </p>

              {/* Data Cards */}
              <div className="flex gap-4 md:gap-6 justify-center w-full mb-12 flex-wrap">
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm shadow-slate-200/50 flex flex-col items-center justify-center min-w-[140px]">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mb-3">
                    <MessageCircle size={20} />
                  </div>
                  <span className="text-3xl font-black text-slate-800 mb-1">{threads.length}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conversas</span>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm shadow-slate-200/50 flex flex-col items-center justify-center min-w-[140px]">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
                    <MessageSquare size={20} />
                  </div>
                  <span className="text-3xl font-black text-slate-800 mb-1">{threads.filter(t => (t.unreadCount ?? 0) > 0).length}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Não Lidos</span>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm shadow-slate-200/50 flex flex-col items-center justify-center min-w-[140px]">
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-3">
                    <Activity size={20} />
                  </div>
                  <span className="text-3xl font-black text-slate-800 mb-1">{followUpCount}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Follow-up</span>
                </div>
              </div>

              {/* Bottom Tags */}
              <div className="flex flex-wrap justify-center gap-3">
                 <div className="px-5 py-2.5 bg-white rounded-full border border-slate-200 shadow-sm text-[12px] font-bold text-slate-500 flex items-center gap-2 transition-all hover:border-primary-200 hover:text-primary-600">
                    <Bot size={16} className="text-primary-500" /> IA Recepcionista Ativa
                 </div>
                 <div className="px-5 py-2.5 bg-white rounded-full border border-slate-200 shadow-sm text-[12px] font-bold text-slate-500 flex items-center gap-2 transition-all hover:border-emerald-200 hover:text-emerald-600">
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
          animate={{ opacity: 1, width: '22%' }}
          className="hidden lg:flex border-l border-gray-100 flex-col bg-white overflow-hidden"
        >
          {renderContactDetails()}
        </motion.div>
      )}

      {/* Modal de Encaminhar Mensagem */}
      <AnimatePresence>
        {forwardingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50"
            onClick={() => setForwardingMessage(null)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
              className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-900">Encaminhar mensagem</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[240px]">"{forwardingMessage.text?.slice(0, 60)}{(forwardingMessage.text?.length || 0) > 60 ? '…' : ''}"</p>
                </div>
                <button onClick={() => setForwardingMessage(null)} className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                {threads
                  .filter(t => t.id !== selectedThreadId)
                  .slice(0, 20)
                  .map(t => (
                    <button
                      key={t.id}
                      onClick={async () => {
                        if (!forwardingMessage.text) return;
                        try {
                          await sendMessage(t.remoteJid, `↪️ ${forwardingMessage.text}`, undefined);
                          toast.success(`Encaminhado para ${t.name}`);
                          setForwardingMessage(null);
                        } catch {
                          toast.error('Erro ao encaminhar mensagem');
                        }
                      }}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-all text-left"
                    >
                      <ContactAvatar url={t.profilePictureUrl} name={t.name} size="sm" threadId={t.id} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{t.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{t.lastMessage}</p>
                      </div>
                    </button>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Contact Info Modal */}
      {selectedThreadId && activeThread && isMobileDetailsOpen && (
        <motion.div 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          className="fixed inset-0 z-[150] bg-white flex flex-col md:hidden"
        >
          {/* Header Mobile Info */}
          <div className="px-4 h-16 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
             <button 
               onClick={() => window.history.back()}
               className="p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-full transition-all flex items-center gap-2"
             >
               <ArrowLeft size={24} />
               <span className="font-bold text-slate-800">Detalhes do Lead</span>
             </button>
             <button className="p-2 text-slate-400 hover:text-primary-600 rounded-full transition-all">
                <MoreVertical size={20} />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto">
             {renderContactDetails()}
          </div>
        </motion.div>
      )}
      </>
      )}

      {/* Mobile Bottom Navigation */}
      {isFullscreen && (
        <div className={`md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 items-center justify-around z-50 px-2 pb-[env(safe-area-inset-bottom,0px)]
          ${selectedThreadId ? 'hidden' : 'flex'} h-16`}>
          <button 
            onClick={() => { setActiveTab('conversations'); setSelectedThreadId(null); }}
            className={`flex flex-col items-center gap-1 ${activeTab === 'conversations' ? 'text-primary-600' : 'text-slate-400'}`}
          >
            <MessageCircle size={24} fill={activeTab === 'conversations' ? 'currentColor' : 'none'} className={activeTab === 'conversations' ? 'opacity-20' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Conversas</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('contacts')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'contacts' ? 'text-primary-600' : 'text-slate-400'}`}
          >
            <Users size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Contatos</span>
          </button>

          <button 
            onClick={() => setActiveTab('quick_replies')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'quick_replies' ? 'text-primary-600' : 'text-slate-400'}`}
          >
            <MessageSquare size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Atalhos</span>
          </button>

          <button 
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'reports' ? 'text-primary-600' : 'text-slate-400'}`}
          >
            <BarChart3 size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Analytics</span>
          </button>
        </div>
      )}
      {/* Modal para Colar Imagem (Ctrl+V) */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Paperclip size={18} className="text-primary-500" />
                Enviar Imagem Colada
              </h3>
              <button 
                onClick={() => {
                  if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
                  setShowPasteModal(false);
                  setPastedFile(null);
                  setPastedImageUrl(null);
                }}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Preview */}
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/30">
              <div className="relative group rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-white">
                {pastedImageUrl && (
                  <img
                    src={pastedImageUrl}
                    alt="Pasted"
                    loading="lazy"
                    decoding="async"
                    className="w-full max-h-[350px] object-contain mx-auto"
                  />
                )}
              </div>
              
              <div className="mt-6 space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">
                  Legenda (Opcional)
                </label>
                <textarea
                  placeholder="Escreva uma legenda para a imagem..."
                  value={pasteCaption}
                  onChange={(e) => setPasteCaption(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:border-primary-400 focus:ring-4 focus:ring-primary-50 outline-none transition-all resize-none"
                  rows={2}
                  autoFocus
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
                  setShowPasteModal(false);
                  setPastedFile(null);
                  setPastedImageUrl(null);
                }}
                className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendPastedImage}
                disabled={isUploadingPaste}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary-500/20 hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
              >
                {isUploadingPaste ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Enviar Imagem
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewMedia && (() => {
        const isGalleryValid = previewMedia.type === 'image' || previewMedia.type === 'video';
        const galleryMedia = isGalleryValid 
          ? messages
              .filter(m => m.message_type === 'image' || m.message_type === 'video')
              .filter(m => m.media_url)
              .map(m => ({
                url: m.media_url!,
                type: m.message_type as string,
                name: m.media_filename || m.caption || ''
              }))
          : [];
        const currentIndex = galleryMedia.findIndex(m => m.url === previewMedia.url);

        const goNext = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (currentIndex < galleryMedia.length - 1) {
            setPreviewMedia(galleryMedia[currentIndex + 1]);
          }
        };

        const goPrev = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (currentIndex > 0) {
            setPreviewMedia(galleryMedia[currentIndex - 1]);
          }
        };

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10 animate-in fade-in duration-200">
            <button 
              onClick={() => setPreviewMedia(null)}
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-10"
              title="Fechar"
            >
              <X size={28} />
            </button>

            {isGalleryValid && currentIndex > 0 && (
              <button 
                onClick={goPrev}
                className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 rounded-full text-white transition-all z-20 backdrop-blur-md"
                title="Anterior"
              >
                <ChevronLeft size={32} />
              </button>
            )}

            {isGalleryValid && currentIndex !== -1 && currentIndex < galleryMedia.length - 1 && (
              <button 
                onClick={goNext}
                className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 rounded-full text-white transition-all z-20 backdrop-blur-md"
                title="Próxima"
              >
                <ChevronRight size={32} />
              </button>
            )}

            <div className="max-w-7xl max-h-screen w-full h-full flex flex-col items-center justify-center relative">
              {previewMedia.type === 'image' && (
                <img key={previewMedia.url} src={previewMedia.url} alt={previewMedia.name || 'Preview'} className="max-w-full max-h-[85vh] object-contain shadow-2xl animate-in zoom-in duration-300" />
              )}
              
              {previewMedia.type === 'video' && (
                <video key={previewMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-xl shadow-2xl animate-in zoom-in duration-300">
                  <source src={previewMedia.url} />
                  Seu navegador não suporta vídeos.
                </video>
              )}

              {previewMedia.type === 'document' && (
                 <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-6 shadow-2xl animate-in zoom-in duration-300 max-w-sm w-full">
                    <div className="w-24 h-24 rounded-2xl bg-primary-500 flex items-center justify-center text-white">
                      <FileText size={48} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-bold text-slate-800 break-all">{previewMedia.name || 'Documento'}</h3>
                      <p className="text-slate-500 mt-2 text-sm">Este arquivo está pronto para download.</p>
                    </div>
                    <a 
                      href={previewMedia.url} 
                      target="_blank" 
                      download={previewMedia.name}
                      className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition-all shadow-lg"
                    >
                      <Download size={18} /> Download Arquivo
                    </a>
                 </div>
              )}

              {previewMedia.name && previewMedia.type !== 'document' && (
                <div className="absolute bottom-0 left-0 right-0 text-center pb-6">
                  <span className="px-4 py-2 bg-black/40 text-white text-[11px] font-bold rounded-full backdrop-blur-md border border-white/10">
                    {previewMedia.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <FollowUpModal 
        isOpen={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        onSchedule={handleScheduleFollowUp}
        contactName={activeThread?.name || ''}
      />

      <TrackingModal
        isOpen={showTrackingModal}
        onClose={() => setShowTrackingModal(false)}
        trackingData={selectedContact?.ad_tracking || activeThread?.ad_tracking}
      />

      <MetaTemplatesModal
        isOpen={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        to={templatesModalTo}
      />
    </div>
  );
}
