import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle2, XCircle, RefreshCw, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
  </svg>
);

export default function WhatsAppWebJsConnect({ user: propUser }: { user?: any }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(propUser);

  useEffect(() => {
    if (propUser) setUser(propUser);
  }, [propUser]);

  // Fetch initial status
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/sessions/status/${user.id}`)
      .then(res => res.json())
      .then(data => {
        setSession(prev => {
          if (prev?.status === 'waiting') return prev; // Don't overwrite if currently waiting for QR
          return { ...prev, status: data.status };
        });
      })
      .catch(console.error);
  }, [user?.id]);

  // Poll status while waiting for QR scan
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    if (user?.id && session?.status === 'waiting') {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/sessions/status/${user.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'connected') {
              setSession(prev => ({ ...prev, status: 'connected', qr: null }));
              toast.success('WhatsApp Conectado com Sucesso!');
            }
          }
        } catch (err) {
          console.error('Error polling status:', err);
        }
      }, 3000);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [user?.id, session?.status]);

  const handleAction = async () => {
    if (!user) return;
    
    if (session?.status === 'connected') {
      try {
        setLoading(true);
        const { disconnectWhatsApp } = await import('../services/whatsappService');
        await disconnectWhatsApp();
        setSession({ ...session, status: 'disconnected', qr: null });
        toast.success('WhatsApp desconectado com sucesso!');
      } catch (error: any) {
        console.error('Error disconnecting:', error);
        toast.error(error.message || 'Erro ao desconectar');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      console.log('[WhatsAppConnect] Calling /api/sessions/create...');
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      
      console.log('[WhatsAppConnect] Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[WhatsAppConnect] Error response text:', text);
        try {
          const error = JSON.parse(text);
          throw new Error(error.error || 'Falha ao iniciar sessão');
        } catch (e) {
          throw new Error(`Erro do servidor (HTML): ${text.substring(0, 100)}...`);
        }
      }

      const data = await response.json();
      console.log('[WhatsAppConnect] Success response:', data);
      
      if (data.qr) {
        setSession({ ...(session || {}), qr: data.qr, status: 'waiting' });
        toast.info('QR Code gerado! Escaneie no seu WhatsApp.');
      } else if (data.status === 'connected') {
        setSession({ ...(session || {}), status: 'connected', qr: null });
        toast.success('Sessão Restaurada! Seu WhatsApp já estava conectado e pronto para uso.');
      } else {
        toast.info(data.message || 'Iniciando conexão...');
      }
    } catch (error: any) {
      console.error('Error connecting:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const testTop = async () => {
    try {
      const response = await fetch('/api/test-top');
      const text = await response.text();
      toast.success(`Top API: ${text}`);
    } catch (err) {
      toast.error(`Erro Top API: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const testApi = async () => {
    try {
      const response = await fetch('/api/health-check');
      const data = await response.json();
      toast.success(`API Conectada: ${data.timestamp}`);
    } catch (err) {
      toast.error(`Erro ao conectar na API: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col h-full"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shadow-sm">
          <WhatsAppIcon />
        </div>
        
        {session?.status === 'connected' ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
            <CheckCircle2 size={12} /> Conectado
          </span>
        ) : session?.status === 'waiting' ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-100">
            <RefreshCw size={12} className="animate-spin" /> Aguardando QR
          </span>
        ) : loading ? (
           <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
            <Loader2 size={12} className="animate-spin" /> Conectando
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
            <XCircle size={12} /> Desconectado
          </span>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-bold text-gray-900 mb-2">WhatsApp Provider</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          Conecte seu número de WhatsApp para que seus agentes de IA possam responder seus clientes automaticamente.
        </p>

        {session?.qr && session.status === 'waiting' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200"
          >
            <div className="bg-white p-2 rounded-xl shadow-sm mb-2">
              <img src={session.qr} alt="WhatsApp QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-gray-400 text-center mt-2 px-2">
              Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código.
            </p>
          </motion.div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between gap-4">
        <button
          onClick={handleAction}
          disabled={loading}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-70 ${
            session?.status === 'connected'
              ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200'
          }`}
        >
          {loading ? (
             <Loader2 size={16} className="animate-spin" />
          ) : session?.status === 'connected' ? (
            <>
              Desconectar
            </>
          ) : (
            <>
              <QrCode size={16} /> Gerar QR Code
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
