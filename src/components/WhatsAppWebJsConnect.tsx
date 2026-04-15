import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle2, XCircle, RefreshCw, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
  </svg>
);

/**
 * WhatsApp Connection status values:
 *  - 'disconnected': No session, show "Gerar QR Code" button
 *  - 'connecting': Session initializing or waiting for QR scan, show spinner + QR if available
 *  - 'waiting': QR shown, poll until 'connected'
 *  - 'connected': Authenticated, show "Desconectar" button
 */
type Status = 'disconnected' | 'connecting' | 'waiting' | 'connected';

export default function WhatsAppWebJsConnect({ user: propUser }: { user?: any }) {
  const [status, setStatus] = useState<Status>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(propUser);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (propUser) setUser(propUser);
  }, [propUser]);

  // Clear any running poll
  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Poll backend status every 3s until connected or disconnected
  const startPolling = (userId: string) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/restore/${userId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'connected') {
          setStatus('connected');
          setQr(null);
          clearPoll();
          toast.success('WhatsApp Conectado com Sucesso!');
        } else if (data.status === 'disconnected') {
          // Only reset to disconnected if we were in 'connecting' state
          // (not 'waiting' - means QR is shown but not yet scanned)
          setStatus(prev => {
            if (prev === 'waiting') return prev; // keep QR visible
            return 'disconnected';
          });
        }
        // 'connecting' → keep current state (Chrome still loading)
      } catch (err) {
        console.error('[WhatsAppConnect] Poll error:', err);
      }
    }, 3000);
  };

  // On mount: call /restore — read-only, never destroys anything
  useEffect(() => {
    if (!user?.id) return;

    const restoreSession = async () => {
      try {
        const res = await fetch(`/api/sessions/restore/${user.id}`);
        if (!res.ok) return;
        const data = await res.json();

        console.log('[WhatsAppConnect] Restore result:', data.status);

        if (data.status === 'connected') {
          setStatus('connected');
          setQr(null);
        } else if (data.status === 'connecting') {
          // Chrome is loading or QR not yet generated — show spinner and poll
          setStatus('connecting');
          startPolling(user.id);
        }
        // 'disconnected' → leave as default (show button)
      } catch (err) {
        console.error('[WhatsAppConnect] Error restoring session:', err);
      }
    };

    restoreSession();

    return () => clearPoll();
  }, [user?.id]);

  const handleConnect = async () => {
    if (!user) return;

    // Disconnect
    if (status === 'connected') {
      try {
        setLoading(true);
        const { disconnectWhatsApp } = await import('../services/whatsappService');
        await disconnectWhatsApp();
        setStatus('disconnected');
        setQr(null);
        clearPoll();
        toast.success('WhatsApp desconectado com sucesso!');
      } catch (error: any) {
        toast.error(error.message || 'Erro ao desconectar');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Connect — only called when truly disconnected
    setLoading(true);
    setStatus('connecting');
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
        let errorMsg = `Erro do servidor: ${text.substring(0, 100)}`;
        try { errorMsg = JSON.parse(text).error || errorMsg; } catch {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('[WhatsAppConnect] Success response:', data);

      if (data.qr) {
        setQr(data.qr);
        setStatus('waiting');
        toast.info('QR Code gerado! Escaneie no seu WhatsApp.');
        startPolling(user.id); // Poll until scanned
      } else if (data.status === 'connected') {
        setStatus('connected');
        setQr(null);
        toast.success('Sessão restaurada! WhatsApp já estava conectado.');
      } else if (data.status === 'connecting') {
        setStatus('connecting');
        toast.info('Restaurando conexão...');
        startPolling(user.id);
      }
    } catch (error: any) {
      console.error('[WhatsAppConnect] Error connecting:', error);
      setStatus('disconnected');
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Status badge
  const renderBadge = () => {
    if (status === 'connected') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
          <CheckCircle2 size={12} /> Conectado
        </span>
      );
    }
    if (status === 'waiting') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-100">
          <RefreshCw size={12} className="animate-spin" /> Aguardando QR
        </span>
      );
    }
    if (status === 'connecting' || loading) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
          <Loader2 size={12} className="animate-spin" /> Conectando
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
        <XCircle size={12} /> Desconectado
      </span>
    );
  };

  // Button label
  const renderButton = () => {
    if (loading) return <Loader2 size={16} className="animate-spin" />;
    if (status === 'connected') return <>Desconectar</>;
    if (status === 'connecting') return <><Loader2 size={16} className="animate-spin" /> Iniciando...</>;
    return <><QrCode size={16} /> Gerar QR Code</>;
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
        {renderBadge()}
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-bold text-gray-900 mb-2">WhatsApp Provider</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          Conecte seu número de WhatsApp para que seus agentes de IA possam responder seus clientes automaticamente.
        </p>

        {/* QR Code — only show when waiting for scan */}
        {qr && status === 'waiting' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200"
          >
            <div className="bg-white p-2 rounded-xl shadow-sm mb-2">
              <img src={qr} alt="WhatsApp QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-gray-400 text-center mt-2 px-2">
              Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código.
            </p>
          </motion.div>
        )}

        {/* Spinner while connecting */}
        {status === 'connecting' && !qr && (
          <div className="flex flex-col items-center justify-center p-8 text-gray-400">
            <Loader2 size={32} className="animate-spin mb-3 text-blue-500" />
            <p className="text-sm font-medium">Iniciando WhatsApp Web...</p>
            <p className="text-xs mt-1 text-gray-300">Isso pode levar até 30 segundos</p>
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between gap-4">
        <button
          id="whatsapp-action-btn"
          onClick={handleConnect}
          disabled={loading || status === 'connecting'}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-70 ${
            status === 'connected'
              ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200'
          }`}
        >
          {renderButton()}
        </button>
      </div>
    </motion.div>
  );
}
