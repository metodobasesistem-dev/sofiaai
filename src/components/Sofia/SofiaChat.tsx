import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Sparkles, Brain, Bot, User, Mic, Square, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { transcribeAudio } from '../../services/supabaseService';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export default function SofiaChat() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sofia_chat_open') === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('sofia_chat_open', isOpen.toString());
  }, [isOpen]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard Handling for Mobile
  const [viewportHeight, setViewportHeight] = useState('100dvh');
  
  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(`${height}px`);
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      scrollToBottom();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchHistory = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const response = await fetch('/api/v2/sofia/history', {
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`
        }
      });
      const data = await response.json();
      
      // Se a Sofia estiver desativada nas configurações, escondemos o widget
      if (data.active === false) {
        setIsVisible(false);
      }

      if (Array.isArray(data.history)) {
        setMessages(data.history);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMsg = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch('/api/v2/sofia/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session?.access_token}`
        },
        body: JSON.stringify({ message: userMsg })
      });

      const data = await response.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch (error) {
      console.error('Sofia error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ops, tive um erro técnico. Pode tentar novamente?' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Audio Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error starting recording:', err);
      toast.error('Não foi possível acessar o microfone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleAudioUpload = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(blob);
      if (text && text.trim()) {
        setInputValue(text);
        // Opcional: enviar automaticamente
        // handleSend(text); 
      }
    } catch (err) {
      console.error('Transcription error:', err);
      toast.error('Erro ao processar áudio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`fixed z-[100] transition-all duration-500 ${
      isOpen 
        ? 'inset-0 md:inset-auto md:bottom-8 md:right-8 flex items-end md:items-center justify-center bg-slate-900/40 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none p-0' 
        : 'bottom-24 right-6 md:bottom-8 md:right-8'
    }`}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            style={{ 
              height: typeof window !== 'undefined' && window.innerWidth < 768 ? viewportHeight : '650px' 
            }}
            className="w-full md:w-[450px] bg-white md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative border border-slate-200 md:mb-0"
          >
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-between shadow-lg z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl overflow-hidden border-2 border-white/30 transition-transform hover:scale-105">
                  <img src="/sofiamini.png" alt="Sofia" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight">Zyreo <span className="opacity-80">Sofia</span></h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Online e aprendendo</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-2xl transition-all active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center text-violet-500">
                    <Brain size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">Sou a sua inteligência central</h4>
                    <p className="text-xs text-slate-500">Conte-me sobre seu negócio, peça conselhos ou peça para eu memorizar algo importante.</p>
                  </div>
                </div>
              )}
              
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-violet-600 text-white rounded-tr-none' 
                      : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 p-3 rounded-2xl rounded-tl-none border border-slate-200">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
              <div className="relative flex items-center gap-3">
                {isRecording ? (
                  <div className="flex-1 bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-3 text-violet-600 font-black text-sm">
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                      {formatTime(recordingTime)}
                    </div>
                    <button 
                      onClick={stopRecording}
                      className="w-10 h-10 flex items-center justify-center bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-colors"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  </div>
                ) : (
                  <div className="relative flex-1 group">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={isTranscribing ? "Processando áudio..." : "Fale com a Sofia..."}
                      disabled={isTranscribing}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] pl-5 pr-14 py-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 focus:bg-white transition-all disabled:opacity-50 placeholder:text-slate-400"
                    />
                    <button 
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isLoading || isTranscribing}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-2xl transition-all ${
                        isRecording ? 'text-red-500 bg-red-50' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50 active:scale-90'
                      }`}
                    >
                      {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : <Mic size={20} />}
                    </button>
                  </div>
                )}
                
                <button
                  onClick={handleSend}
                  disabled={isLoading || !inputValue.trim() || isRecording || isTranscribing}
                  className="w-14 h-14 bg-violet-600 text-white rounded-[1.5rem] flex items-center justify-center hover:bg-violet-700 disabled:opacity-50 disabled:grayscale transition-all shadow-xl shadow-violet-200 active:scale-95"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-center text-slate-300 mt-4 flex items-center justify-center gap-2">
                <Sparkles size={10} className="text-violet-400" />
                Zyreo Sofia Governance
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      {isVisible && !isOpen && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-3xl flex items-center justify-center text-white shadow-2xl transition-all duration-500 overflow-hidden border-2
            ${isOpen ? 'bg-slate-800 rotate-90 border-slate-700' : 'bg-white border-primary-100 p-1.5'}`}
        >
          {isOpen ? <X size={28} className="text-white" /> : (
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-inner">
              <img src="/sofiamini.png" alt="Sofia" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 right-1 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"></span>
            </div>
          )}
        </motion.button>
      )}
    </div>
  );
}
