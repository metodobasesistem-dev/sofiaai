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
  const [isOpen, setIsOpen] = useState(false);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      scrollToBottom();
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
    <div className="fixed bottom-20 right-6 z-[100] md:bottom-6">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 100, x: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 100, x: 50 }}
            className="mb-4 w-[90vw] md:w-[400px] h-[550px] bg-white/90 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden border border-white/20">
                  <img src="/sofiamini.png" alt="Sofia" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Assistente Sofia</h3>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                    <span className="text-[10px] opacity-80">Online e aprendendo</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
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

            {/* Input */}
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <div className="relative flex items-center gap-2">
                {isRecording ? (
                  <div className="flex-1 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-2 text-violet-600 font-bold text-xs">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      Gravando... {formatTime(recordingTime)}
                    </div>
                    <button 
                      onClick={stopRecording}
                      className="text-violet-600 hover:text-violet-800"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  </div>
                ) : (
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={isTranscribing ? "Processando áudio..." : "Fale com a Sofia..."}
                      disabled={isTranscribing}
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all disabled:opacity-50"
                    />
                    <button 
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isLoading || isTranscribing}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                        isRecording ? 'text-red-500 bg-red-50' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'
                      }`}
                    >
                      {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                    </button>
                  </div>
                )}
                
                <button
                  onClick={handleSend}
                  disabled={isLoading || !inputValue.trim() || isRecording || isTranscribing}
                  className="w-11 h-11 bg-violet-600 text-white rounded-2xl flex items-center justify-center hover:bg-violet-700 disabled:opacity-50 disabled:hover:bg-violet-600 transition-all shadow-lg shadow-violet-200"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-3 flex items-center justify-center gap-1">
                <Sparkles size={10} />
                Sofia usa IA para aprender com você.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      {isVisible && (
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
