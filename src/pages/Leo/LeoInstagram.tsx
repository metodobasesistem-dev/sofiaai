import React, { useEffect, useState } from 'react';
import { Instagram, MessageCircle, Clock, CheckCircle2, RefreshCw, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { InstagramStatus } from '../../types/leo';
import { supabase } from '../../lib/supabase';

export default function LeoInstagram({ role }: any) {
  const isAdmin = role === 'admin';
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<InstagramStatus | null>(null);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };

  const fetchStatus = async () => {
    try {
      const res = await authFetch('/api/leo/instagram/status');
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch Instagram status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Verificar retorno do OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      toast.success('Instagram conectado com sucesso!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error') === 'true') {
      toast.error('Erro ao conectar com Instagram.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    try {
      const res = await authFetch('/api/leo/instagram/auth-url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (error) {
      toast.error('Erro ao iniciar conexão.');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o Instagram?')) return;
    try {
      const res = await authFetch('/api/leo/instagram/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Desconectado com sucesso.');
        fetchStatus();
      }
    } catch (error) {
      toast.error('Erro ao desconectar.');
    }
  };

  const handleRefresh = async () => {
    try {
      const res = await authFetch('/api/leo/instagram/refresh-token', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Token renovado com sucesso.');
        fetchStatus();
      }
    } catch (error) {
      toast.error('Erro ao renovar token.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse font-bold">
        Verificando conexão...
      </div>
    );
  }

  const isExpiringSoon = status?.expires_at && 
    (new Date(status.expires_at).getTime() - new Date().getTime()) < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${
            status?.connected ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-gray-200'
          }`}>
            <Instagram size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">
              {status?.connected ? status.account?.name : 'Instagram não conectado'}
            </h3>
            <p className="text-xs text-gray-400">
              {status?.connected ? `@${status.account?.username} • Conectado` : 'Conecte sua conta business para monitorar'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {status?.connected ? (
            <>
              {isExpiringSoon && (
                <button 
                  onClick={handleRefresh}
                  className="flex items-center gap-2 px-4 py-2 text-amber-600 bg-amber-50 text-sm font-bold rounded-xl hover:bg-amber-100 transition-all"
                >
                  <RefreshCw size={16} /> Renovar Token
                </button>
              )}
              {isAdmin && (
                <button 
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 text-sm font-bold rounded-xl transition-all"
                >
                  <LogOut size={16} /> Desconectar
                </button>
              )}
            </>
          ) : (
            isAdmin && (
              <button 
                onClick={handleConnect}
                className="px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all"
              >
                Conectar Instagram
              </button>
            )
          )}
        </div>
      </div>

      {status?.connected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} className="text-amber-500" />
                <h4 className="font-bold text-sm text-gray-900">Últimos Comentários Monitorados</h4>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> MONITORANDO
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              <CommentItem user="marcos_dev" text="Quero saber mais sobre o sistema!" time="5 min atrás" />
              <CommentItem user="julia_mkt" text="Como faço para contratar?" time="12 min atrás" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center gap-2">
              <Clock size={18} className="text-amber-500" />
              <h4 className="font-bold text-sm text-gray-900">DMs Enviadas pelo Leo</h4>
            </div>
            <div className="divide-y divide-gray-50">
              <DMItem user="marcos_dev" status="Entregue" time="4 min atrás" />
              <DMItem user="julia_mkt" status="Respondido" time="10 min atrás" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({ user, text, time }: any) {
  return (
    <div className="p-4 hover:bg-gray-50 transition-all">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-900">@{user}</span>
        <span className="text-[10px] text-gray-400 font-medium">{time}</span>
      </div>
      <p className="text-xs text-gray-600 line-clamp-1">{text}</p>
    </div>
  );
}

function DMItem({ user, status, time }: any) {
  return (
    <div className="p-4 hover:bg-gray-50 transition-all flex items-center justify-between">
      <div>
        <p className="text-xs font-bold text-gray-900">Para @{user}</p>
        <p className="text-[10px] text-gray-400 font-medium">{time}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <CheckCircle2 size={12} className={status === 'Respondido' ? 'text-blue-500' : 'text-emerald-500'} />
        <span className={`text-[10px] font-bold uppercase ${status === 'Respondido' ? 'text-blue-500' : 'text-emerald-500'}`}>{status}</span>
      </div>
    </div>
  );
}
