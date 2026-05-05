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
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [method, setMethod] = useState<'qr' | 'pairing'>('qr');
  const [loading, setLoading] = useState(false);
  const [webhookOk, setWebhookOk] = useState(true);
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
    if (s === 'connected' || s === 'disconnected') {
      setPairingCode(null);
    }
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
          setPairingCode(null);
          setWebhookOk(data.webhookOk !== false);
          stopPolling();
          toast.success('WhatsApp Conectado com Sucesso! 🎉');
        }
      } catch { /* noop */ }
    }, 4000);
  };

  // ─── Supabase Realtime subscription ───────────────────────────────────────
  const subscribeRealtime = (uid: string) => {
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
          const newQr = payload.new?.whatsapp_qr as string;
          console.log('[WhatsAppConnect] Realtime update:', newStatus, newQr ? '(QR Present)' : '(No QR)');

          if (newStatus === 'connected') {
            updateStatus('connected', null);
            setPairingCode(null);
            stopPolling();
            if (statusRef.current !== 'connected') {
              toast.success('WhatsApp Conectado! 🎉');
            }
          } else if (newStatus === 'connecting') {
             // Se recebemos um QR no Realtime, mudamos para 'waiting' para mostrá-lo
             if (newQr) {
               updateStatus('waiting', newQr);
               startQrPolling(uid);
             } else if (statusRef.current === 'disconnected' || statusRef.current === 'waiting') {
               // Se não tem QR e o status mudou, mostramos o carregamento (exceto se já estivermos conectado)
               if (statusRef.current !== 'connected') {
                updateStatus('connecting', null);
               }
             }
          } else if (newStatus === 'disconnected') {
            if (statusRef.current === 'connected') {
              updateStatus('disconnected', null);
              setPairingCode(null);
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

    const fetchCurrentStatus = async () => {
      try {
        const res = await fetch(`/api/sessions/restore/${uid}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'connected') {
          updateStatus('connected', null);
          setPairingCode(null);
          setWebhookOk(data.webhookOk !== false);
          stopPolling();
        } else if (data.status === 'connecting') {
          updateStatus('connecting', null);
          startQrPolling(uid);
        } else if (data.status === 'disconnected') {
           if (statusRef.current === 'connected') {
             updateStatus('disconnected', null);
             setPairingCode(null);
           }
        }
      } catch (err) {
        console.error('[WhatsAppConnect] Status sync error:', err);
      }
    };

    fetchCurrentStatus();
    const safetyPoll = setInterval(fetchCurrentStatus, 8000);

    return () => {
      stopPolling();
      clearInterval(safetyPoll);
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [propUser?.id]);

  // ─── Create Pairing Code ──────────────────────────────────────────────────
  const handlePairingCode = async () => {
    if (!userId || !phoneNumber) {
      toast.error('Por favor, informe o número de telefone.');
      return;
    }

    setLoading(true);
    setQr(null);

    try {
      const res = await fetch('/api/sessions/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phoneNumber }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao gerar código');
      }

      const data = await res.json();
      setPairingCode(data.code);
      updateStatus('waiting');
      startQrPolling(userId);
      toast.success('Código de pareamento gerado! Digite no seu celular.');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Connect: generate QR ─────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!userId) return;

    if (status === 'connected') {
      try {
        setLoading(true);
        const res = await fetch('/api/sessions/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) throw new Error('Falha ao desconectar');

        updateStatus('disconnected', null);
        setPairingCode(null);
        stopPolling();
        toast.success('WhatsApp desconectado (Instância mantida).');
      } catch (error: any) {
        toast.error(error.message || 'Erro ao desconectar');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (status === 'connecting') return;

    setLoading(true);
    updateStatus('connecting', null);
    setPairingCode(null);

    try {
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
      if (data.qr) {
        updateStatus('waiting', data.qr);
        startQrPolling(userId);
      } else if (data.status === 'connected') {
        updateStatus('connected', null);
        setPairingCode(null);
      } else {
        updateStatus('connecting', null);
        startQrPolling(userId);
      }
    } catch (error: any) {
      updateStatus('disconnected', null);
      toast.error(error.message || 'Falha ao conectar');
    } finally {
      setLoading(false);
    }
  };

  // ─── Permanent Removal ───────────────────────────────────────────────────
  const handleRemoveInstance = async () => {
    if (!userId) return;
    if (!window.confirm('ATENÇÃO: Isso irá deletar permanentemente a instância na Evolution API. Você precisará reconfigurar tudo se quiser voltar. Deseja continuar?')) return;

    setLoading(true);
    const toastId = toast.loading('Removendo instância definitivamente...');

    try {
      const res = await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) throw new Error('Falha ao remover instância');

      updateStatus('disconnected', null);
      setPairingCode(null);
      stopPolling();
      toast.success('Conexão e Instância removidas com sucesso! 🧹', { id: toastId });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  // ─── Sync Instance (Auto-Cura) ───────────────────────────────────────────
  const handleSync = async () => {
    if (!userId) return;
    
    setLoading(true);
    const toastId = toast.loading('Sincronizando com a Evolution API...');
    
    try {
      const response = await fetch('/api/whatsapp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Falha na sincronização');
      }

      toast.success('Conexão sincronizada com sucesso! 🚀', { id: toastId });
    } catch (error: any) {
      toast.error(error.message || 'Erro ao sincronizar', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

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
            <RefreshCw size={12} className="animate-spin" /> Aguardando Conexão
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col h-full"
    >
      {/* Banner Superior com Efeito Glass */}
      <div className="h-24 bg-gradient-to-r from-green-500 to-emerald-600 relative overflow-hidden">
         <div className="absolute inset-0 bg-white/5 backdrop-blur-sm"></div>
         <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
         <div className="absolute left-6 bottom-4 flex items-center gap-3">
           <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white flex items-center justify-center shadow-lg">
             <WhatsAppIcon />
           </div>
           <div>
             <h3 className="text-lg font-bold text-white leading-none">WhatsApp Provider</h3>
             <p className="text-white/70 text-xs mt-1">Conexão via Sofia</p>
           </div>
         </div>
         <div className="absolute right-6 bottom-4">
           {renderBadge()}
         </div>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          Escolha o método de conexão para vincular seu dispositivo. Recomendamos o QR Code para praticidade ou Código de Pareamento se houver problemas de imagem.
        </p>

        {/* Seletor de Método */}
        {status === 'disconnected' && (
          <div className="flex p-1 bg-gray-100 rounded-lg mb-6 self-center">
            <button 
              onClick={() => setMethod('qr')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-xs font-semibold ${method === 'qr' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <QrCode size={14} /> QR Code
            </button>
            <button 
              onClick={() => setMethod('pairing')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-xs font-semibold ${method === 'pairing' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
               Código Numérico
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center items-center">
          {/* Aba QR Code */}
          {method === 'qr' && (
            <>
              {qr && status === 'waiting' ? (
                <div className="flex flex-col items-center">
                   <div className="bg-white p-4 rounded-2xl shadow-2xl border border-gray-100 mb-4 animate-in fade-in zoom-in duration-300">
                    <img 
                      src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} 
                      alt="QR Code" 
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                  <p className="text-xs text-gray-400 text-center max-w-[200px]">
                    Abra o WhatsApp e escaneie o código para conectar instantaneamente.
                  </p>
                </div>
              ) : status === 'disconnected' ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                    <QrCode size={32} />
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Pronto para conectar</p>
                  <p className="text-xs text-gray-400">Clique para gerar o código</p>
                </div>
              ) : null}
            </>
          )}

          {/* Aba Código de Pareamento */}
          {method === 'pairing' && (
            <div className="w-full flex flex-col items-center">
              {pairingCode ? (
                <div className="text-center animate-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-gray-900 text-white font-mono text-3xl font-bold tracking-widest px-6 py-4 rounded-xl shadow-xl mb-4 border-2 border-green-500/30">
                    {pairingCode}
                  </div>
                  <p className="text-xs text-gray-500 max-w-[240px]">
                    No WhatsApp, vá em <b>Aparelhos Conectados</b> &gt; <b>Conectar com número</b> e digite o código acima.
                  </p>
                </div>
              ) : status === 'disconnected' ? (
                <div className="w-full max-w-[280px]">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-2 block">Seu Número WhatsApp</label>
                  <div className="relative group">
                    <input 
                      type="text" 
                      placeholder="Ex: 5511999999999"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all group-hover:border-gray-300"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">DICA: Use o formato DDI + DDD + NÚMERO (sem espaços).</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Status de Carregamento Genérico */}
          {status === 'connecting' && !qr && !pairingCode && (
            <div className="flex flex-col items-center justify-center py-8 text-center animate-pulse">
              <Loader2 size={36} className="animate-spin text-blue-500 mb-3" />
              <p className="text-sm font-semibold text-gray-600">Iniciando Servidor...</p>
              <p className="text-xs text-gray-400 mt-1">Isso pode levar alguns segundos</p>
            </div>
          )}

          {status === 'connected' && (
            <div className="text-center py-6 animate-in fade-in duration-700">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100 shadow-inner">
                 <CheckCircle2 size={40} />
              </div>
              <h4 className="text-lg font-bold text-gray-900">Tudo Pronto!</h4>
              <p className="text-sm text-gray-500">Sua conta está vinculada e ativa.</p>
            </div>
          )}
        </div>

        {status === 'connected' && !webhookOk && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
            <div>
              <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-tight">Problema de Recebimento</p>
              <p className="text-[10px] text-amber-700 font-medium leading-tight mt-0.5">
                Sua conexão está ativa, mas o canal de mensagens precisa ser recalibrado.
              </p>
            </div>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="mt-8">
          {status === 'connected' ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSync}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-bold bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 transition-all hover:shadow-lg hover:shadow-blue-50 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <><RefreshCw size={18} /> Sincronizar Conexão</>}
              </button>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-bold bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={12} /> : <><PhoneOff size={12} /> Desconectar</>}
                  </button>

                  <button
                    onClick={handleRemoveInstance}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-bold text-red-400 hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={12} /> : <><XCircle size={12} /> Remover Tudo</>}
                  </button>
                </div>
              </div>
          ) : (
            <button
              onClick={method === 'qr' ? handleConnect : handlePairingCode}
              disabled={loading || status === 'connecting' || (method === 'pairing' && !phoneNumber)}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : method === 'qr' ? (
                <>
                  {status === 'waiting' ? <RefreshCw size={18} /> : <QrCode size={18} />}
                  {status === 'waiting' ? 'Atualizar QR Code' : 'Gerar QR Code'}
                </>
              ) : (
                <>Gerar Código de Pareamento</>
              )}
            </button>
          )}

          {status === 'waiting' && (
            <button 
              onClick={() => {
                updateStatus('disconnected', null);
                setPairingCode(null);
                stopPolling();
              }}
              className="w-full mt-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors py-2"
            >
              CANCELAR E VOLTAR
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
