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
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import Finance from './Finance';
import { User as SupabaseUser } from '@supabase/supabase-js';

import { sendMessage } from '../services/whatsappService';
import { listQuickReplies, type QuickReply, listProfessionals, type Professional, updateContact } from '../services/supabaseService';
import Contacts from './Contacts';
import { notificationService } from '../services/notificationService';
import KanbanBoard from './KanbanBoard';
import ReportsDashboard from './ReportsDashboard';
import Integrations from './Integrations';
import QuickReplies from './QuickReplies';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';
import { ContactAvatar } from './ContactAvatar';

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
}

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
}



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
      ${isOutbound ? 'bg-white/10' : 'bg-primary-50/50'}`}>
      <button 
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm
          ${isOutbound ? 'bg-white text-primary-600' : 'bg-primary-600 text-white'}`}
      >
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 space-y-1">
        <div className="h-1 bg-black/10 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${isOutbound ? 'bg-white' : 'bg-primary-600'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-[8px] font-bold uppercase tracking-tighter
          ${isOutbound ? 'text-primary-100' : 'text-slate-400'}`}>
          <span>{playing ? 'Reproduzindo' : 'Mensagem de voz'}</span>
          <span>{duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '--:--'}</span>
        </div>
      </div>
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

const ContactItem: React.FC<{ thread: Thread, active: boolean, onClick: () => void, onDelete: (e: React.MouseEvent) => void }> = ({ thread, active, onClick, onDelete }) => (
  <div 
    onClick={onClick}
    className={`p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 border-b border-slate-100 last:border-0 relative group
      ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
  >
    <div className="relative shrink-0">
      <ContactAvatar url={thread.profilePictureUrl} name={thread.name} size="lg" />
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
      
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-slate-400 font-mono">
          {thread.remoteJid.split('@')[0]}
        </span>
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

const ChatBubble: React.FC<{ 
  message: Message; 
  onPreview: (media: any) => void;
  onDelete: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onStar: (messageId: string, currentStatus: boolean) => void;
}> = ({ message, onPreview, onDelete, onReact, onReply, onStar }) => {
  const isLead = message.sender === 'lead';
  const isPrivate = message.sender === 'private';
  const isExternal = message.is_external;
  const isRevoked = message.message_type === 'revoked';
  
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
            <div className="rounded-lg overflow-hidden border border-black/5 bg-black/5 cursor-pointer hover:opacity-95 transition-opacity"
                 onClick={() => onPreview({ url: message.media_url, type: 'image', name: message.media_filename })}>
              <img src={message.media_url} alt="WhatsApp" className="max-w-full max-h-[300px] object-contain" />
            </div>
            {message.caption && <p className="whitespace-pre-wrap">{message.caption}</p>}
          </div>
        );

      case 'video':
        return (
          <div className="space-y-2">
            <div className="rounded-lg overflow-hidden border border-black/5 bg-black/5 cursor-pointer hover:opacity-95 transition-opacity relative group/video"
                 onClick={() => onPreview({ url: message.media_url, type: 'video', name: message.media_filename })}>
              <video className="max-w-full max-h-[300px]">
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
          <p className="whitespace-pre-wrap break-all">
            {message.text || (message.message_type === 'unknown' ? '[Mídia não suportada]' : '')}
          </p>
        );
    }
  };
  
  return (
    <div className={`flex flex-col mb-1.5 group ${!isLead ? 'items-end' : 'items-start'} relative overflow-hidden`}>
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
          if (info.offset.x > 80) {
            onReply(message);
            if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
              window.navigator.vibrate(10);
            }
          }
        }}
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
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-all z-10">
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
        <div className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all px-2 ${!isLead ? 'flex-row-reverse' : 'flex-row'}`}>
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

export default function Inbox({ user, role, isFullscreen }: { user: SupabaseUser | null, role: string | null, isFullscreen?: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Abertos' | 'Resolvidos' | 'Todos' | 'Lead' | 'Qualificado' | 'Cliente' | 'Não Lidos'>('Abertos');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const { setActiveThreadId } = useNotification();

  useEffect(() => {
    setActiveThreadId(selectedThreadId);
  }, [selectedThreadId, setActiveThreadId]);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [isPrivateNoteMode, setIsPrivateNoteMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversations' | 'contacts' | 'kanban' | 'reports' | 'integrations' | 'quick_replies' | 'finance'>('conversations');
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
  const fetchProfilePicturesInBatch = async (threadsToSync: Thread[]) => {
    // Máximo de 10 simultâneas para não sobrecarregar
    const batchSize = 10;
    for (let i = 0; i < threadsToSync.length; i += batchSize) {
      const chunk = threadsToSync.slice(i, i + batchSize);
      await Promise.allSettled(chunk.map(async (t) => {
        try {
          const phone = t.remoteJid.split('@')[0].replace(/\D/g, '');
          const res = await fetch(`/api/v2/contacts/profile-picture/${phone}`, {
            headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
          });
          const result = await res.json();
          if (result.success && result.url) {
            setThreads(prev => prev.map(pt => pt.id === t.id ? { ...pt, profilePictureUrl: result.url } : pt));
          }
        } catch (e) {}
      }));
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
      funilStatus: contact?.status_funil || 'Lead'
    };
  };

  // Handle JID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jid = params.get('jid');
    if (jid && threads.length > 0) {
      const cleanJid = jid.split('@')[0];
      const thread = threads.find(t => (t.remoteJid || '').split('@')[0] === cleanJid);
      
      if (thread) {
        setSelectedThreadId(thread.id);
      } else {
        // Verifica se já não criamos uma temp thread para esse número
        const hasTemp = threads.some(t => t.id.startsWith('temp-') && (t.remoteJid || '').split('@')[0] === cleanJid);
        if (!hasTemp) {
          // Cria uma thread temporária para que o usuário possa iniciar a conversa
          const tempId = `temp-${Date.now()}`;
          const tempThread: Thread = {
            id: tempId,
            remoteJid: `${cleanJid}@s.whatsapp.net`, // Standardize to backend format
            name: cleanJid,
            lastMessage: 'Iniciar conversa...',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'human',
            updatedAt: new Date().toISOString(),
            ticketStatus: 'open',
            funilStatus: 'Lead'
          };
          
          // Tenta buscar o nome real no CRM
          const resolved = getResolvedContact(cleanJid, tempThread.name);
          tempThread.name = resolved.name;
          tempThread.funilStatus = resolved.funilStatus;

          setThreads(prev => [tempThread, ...prev]);
          setSelectedThreadId(tempId);
        }
      }
    }
  }, [threads.length]);

  // Merge temporary threads with real ones when they arrive from backend
  useEffect(() => {
    if (selectedThreadId?.startsWith('temp-')) {
      const tempThread = threads.find(t => t.id === selectedThreadId);
      if (tempThread) {
        // Procura uma thread real com o mesmo número
        const cleanTempJid = (tempThread.remoteJid || '').split('@')[0];
        const realThread = threads.find(t => !t.id.startsWith('temp-') && (t.remoteJid || '').split('@')[0] === cleanTempJid);
        
        if (realThread) {
          // Muda a seleção para a thread real e remove a temporária do estado
          setSelectedThreadId(realThread.id);
          setThreads(prev => prev.filter(t => t.id !== tempThread.id));
        }
      }
    }
  }, [threads, selectedThreadId]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    // Usamos um pequeno timeout para garantir que o DOM atualizou
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 100);
  };

  useEffect(() => {
    // Se as mensagens mudarem e não estivermos carregando, rola para o fim
    if (!loadingMessages && messages.length > 0) {
      // Se for a primeira carga de uma conversa selecionada (troca de thread), pulamos direto (auto/instant)
      // Se for uma mensagem nova chegando na mesma conversa, fazemos o smooth
      const isNewThread = lastThreadIdRef.current !== selectedThreadId;
      scrollToBottom(isNewThread ? "auto" : "smooth");
      
      // Atualiza a referência da thread atual
      lastThreadIdRef.current = selectedThreadId;
      setShowScrollButton(false); // Reset button on thread change
    }
  }, [messages, loadingMessages, selectedThreadId]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // Se estiver a mais de 300px do fundo, mostra o botão
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollButton(!isAtBottom);
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
              funilStatus: contact?.status_funil || 'Lead',
              is_client: contact?.is_client || false,
              priority: contact?.priority,
              profilePictureUrl: d.profile_picture_url,
              profilePictureUpdatedAt: d.profile_picture_updated_at,
              labels: d.labels || [],
              pending_followup: d.pending_followup
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
                  lastMessageTime: payload.new.last_message_time ? new Date(payload.new.last_message_time).getTime() : 0,
                  ticketStatus: payload.new.ticket_status || 'open',
                  funilStatus: resolved.funilStatus,
                  profilePictureUrl: payload.new.profile_picture_url,
                  pending_followup: payload.new.pending_followup
                };
                return [newThread as any, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              setThreads(prev => {
                const existingIndex = prev.findIndex(t => t.id === payload.new.id);
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
                  lastMessageTime: payload.new.last_message_time ? new Date(payload.new.last_message_time).getTime() : (baseThread?.lastMessageTime || 0),
                  ticketStatus: payload.new.ticket_status || baseThread?.ticketStatus || 'open',
                  time: payload.new.last_message_time ? new Date(payload.new.last_message_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : (baseThread?.time || ''),
                  funilStatus: resolved.funilStatus,
                  profilePictureUrl: payload.new.profile_picture_url || baseThread?.profilePictureUrl,
                  pending_followup: payload.new.pending_followup ?? baseThread?.pending_followup
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
                    funilStatus: payload.new.status_funil || t.funilStatus,
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
            is_external: d.is_external,
            reaction: d.reaction,
            whatsapp_id: d.whatsapp_id,
            status: d.status,
            is_starred: d.is_starred || false,
            quoted_id: d.quoted_id,
            quoted_text: d.quoted_text
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
        is_external: d.is_external,
        reaction: d.reaction,
        whatsapp_id: d.whatsapp_id,
        is_starred: d.is_starred || false,
        quoted_id: d.quoted_id,
        quoted_text: d.quoted_text
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
                <img src={activeThread.profilePictureUrl} alt={activeThread.name} className="w-full h-full object-cover" />
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
                ${activeThread.funilStatus === 'Lead' ? 'bg-primary-50 text-primary-600 border-primary-100' : 
                  activeThread.funilStatus === 'Qualificado' ? 'bg-primary-50 text-primary-600 border-primary-100' : 
                  'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                {activeThread.funilStatus || 'Lead'}
              </span>
              {activeThread.is_client && (
                <span className="bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1">
                  <Star size={10} className="fill-amber-500" /> Cliente
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
                        <button
                          key={idx}
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
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
                            isActive 
                              ? 'bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20' 
                              : 'bg-white text-slate-500 border-slate-200 hover:border-primary-300 hover:text-primary-600'
                          }`}
                        >
                          {lbl}
                        </button>
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
                      <p className="text-[14px] font-black text-slate-900 truncate flex-1">{app.service || 'Procedimento'}</p>
                      <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase ml-2 border shadow-sm
                        ${app.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {app.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold relative z-10 bg-white/50 w-fit px-3 py-1 rounded-full border border-slate-100/50">
                      <Clock size={12} className="text-primary-500" />
                      {new Date(app.start_time).toLocaleDateString('pt-BR')} • {new Date(app.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
              {(['Lead', 'Qualificado', 'Resolvido'] as const).map((status) => {
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
                        toast.success(`Status alterado para ${status}`);
                        // Atualização local imediata para feedback instantâneo
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
                      <div className={`w-3 h-3 rounded-full shadow-sm
                        ${status === 'Lead' ? 'bg-primary-500' : 
                          status === 'Qualificado' ? 'bg-primary-500' : 'bg-emerald-500'}`} 
                      />
                      <span className={`text-[14px] font-bold ${isActive ? 'text-primary-700' : 'text-slate-600'}`}>{status}</span>
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
      setReplyingTo(null);

      // Fase 4: apenas envia — o banco é atualizado pelo backend (Fase 2)
      // e o Realtime listener reflete a mensagem assim que for inserida.
      await sendMessage(activeThread.remoteJid, finalMessageText, currentQuotedId);

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
      
      const phoneNumber = (thread.remoteJid || '').split('@')[0];
      await supabase.from('contacts').delete().ilike('telefone', `%${phoneNumber.slice(-8)}%`);

      toast.success('Conversa excluída');
      if (selectedThreadId === thread.id) setSelectedThreadId(null);
      setThreads(prev => prev.filter(t => t.id !== thread.id));
    } catch (err) {
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
      const response = await fetch('/api/whatsapp/followup/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
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
      formData.append('userId', userId);
      formData.append('remoteJid', activeThread.remoteJid);
      if (pasteCaption.trim()) formData.append('caption', pasteCaption.trim());

      const response = await fetch('/api/whatsapp/send-media', {
        method: 'POST',
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

  const filteredThreads = threads.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.remoteJid.includes(searchTerm);
    let matchesFilter = true;
    if (filterStatus === 'Abertos') matchesFilter = t.ticketStatus !== 'resolved' && t.funilStatus !== 'Resolvido';
    else if (filterStatus === 'Resolvidos') matchesFilter = t.ticketStatus === 'resolved' || t.funilStatus === 'Resolvido';
    else if (filterStatus === 'Cliente') matchesFilter = !!t.is_client;
    else if (filterStatus === 'Não Lidos') matchesFilter = (t.unreadCount || 0) > 0;
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
        <KanbanBoard user={user} threads={threads} onThreadsChange={setThreads} />
      ) : activeTab === 'reports' ? (
        <ReportsDashboard />
      ) : activeTab === 'quick_replies' ? (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative z-10">
          <QuickReplies />
        </div>
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
      ) : activeTab === 'finance' ? (
        <Finance />
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

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] placeholder-slate-400 focus:bg-white focus:border-primary-300 focus:ring-4 focus:ring-primary-50 transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar -mx-1 px-1">
            {(['Abertos', 'Não Lidos', 'Resolvidos', 'Todos', 'Lead', 'Qualificado', 'Cliente'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex-shrink-0
                  ${filterStatus === f 
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-200 border border-primary-500' 
                    : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}
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
      <div className={`${selectedThreadId ? 'flex fixed inset-0 z-[60] md:relative md:inset-auto md:z-0' : 'hidden md:flex'} flex-1 flex-col bg-white overflow-hidden`}>
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

                <ContactAvatar url={activeThread.profilePictureUrl} name={activeThread.name} size="md" />
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-slate-900 leading-tight truncate flex items-center gap-2">
                    {/^\d+$/.test(activeThread.name) ? formatPhone(activeThread.name) : activeThread.name}
                    {activeThread.is_client && <Star size={14} className="fill-amber-500 text-amber-500" />}
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm
                      ${activeThread.funilStatus === 'Resolvido' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        activeThread.funilStatus === 'Qualificado' ? 'bg-primary-50 text-primary-600 border-primary-100' : 
                        'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      {activeThread.funilStatus}
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
                              const newFunil = newStatus === 'resolved' ? 'Resolvido' : 'Lead';
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

            {/* Messages Area */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative no-scrollbar" 
              style={{ 
                backgroundColor: '#e5ddd5', // Cor base similar ao WhatsApp
                backgroundImage: 'url(/chat-bg.png)', 
                backgroundSize: '400px', 
                backgroundRepeat: 'repeat' 
              }}>
              {/* Overlay suave para integrar melhor com o tema claro */}
              <div className="absolute inset-0 bg-white/40 pointer-events-none" />
              
              <div className="relative z-10 space-y-4">
              {loadingMessages ? (
                <div className="space-y-6">
                  <Skeleton variant="rect" width="60%" height={60} className="rounded-2xl rounded-tl-none" />
                  <Skeleton variant="rect" width="40%" height={40} className="rounded-2xl rounded-tr-none bg-primary-100 self-end" />
                </div>
              ) : (
                <>
                  {messages
                    .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
                    .map((msg, idx, filteredArr) => {
                      const prevMsg = idx > 0 ? filteredArr[idx - 1] : null;
                      const showDateHeader = !prevMsg || 
                        new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();
                      
                      return (
                        <React.Fragment key={msg.id}>
                          {showDateHeader && (
                            <div className="flex justify-center my-8 sticky top-2 z-[30]">
                              <span className="px-5 py-1.5 bg-white/70 backdrop-blur-md text-slate-500 text-[12.5px] font-semibold rounded-2xl shadow-sm border border-white/50">
                                {formatDateHeader(msg.timestamp)}
                              </span>
                            </div>
                          )}
                          <div id={`msg-${msg.id}`} className="transition-all duration-500">
                            <ChatBubble 
                              message={msg} 
                              onPreview={setPreviewMedia} 
                              onDelete={handleDeleteMessage} 
                              onReact={handleReactToMessage}
                              onReply={(m) => setReplyingTo(m)}
                              onStar={handleToggleStar}
                            />
                          </div>
                        </React.Fragment>
                      );
                    })}
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
                    onClick={() => scrollToBottom("smooth")}
                    className="absolute bottom-6 right-6 w-10 h-10 bg-white text-slate-600 rounded-full shadow-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all z-[100] active:scale-90 group"
                    title="Ir para o final"
                  >
                    <ChevronDown size={20} className="group-hover:translate-y-0.5 transition-transform" />
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

            {/* Input Area */}
            <div className="p-1 md:p-2 border-t border-slate-200 bg-[#f0f2f5] shrink-0 relative">
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
                      className="w-12 h-12 md:w-[52px] md:h-[52px] bg-primary-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-primary-500/20 hover:bg-primary-700 transition-all active:scale-95"
                    >
                      <Send size={20} className="md:size-[22px] ml-1" />
                    </button>
                  ) : (
                    <VoiceRecorder onStop={handleSendVoice} onRecordingChange={setIsRecording} />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 relative">
            {/* Soft decorative background pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-primary-500/10 border border-slate-100/50">
                <MessageCircle size={56} className="text-primary-500/80" />
              </div>
              <h3 className="text-[22px] font-bold text-slate-800 mb-3 tracking-tight">Sua Caixa de Entrada</h3>
              <p className="max-w-sm text-[14px] text-slate-500 leading-relaxed">
                Selecione uma conversa na lista ao lado para visualizar as mensagens e gerenciar o atendimento de forma centralizada.
              </p>
              <div className="mt-10 flex gap-4">
                 <div className="px-5 py-2.5 bg-white rounded-full border border-slate-200/60 shadow-sm text-[12px] font-semibold text-slate-500 flex items-center gap-2">
                    <Bot size={16} className="text-primary-500" /> IA Ativa
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
          animate={{ opacity: 1, width: '22%' }}
          className="hidden lg:flex border-l border-gray-100 flex-col bg-white overflow-hidden"
        >
          {renderContactDetails()}
        </motion.div>
      )}

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
        <div className={`md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 items-center justify-around z-50 px-2
          ${selectedThreadId ? 'hidden' : 'flex'}`}>
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

      {previewMedia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10 animate-in fade-in duration-200">
          <button 
            onClick={() => setPreviewMedia(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-10"
            title="Fechar"
          >
            <X size={28} />
          </button>

          <div className="max-w-7xl max-h-screen w-full h-full flex flex-col items-center justify-center relative">
            {previewMedia.type === 'image' && (
              <img src={previewMedia.url} alt={previewMedia.name || 'Preview'} className="max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in duration-300" />
            )}
            
            {previewMedia.type === 'video' && (
              <video controls autoPlay className="max-w-full max-h-full rounded-xl shadow-2xl animate-in zoom-in duration-300">
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
      )}

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
    </div>
  );
}
