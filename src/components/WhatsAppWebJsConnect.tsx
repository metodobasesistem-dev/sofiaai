import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle2, XCircle, RefreshCw, QrCode, PhoneOff } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const WhatsAppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
  </svg>
);

type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting' | 'connected';

interface Props {
  user?: any;
}

/**
 * Professional WhatsApp connection card.
 *
 * Architecture:
 *  1. On mount → call /api/sessions/restore (read-only, never destroys session)
 *  2. Subscribe to Supabase Realtime changes on profiles.whatsapp_status
 *     → status updates arrive automatically when backend changes the DB
 *  3. When user clicks "Gerar QR Code" → POST /api/sessions/create → get QR
 *  4. Poll /api/sessions/restore every 4s ONLY while waiting for QR scan
 *  5. On scan → backend updates profiles.whatsapp_status → Realtime fires → UI updates
 */
export default function WhatsAppWebJsConnect({ user: propUser }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeRef = useRef<any>(null);
  const statusRef = useRef<ConnectionStatus>('disconnected');

  // Keep statusRef in sync for use inside closures
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const updateStatus = (s: ConnectionStatus, newQr?: string | null) => {
    setStatus(s);
    statusRef.current = s;
    if (newQr !== undefined) setQr(newQr);
  };

  // ─── Stop QR polling ───────────────────────────────────────────────────────
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ─── Poll backend while waiting for QR scan ───────────────────────────────
  const startQrPolling = (uid: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/restore/${uid}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'connected') {
          updateStatus('connected', null);
          stopPolling();
          toast.success('WhatsApp Conectado com Sucesso! 🎉');
        }
        // 'connecting' / 'waiting' → keep polling
        // 'disconnected' → keep showing QR (don't reset — user might still be scanning)
      } catch { /* noop */ }
    }, 4000);
  };

  // ─── Supabase Realtime subscription ───────────────────────────────────────
  const subscribeRealtime = (uid: string) => {
    // Unsubscribe from any previous channel
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }

    const channel = supabase
      .channel(`whatsapp_status_${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${uid}`,
        },
        (payload) => {
          const newStatus = payload.new?.whatsapp_status as string;
          console.log('[WhatsAppConnect] Realtime update:', newStatus);

          if (newStatus === 'connected') {
            updateStatus('connected', null);
            stopPolling();
            if (statusRef.current !== 'connected') {
              toast.success('WhatsApp Conectado! 🎉');
            }
          } else if (newStatus === 'connecting') {
            if (statusRef.current === 'disconnected') {
              updateStatus('connecting', null);
            }
          } else if (newStatus === 'disconnected') {
            // Only reset if we were fully connected (not connecting/waiting)
            if (statusRef.current === 'connected') {
              updateStatus('disconnected', null);
              stopPolling();
              toast.warning('WhatsApp desconectado.');
            }
          }
        }
      )
      .subscribe();

    realtimeRef.current = channel;
  };

  // ─── Initial restore on mount ─────────────────────────────────────────────
  useEffect(() => {
    const uid = propUser?.id;
    if (!uid) return;

    setUserId(uid);
    subscribeRealtime(uid);

    // Check current status (read-only)
    (async () => {
      try {
        const res = await fetch(`/api/sessions/restore/${uid}`);
        if (!res.ok) return;
        const data = await res.json();
        console.log('[WhatsAppConnect] Initial restore result:', data.status);

        if (data.status === 'connected') {
          updateStatus('connected', null);
        } else if (data.status === 'connecting') {
          updateStatus('connecting', null);
          startQrPolling(uid); // Backend is initializing — poll until connected
        }
        // 'disconnected' → keep as default
      } catch (err) {
        console.error('[WhatsAppConnect] Restore error:', err);
      }
    })();

    return () => {
      stopPolling();
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [propUser?.id]);

  // ─── Connect: generate QR ─────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!userId) return;

    if (status === 'connected') {
      // Disconnect
      try {
        setLoading(true);
        const { disconnectWhatsApp } = await import('../services/whatsappService');
        await disconnectWhatsApp();
        updateStatus('disconnected', null);
        stopPolling();
        toast.success('WhatsApp desconectado com sucesso.');
      } catch (error: any) {
        toast.error(error.message || 'Erro ao desconectar');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Already connecting — don't trigger again
    if (status === 'connecting') return;

    setLoading(true);
    updateStatus('connecting', null);

    try {
      console.log('[WhatsAppConnect] Requesting QR code...');
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const text = await response.text();
        let msg = `Erro ${response.status}`;
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await response.json();
      console.log('[WhatsAppConnect] Create response:', data.status);

      if (data.qr) {
        updateStatus('waiting', data.qr);
        toast.info('QR Code gerado! Escaneie no WhatsApp para conectar.');
        startQrPolling(userId);
      } else if (data.status === 'connected') {
        updateStatus('connected', null);
        toast.success('WhatsApp já estava conectado! ✅');
      } else {
        // No QR yet — Chrome is starting up. Poll until QR or connected.
        updateStatus('connecting', null);
        startQrPolling(userId);
        toast.info('Iniciando WhatsApp Web...');
      }
    } catch (error: any) {
      console.error('[WhatsAppConnect] Connect error:', error);
      updateStatus('disconnected', null);
      toast.error(error.message || 'Falha ao conectar');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const renderBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
            <CheckCircle2 size={12} /> Conectado
          </span>
        );
      case 'waiting':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-100">
            <RefreshCw size={12} className="animate-spin" /> Aguardando QR
          </span>
        );
      case 'connecting':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
            <Loader2 size={12} className="animate-spin" /> Conectando
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
            <XCircle size={12} /> Desconectado
          </span>
        );
    }
  };

  const renderButtonContent = () => {
    if (loading) return <Loader2 size={16} className="animate-spin" />;
    if (status === 'connected') return <><PhoneOff size={16} /> Desconectar</>;
    if (status === 'connecting') return <><Loader2 size={16} className="animate-spin" /> Aguarde...</>;
    return <><QrCode size={16} /> Gerar QR Code</>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shadow-sm">
          <WhatsAppIcon />
        </div>
        {renderBadge()}
      </div>

      {/* Content */}
      <div className="flex-1">
        <h3 className="text-lg font-bold text-gray-900 mb-2">WhatsApp Provider</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          Conecte seu número de WhatsApp para que seus agentes de IA possam responder seus clientes automaticamente.
        </p>

        {/* QR Code */}
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
              Abra o WhatsApp → Aparelhos Conectados → Conectar um aparelho → Escaneie o código
            </p>
          </motion.div>
        )}

        {/* Connecting spinner */}
        {status === 'connecting' && !qr && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Loader2 size={36} className="animate-spin text-blue-500 mb-3" />
            <p className="text-sm font-semibold text-gray-600">Iniciando WhatsApp Web...</p>
            <p className="text-xs text-gray-400 mt-1">Isso pode levar até 30 segundos</p>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="mt-6 pt-6 border-t border-gray-50">
        <button
          id="whatsapp-action-btn"
          onClick={handleConnect}
          disabled={loading || status === 'connecting'}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            status === 'connected'
              ? 'bg-white border border-gray-200 text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200'
          }`}
        >
          {renderButtonContent()}
        </button>
      </div>
    </motion.div>
  );
}
