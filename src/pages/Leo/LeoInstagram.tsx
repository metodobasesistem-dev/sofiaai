import React, { useEffect, useState } from 'react';
import { 
  Instagram, 
  MessageCircle, 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  LogOut, 
  Users, 
  Settings, 
  Activity, 
  Shield, 
  Save,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { InstagramStatus } from '../../types/leo';
import { supabase } from '../../lib/supabase';

export default function LeoInstagram({ role }: any) {
  const isAdmin = role === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [history, setHistory] = useState<{ comments: any[], dms: any[] }>({ comments: [], dms: [] });
  const [localSettings, setLocalSettings] = useState<any>(null);

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
      if (data.settings) {
        setLocalSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to fetch Instagram status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await authFetch('/api/leo/instagram/history');
      const data = await res.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch Instagram history:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchHistory();

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

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/leo/instagram/settings', {
        method: 'POST',
        body: JSON.stringify(localSettings)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configurações salvas com sucesso!');
        fetchStatus();
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
        <RefreshCw className="animate-spin text-amber-500" size={32} />
        <span className="font-bold animate-pulse">Sincronizando com Instagram...</span>
      </div>
    );
  }

  const isExpiringSoon = status?.expires_at && 
    (new Date(status.expires_at).getTime() - new Date().getTime()) < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Status Card */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className={`relative w-20 h-20 rounded-3xl flex items-center justify-center text-white shadow-lg overflow-hidden ${
            status?.connected ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-gray-200'
          }`}>
            {status?.connected && status.account?.picture_url ? (
              <img src={status.account.picture_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <Instagram size={32} />
            )}
            {status?.connected && (
              <div className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-black text-2xl text-gray-900 tracking-tight">
                {status?.connected ? status.account?.name : 'Instagram não conectado'}
              </h3>
              {status?.connected && <Shield size={16} className="text-blue-500" />}
            </div>
            <p className="text-sm text-gray-400 font-medium">
              {status?.connected ? `@${status.account?.username} • Business Account` : 'Conecte sua conta comercial para habilitar o Leo'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          {status?.connected ? (
            <>
              <button 
                onClick={fetchHistory}
                className="p-3 text-gray-500 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100"
                title="Atualizar histórico"
              >
                <RefreshCw size={20} />
              </button>
              {isExpiringSoon && (
                <button 
                  onClick={handleRefresh}
                  className="flex items-center gap-2 px-5 py-2.5 text-amber-600 bg-amber-50 text-sm font-bold rounded-2xl hover:bg-amber-100 transition-all border border-amber-100"
                >
                  <RefreshCw size={18} /> Renovar Token
                </button>
              )}
              {isAdmin && (
                <button 
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-5 py-2.5 text-red-600 hover:bg-red-50 text-sm font-bold rounded-2xl transition-all border border-transparent hover:border-red-100"
                >
                  <LogOut size={18} /> Desconectar
                </button>
              )}
            </>
          ) : (
            isAdmin && (
              <button 
                onClick={handleConnect}
                className="w-full md:w-auto px-8 py-3 bg-gray-900 text-white text-sm font-black rounded-2xl hover:bg-gray-800 transition-all shadow-xl shadow-gray-200 active:scale-95"
              >
                Conectar Instagram
              </button>
            )
          )}
        </div>
      </div>

      {status?.connected && (
        <>
          {/* Account Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              icon={<Users size={20} className="text-blue-500" />} 
              label="Seguidores" 
              value={status.account?.followers_count?.toLocaleString() || '0'} 
              color="bg-blue-50"
            />
            <MetricCard 
              icon={<Activity size={20} className="text-emerald-500" />} 
              label="Postagens" 
              value={status.account?.media_count?.toLocaleString() || '0'} 
              color="bg-emerald-50"
            />
            <MetricCard 
              icon={<MessageSquare size={20} className="text-purple-500" />} 
              label="Conversas Leo" 
              value={history.dms.length.toString()} 
              color="bg-purple-50"
            />
            <MetricCard 
              icon={<Shield size={20} className="text-amber-500" />} 
              label="Status" 
              value="Ativo" 
              color="bg-amber-50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Automation Settings */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                      <Settings size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">Configurações de Automação</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Configure como o Leo deve agir</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button 
                      disabled={saving}
                      onClick={handleSaveSettings}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50"
                    >
                      {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      Salvar Alterações
                    </button>
                  )}
                </div>
                <div className="p-6 space-y-8">
                  <AutomationToggle 
                    title="Boas-vindas para Novos Seguidores"
                    description="O Leo enviará uma DM automática assim que alguém começar a seguir sua página."
                    enabled={localSettings?.insta_auto_follow_enabled}
                    onToggle={(val) => setLocalSettings({ ...localSettings, insta_auto_follow_enabled: val })}
                    message={localSettings?.insta_auto_follow_msg}
                    onMessageChange={(val) => setLocalSettings({ ...localSettings, insta_auto_follow_msg: val })}
                  />
                  <div className="h-px bg-gray-50"></div>
                  <AutomationToggle 
                    title="Resposta Automática em Comentários"
                    description="O Leo enviará uma DM para quem comentar em qualquer postagem sua."
                    enabled={localSettings?.insta_auto_comment_enabled}
                    onToggle={(val) => setLocalSettings({ ...localSettings, insta_auto_comment_enabled: val })}
                    message={localSettings?.insta_auto_comment_msg}
                    onMessageChange={(val) => setLocalSettings({ ...localSettings, insta_auto_comment_msg: val })}
                  />
                </div>
              </div>
            </div>

            {/* Side Activity */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={18} className="text-amber-500" />
                    <h4 className="font-bold text-sm text-gray-900">Últimos Comentários</h4>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">
                    LIVE
                  </span>
                </div>
                <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {history.comments.length > 0 ? (
                    history.comments.map((comment, idx) => (
                      <CommentItem 
                        key={comment.id || idx}
                        user={comment.lead?.nome || 'Usuário'} 
                        text={comment.conteudo} 
                        time={new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                      />
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-xs font-medium">Nenhum comentário detectado ainda.</div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center gap-2">
                  <Clock size={18} className="text-amber-500" />
                  <h4 className="font-bold text-sm text-gray-900">Ações do Leo (DMs)</h4>
                </div>
                <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {history.dms.length > 0 ? (
                    history.dms.map((dm, idx) => (
                      <DMItem 
                        key={dm.id || idx}
                        user={dm.lead?.nome || 'Usuário'} 
                        status={dm.tipo === 'dm_enviada' ? 'Enviada' : 'Recebida'} 
                        time={new Date(dm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                      />
                    ))
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-xs font-medium">Nenhuma mensagem enviada ainda.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:border-amber-200 transition-all cursor-default group">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-xl font-black text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function AutomationToggle({ title, description, enabled, onToggle, message, onMessageChange }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="max-w-[70%]">
          <h5 className="font-bold text-gray-900 text-sm mb-1">{title}</h5>
          <p className="text-xs text-gray-400 leading-relaxed font-medium">{description}</p>
        </div>
        <button 
          onClick={() => onToggle(!enabled)}
          className={`relative w-12 h-6 rounded-full transition-all duration-300 ${enabled ? 'bg-emerald-500 shadow-inner' : 'bg-gray-200'}`}
        >
          <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${enabled ? 'translate-x-6' : ''}`}></div>
        </button>
      </div>
      {enabled && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <textarea 
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all min-h-[100px]"
            placeholder="Digite a mensagem que o Leo deve enviar..."
          />
          <p className="text-[10px] text-gray-400 mt-2 font-bold italic">* Esta mensagem será enviada em nome do seu perfil comercial.</p>
        </div>
      )}
    </div>
  );
}

function CommentItem({ user, text, time }: any) {
  return (
    <div className="p-5 hover:bg-gray-50 transition-all group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black text-gray-900 group-hover:text-amber-600 transition-colors">@{user}</span>
        <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-md">{time}</span>
      </div>
      <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed font-medium">{text}</p>
    </div>
  );
}

function DMItem({ user, status, time }: any) {
  const isEnviada = status === 'Enviada' || status === 'Entregue';
  return (
    <div className="p-5 hover:bg-gray-50 transition-all flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isEnviada ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
          {isEnviada ? <CheckCircle2 size={16} /> : <MessageCircle size={16} />}
        </div>
        <div>
          <p className="text-xs font-black text-gray-900 group-hover:text-amber-600 transition-colors">Para @{user}</p>
          <p className="text-[10px] text-gray-400 font-bold">{time}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-black uppercase tracking-tighter ${isEnviada ? 'text-emerald-500' : 'text-blue-500'}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
