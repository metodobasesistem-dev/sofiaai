import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  Settings, 
  Database, 
  Activity, 
  Zap, 
  CheckCircle2, 
  XCircle,
  BarChart3,
  Search,
  RefreshCw,
  MoreVertical,
  ExternalLink,
  MessageSquare,
  Key,
  CreditCard,
  Layers,
  FileText,
  ChevronRight,
  TrendingUp,
  Bot,
  Globe
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { type UserProfile, getAdminStats, listAdminUsers, updateAdminUser, resetAdminUserWhatsApp, getAdminUserActivity } from '../services/supabaseService';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

type AdminTab = 'overview' | 'users' | 'config' | 'billing';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSessions: 0,
    totalMessages: 0,
    totalAgents: 0
  });

  // Modal & Action states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const [statsData, usersData] = await Promise.all([
        getAdminStats(),
        listAdminUsers()
      ]);

      setStats(statsData);
      setProfiles(usersData);
    } catch (error: any) {
      console.error('Admin Fetch Error:', error);
      toast.error('Erro ao carregar dados administrativos. Verifique permissões de admin.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProfiles = profiles.filter(p => 
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleResetWhatsApp = async (userId: string) => {
    if (!window.confirm('Tem certeza que deseja resetar a sessão do WhatsApp deste cliente? Ele precisará ler o QR Code novamente.')) return;
    
    try {
      setIsActionLoading(true);
      await resetAdminUserWhatsApp(userId);
      toast.success('Sessão resetada com sucesso!');
      fetchData(); // Refresh list
    } catch (error: any) {
      toast.error('Erro ao resetar sessão: ' + error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOpenEdit = (user: UserProfile) => {
    setSelectedUser({ ...user });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    try {
      setIsActionLoading(true);
      await updateAdminUser(selectedUser.id, {
        plano: selectedUser.plano,
        role: selectedUser.role,
        trial_ends_at: selectedUser.trial_ends_at
      });
      toast.success('Usuário atualizado com sucesso!');
      setIsEditModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleViewActivity = async (userId: string) => {
    try {
      setIsActionLoading(true);
      const activity = await getAdminUserActivity(userId);
      setUserActivity(activity);
      setIsActivityModalOpen(true);
    } catch (error: any) {
      toast.error('Erro ao buscar atividade: ' + error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Inquilinos Ativos', value: stats.totalUsers, icon: <Globe size={20} />, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Sessões Wpp', value: stats.activeSessions, icon: <Zap size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Total Mensagens', value: stats.totalMessages, icon: <MessageSquare size={20} />, color: 'text-violet-600', bg: 'bg-violet-50' },
                { label: 'Agentes Ativos', value: stats.totalAgents, icon: <Bot size={20} />, color: 'text-amber-600', bg: 'bg-amber-50' }
              ].map((stat, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={i} 
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
                >
                  <div className={`w-10 h-10 ${stat.bg} ${stat.color} rounded-xl flex items-center justify-center mb-4`}>
                    {stat.icon}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-900">{stat.value.toLocaleString()}</p>
                </motion.div>
              ))}
            </div>

            {/* Growth Chart Placeholder */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Saúde do Ecossistema</h3>
                  <p className="text-xs text-slate-500 font-medium">Desempenho consolidado de todos os inquilinos.</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600">
                  <TrendingUp size={14} className="text-emerald-500" /> +12% esse mês
                </div>
              </div>
              <div className="h-64 bg-slate-50 rounded-3xl flex items-center justify-center border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm font-medium">Métricas de Retenção e Churn (Em breve)</p>
              </div>
            </div>
          </div>
        );

      case 'users':
        return (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">Gerenciar Usuários</h2>
                <p className="text-xs text-slate-500 font-medium italic">Lista de inquilinos cadastrados na plataforma.</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Nome ou email..." 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all shadow-inner"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                    <th className="px-6 py-4 text-left">Inquilino</th>
                    <th className="px-6 py-4">Status Wpp</th>
                    <th className="px-6 py-4">Plano</th>
                    <th className="px-6 py-4">Criado em</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredProfiles.map((user) => (
                    <tr key={user.id} className="hover:bg-indigo-50/20 transition-colors group text-center">
                      <td className="px-6 py-4 text-left">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                            {user.photo_url ? <img src={user.photo_url} alt="" className="w-full h-full object-cover rounded-xl" /> : user.email[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{user.name || 'Sem nome'}</p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          user.whatsapp_status === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                          {user.whatsapp_status === 'connected' ? <Zap size={10} fill="currentColor" /> : <XCircle size={10} />}
                          {user.whatsapp_status === 'connected' ? 'Ativo' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">
                        {user.plano || 'Starter'}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleViewActivity(user.id)}
                            className="p-2 text-slate-400 hover:text-blue-600 rounded-xl bg-white border border-slate-200 shadow-sm"
                            title="Ver Logs de Atividade"
                          >
                            <FileText size={18} />
                          </button>
                          <button 
                            onClick={() => handleResetWhatsApp(user.id)}
                            className="p-2 text-slate-400 hover:text-red-600 rounded-xl bg-white border border-slate-200 shadow-sm"
                            title="Resetar Conexão WhatsApp"
                          >
                            <RefreshCw size={18} />
                          </button>
                          <button 
                            onClick={() => handleOpenEdit(user)}
                            className="p-2 text-slate-400 hover:text-indigo-600 rounded-xl bg-white border border-slate-200 shadow-sm"
                            title="Editar Inquilino"
                          >
                            <Settings size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'config':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in zoom-in-95 duration-500">
            <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-10"><Key size={80} /></div>
              <h3 className="text-2xl font-black mb-6">Chaves API Mestras</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">OpenAI API Key (Global)</label>
                  <input type="password" value="••••••••••••••••" className="w-full bg-slate-800 border border-white/10 rounded-2xl p-4 text-sm text-slate-300" readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Model Selection</label>
                  <select className="w-full bg-slate-800 border border-white/10 rounded-2xl p-4 text-sm text-slate-300">
                    <option>GPT-4o (Padrão)</option>
                    <option>GPT-4 turbo</option>
                    <option>Gemini 1.5 Pro</option>
                  </select>
                </div>
                <button className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95">Salvar Configurações Globais</button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm">
              <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                <Shield size={24} className="text-emerald-500" /> Segurança
              </h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Manutenção do Sistema</h4>
                    <p className="text-xs text-slate-500">Bloqueia acesso de todos os inquilinos.</p>
                  </div>
                  <div className="w-12 h-6 bg-slate-200 rounded-full relative"><div className="absolute w-5 h-5 bg-white rounded-full top-0.5 left-0.5 shadow-sm"></div></div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Novas Inscrições</h4>
                    <p className="text-xs text-slate-500">Permitir novos usuários via Login.</p>
                  </div>
                  <div className="w-12 h-6 bg-emerald-500 rounded-full relative"><div className="absolute w-5 h-5 bg-white rounded-full top-0.5 right-0.5 shadow-sm"></div></div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-center py-20 text-slate-400">Em desenvolvimento...</div>;
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-200">
              <Shield size={28} />
            </div>
            Painel Admin
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Controle central do ecossistema SaaS WppAI.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
          {[
            { id: 'overview', icon: <Activity size={18} />, label: 'Geral' },
            { id: 'users', icon: <Users size={18} />, label: 'Inquilinos' },
            { id: 'config', icon: <Settings size={18} />, label: 'Config' },
            { id: 'billing', icon: <CreditCard size={18} />, label: 'Financeiro' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {renderContent()}

      {/* MODAL: EDIT USER */}
      <AnimatePresence>
        {isEditModalOpen && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative z-10 overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Editar Inquilino</h3>
                  <p className="text-xs text-slate-500 font-medium">Alterando configurações de {selectedUser.email}</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><XCircle size={24} /></button>
              </div>

              <div className="p-8 space-y-6">
                {/* Plano Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Plano da Assinatura</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Trial', 'Starter', 'Pro'].map(p => (
                      <button 
                        key={p}
                        onClick={() => setSelectedUser({ ...selectedUser, plano: p })}
                        className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                          selectedUser.plano === p 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' 
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cargo */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cargo / Permissões</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['client', 'admin'].map(r => (
                      <button 
                        key={r}
                        onClick={() => setSelectedUser({ ...selectedUser, role: r as any })}
                        className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                          selectedUser.role === r 
                            ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                        }`}
                      >
                        {r === 'admin' ? 'Administrador' : 'Cliente'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trial Expiry */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Expiração do Trial</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                    value={selectedUser.trial_ends_at ? new Date(selectedUser.trial_ends_at).toISOString().split('T')[0] : ''}
                    onChange={(e) => setSelectedUser({ ...selectedUser, trial_ends_at: new Date(e.target.value).toISOString() })}
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveEdit}
                  disabled={isActionLoading}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isActionLoading ? <RefreshCw size={18} className="animate-spin mx-auto" /> : 'Salvar Alterações'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ACTIVITY LOGS */}
      <AnimatePresence>
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsActivityModalOpen(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white h-full w-full max-w-xl shadow-2xl relative z-10 flex flex-col"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Logs de Atividade</h3>
                  <p className="text-xs text-slate-500 font-medium">Últimas 50 interações deste inquilino.</p>
                </div>
                <button onClick={() => setIsActivityModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><XCircle size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-slate-50/50 custom-scrollbar">
                {userActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 font-medium italic">
                    Nenhuma atividade recente registrada.
                  </div>
                ) : (
                  userActivity.map((log, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.role === 'assistant' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                        {log.role === 'assistant' ? <Bot size={16} /> : <Users size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${log.role === 'assistant' ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {log.role === 'assistant' ? 'IA Sofia' : 'Contato'}
                          </span>
                          <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed break-words">{log.content}</p>
                        {log.contact_name && (
                          <p className="text-[10px] text-slate-400 mt-2 font-medium">Contexto: Conversa com <b>{log.contact_name}</b></p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
