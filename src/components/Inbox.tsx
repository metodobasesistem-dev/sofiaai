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
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import { User as SupabaseUser } from '@supabase/supabase-js';

import { sendMessage } from '../services/whatsappService';
import { listQuickReplies, type QuickReply } from '../services/supabaseService';

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
  sender: 'lead' | 'ia' | 'outbound';
  time: string;
  timestamp: any;
  audio_url?: string;
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
    className={`p-4 flex items-start gap-4 cursor-pointer transition-all duration-300 border-b border-slate-100 last:border-0 relative group
      ${active ? 'bg-white shadow-md z-10' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
  >
    {active && (
      <motion.div 
        layoutId="activeContact"
        className="absolute inset-y-0 left-0 w-1.5 bg-blue-600 rounded-r-lg"
      />
    )}
    <div className="w-13 h-13 rounded-2xl bg-slate-200 shrink-0 flex items-center justify-center text-slate-500 overflow-hidden relative border border-slate-50 group-hover:scale-105 transition-transform">
      {thread.status === 'ia' && (
        <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full z-10 animate-pulse" />
      )}
      <User size={24} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <h4 className={`text-sm font-black truncate tracking-tight ${active ? 'text-blue-600' : 'text-slate-900 group-hover:text-blue-500 transition-colors'}`}>{thread.name}</h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{thread.time}</span>
          <button 
            onClick={(e) => { e.stopPropagation(); (window as any).handleDeleteThread(thread); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
            title="Excluir conversa"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 truncate mb-2 leading-relaxed">{thread.lastMessage}</p>
      <div className="flex items-center justify-between">
        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border
          ${thread.status === 'ia' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
          {thread.status === 'ia' ? (thread.agent_name || 'Robô IA') : 'Aguardando'}
        </span>
        {thread.unreadCount && thread.unreadCount > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-black w-5 h-5 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
            {thread.unreadCount}
          </span>
        )}
      </div>
    </div>
  </div>
);

const ChatBubble: React.FC<{ message: Message }> = ({ message }) => (
  <div className={`flex flex-col mb-6 ${message.sender !== 'lead' ? 'items-end' : 'items-start'} group`}>
    <div className={`max-w-[85%] p-4 rounded-[2rem] text-[13.5px] leading-relaxed shadow-xl relative backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]
      ${message.sender !== 'lead' 
        ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-tr-none shadow-blue-500/20' 
        : 'bg-white/80 text-slate-800 border-2 border-white/50 rounded-tl-none shadow-slate-200/50'}`}>
      
      {message.audio_url ? (
        <AudioPlayer url={message.audio_url} isOutbound={message.sender !== 'lead'} />
      ) : (
        <p className="font-medium whitespace-pre-wrap">{message.text}</p>
      )}

      <div className={`flex items-center gap-1.5 mt-2 text-[10px] font-black opacity-60 tracking-wider ${message.sender !== 'lead' ? 'text-blue-100 justify-end' : 'text-slate-400'}`}>
        {message.time}
        {message.sender !== 'lead' && <CheckCheck size={14} className="stroke-[3]" />}
      </div>
    </div>
    
    {(message.sender === 'ia' || message.sender === 'outbound') && (
      <div className="flex items-center gap-1.5 mt-2 mr-2">
        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm
          ${message.sender === 'ia' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
          {message.sender === 'ia' ? <Bot size={10} /> : <User size={10} />}
          {message.sender === 'ia' ? 'Inteligência Artificial' : 'Atendente Real'}
        </div>
      </div>
    )}
  </div>
);

export default function Inbox({ user, role }: { user: SupabaseUser | null, role: string | null }) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            sender: d.direction === 'inbound' ? 'lead' : (d.message_id?.startsWith('ai-') ? 'ia' : 'outbound'),
            time: d.created_at ? new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            timestamp: d.created_at,
            audio_url: d.audio_url
          }));
          setMessages(formatted as any);
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
                sender: d.direction === 'inbound' ? 'lead' : (d.message_id?.startsWith('ai-') ? 'ia' : 'outbound'),
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
      // 1. Send via API directly (no browser Buffer needed)
      
      // 2. Call backend upload logic? No, let's keep it simple: 
      // Send directly via websocket/service if available, or a new API route.
      // Since we already have whatsappService.sendVoice in the backend, 
      // we'll need a way for the frontend to trigger it with a buffer.
      
      // For now, let's use a FormData upload to our own API
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
      
      // Alterar para modo humano ao interagir
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
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Alterar para modo humano ao interagir
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

    try {
      // Send via WhatsApp Service
      await sendMessage(activeThread.remoteJid, text);
      
      // Update thread status to 'human' when user sends a message
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

      // 1. Delete Messages
      await supabase.from('messages').delete().eq('user_id', userId);
      // 2. Delete Threads
      await supabase.from('threads').delete().eq('user_id', userId);
      // 3. Delete Contacts
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
      // 1. Delete Messages first
      await supabase.from('messages').delete().eq('thread_id', thread.id);
      // 2. Delete Thread
      await supabase.from('threads').delete().eq('id', thread.id);
      
      // 3. Optional: Delete Contact if it's not linked to other threads (Simplified: delete always as requested)
      const phoneNumber = thread.remoteJid.split('@')[0];
      await supabase.from('contacts').delete().ilike('telefone', `%${phoneNumber.slice(-8)}%`);

      toast.success('Conversa excluída');
      if (selectedThreadId === thread.id) setSelectedThreadId(null);
      setThreads(prev => prev.filter(t => t.id !== thread.id));
    } catch (err) {
      toast.error('Erro ao excluir conversa');
    }
  };

  // Expose to ContactItem
  useEffect(() => {
    (window as any).handleDeleteThread = handleDeleteThread;
  }, [threads, selectedThreadId]);

  const filteredThreads = threads.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.remoteJid.includes(searchTerm);
    const matchesFilter = filterStatus === 'Todos' || t.funilStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="h-[calc(100vh-120px)] bg-white rounded-xl border border-gray-200 shadow-sm flex overflow-hidden">
      {/* Left Column: Contact List */}
      <div className="w-full md:w-[35%] lg:w-[30%] border-r border-gray-100 flex flex-col bg-gray-50/30">
        <div className="p-4 border-b border-slate-100 bg-white space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Conversas</h2>
            <button 
              onClick={handleClearAll}
              disabled={isCleaning || threads.length === 0}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 disabled:opacity-30 disabled:grayscale transition-all flex items-center gap-1"
            >
              {isCleaning ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
              Limpar Tudo
            </button>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors z-10" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar leads..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 border-2 border-transparent rounded-2xl text-[13px] font-bold placeholder-slate-400 focus:bg-white focus:border-blue-200/50 transition-all outline-none relative z-10 shadow-inner"
            />
          </div>

          {/* Funnel Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
            {(['Todos', 'Lead', 'Qualificado', 'Cliente'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border
                  ${filterStatus === f 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200' 
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'}`}
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
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 p-4 text-center">
              <p className="text-xs">Nenhuma conversa nesta categoria.</p>
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
      <div className="hidden md:flex flex-1 flex-col bg-white">
        {selectedThreadId && activeThread ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{activeThread.name}</h3>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-[10px] text-gray-500 font-medium">Online</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button 
                  onClick={toggleThreadStatus}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors border
                    ${activeThread.status === 'ia' 
                      ? 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100' 
                      : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}`}
                >
                  {activeThread.status === 'ia' ? 'Assumir Atendimento' : 'Ativar Robô IA'}
                </button>
                <div className="flex items-center gap-2 text-gray-400">
                  <button className="p-2 hover:bg-gray-50 rounded-lg"><Phone size={18} /></button>
                  <button className="p-2 hover:bg-gray-50 rounded-lg"><Video size={18} /></button>
                  <button className="p-2 hover:bg-gray-50 rounded-lg"><MoreVertical size={18} /></button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa] space-y-2">
              {loadingMessages ? (
                <div className="space-y-6">
                  <div className="flex flex-col items-start space-y-2">
                    <Skeleton variant="rect" width="60%" height={60} className="rounded-2xl rounded-tl-none" />
                    <Skeleton variant="text" width="20%" />
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <Skeleton variant="rect" width="40%" height={40} className="rounded-2xl rounded-tr-none bg-blue-100" />
                    <Skeleton variant="text" width="15%" />
                  </div>
                  <div className="flex flex-col items-start space-y-2">
                    <Skeleton variant="rect" width="50%" height={80} className="rounded-2xl rounded-tl-none" />
                    <Skeleton variant="text" width="25%" />
                  </div>
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

            {/* Typing Bar Premium */}
            <div className="p-6 border-t border-slate-100 bg-white shrink-0">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
              />
              <div className="flex items-center gap-4 mb-3">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all shadow-sm border border-slate-100"
                >
                  <Paperclip size={20} />
                </button>
                <div className="flex-1" />
                <VoiceRecorder onStop={handleSendVoice} />
              </div>
              
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="flex items-end gap-3 bg-slate-50 p-4 rounded-[1.5rem] border-2 border-slate-100 focus-within:border-indigo-400 focus-within:ring-8 focus-within:ring-indigo-500/5 transition-all shadow-inner"
              >
                <textarea 
                  rows={1}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Escreva sua mensagem com carinho..." 
                  className="flex-1 bg-transparent border-none focus:ring-0 text-[14px] py-1 px-1 resize-none max-h-32 min-h-[30px] leading-relaxed placeholder-slate-400 font-semibold text-slate-700"
                />
                <button 
                  type="submit"
                  className={`p-4 rounded-2xl transition-all duration-500 flex items-center justify-center
                    ${messageText.trim() 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-200 hover:scale-105 active:scale-95' 
                      : 'bg-slate-200 text-white opacity-50 cursor-not-allowed'}`}
                  disabled={!messageText.trim()}
                >
                  <Send size={20} className={messageText.trim() ? 'animate-in fade-in zoom-in' : ''} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <MessageCircle size={40} className="text-gray-200" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Sua Caixa de Entrada</h3>
            <p className="max-w-xs text-sm">Selecione uma conversa ao lado para visualizar as mensagens e interagir com seus leads.</p>
          </div>
        )}
      </div>

      {/* Mobile Placeholder for Chat (when on mobile) */}
      <div className="md:hidden flex-1 flex items-center justify-center p-8 text-center text-gray-400">
        <p className="text-sm">Selecione uma conversa para visualizar no desktop ou use a versão mobile otimizada.</p>
      </div>
    </div>
  );
}
