import React, { useState, useEffect } from 'react';
import { 
  MessageCircle, 
  Users, 
  Calendar, 
  Settings, 
  LayoutGrid, 
  BarChart3, 
  Plug, 
  Clock, 
  Bot, 
  User, 
  Check, 
  Zap, 
  Sparkles, 
  ChevronDown, 
  CalendarX, 
  ArrowRight,
  ArrowUpRight,
  Radio,
  MessageSquare,
  CheckCircle2,
  X,
  QrCode,
  Loader2,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getWhatsAppStatus, connectWhatsApp, listenToWhatsAppSession, WhatsAppStatusResponse } from '../services/whatsappService';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { 
  getDashboardStats, 
  getGlobalDashboardStats,
  getRecentActivities, 
  getGlobalRecentActivities,
  getUpcomingAppointments, 
  getUserProfile, 
  type UserProfile 
} from '../services/supabaseService';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const QuickNavCard = ({ icon: Icon, title, subtitle, onClick }: { icon: any, title: string, subtitle: string, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
        <Icon size={20} />
      </div>
      <div>
        <h4 className="text-sm font-bold text-gray-900">{title}</h4>
        <p className="text-[11px] text-gray-400">{subtitle}</p>
      </div>
    </div>
  </div>
);

const MetricCard = ({ icon: Icon, title, value }: { icon: any, title: string, value: string }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
    <div className="flex items-center gap-2 text-gray-400 mb-4">
      <Icon size={16} />
      <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
    </div>
    <h3 className="text-3xl font-black text-gray-900">{value}</h3>
  </div>
);

export default function Dashboard({ onTabChange, role, user }: { onTabChange?: (tab: string, subTab?: string) => void, role?: string, user: SupabaseUser | null }) {
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [stats, setStats] = useState({ 
    contacts: 0, 
    appointments: 0, 
    messages: 0, 
    qualified: 0, 
    conversionRate: 0, 
    avgScore: 0 
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 10, hours: 0, mins: 0, secs: 0 });

  // Trial Timer Logic
  useEffect(() => {
    if (!user?.created_at) return;

    const calculateTime = () => {
      const signupDate = new Date(user.created_at);
      const trialEndDate = new Date(signupDate.getTime() + 10 * 24 * 60 * 60 * 1000);
      const now = new Date();
      const diff = trialEndDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0 });
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        secs: Math.floor((diff % (1000 * 60)) / 1000)
      });
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [user?.created_at]);

  // Real-time listener for WhatsApp status
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupListener = async () => {
      const userId = user?.id;
      if (!userId) return;

      unsubscribe = listenToWhatsAppSession(user.id, (data) => {
        setWhatsappStatus(data);
        
        if (data.status === 'connected') {
          if (isWhatsAppModalOpen) {
            toast.success('WhatsApp conectado com sucesso!');
            setIsWhatsAppModalOpen(false);
          }
        }
      });
    };

    setupListener();

    const fetchStats = async () => {
      try {
        setLoading(true);
        const userId = user?.id;
        if (!userId) return;

        // Fetch each part independently so they render as they finish
        const isAdmin = role === 'admin';

        // 1. Profile (Greetings)
        getUserProfile(userId).then(p => {
          setProfile(p || null);
        });

        // 2. Real-time WhatsApp Status (Brokered API)
        // AÇÃO: Perguntar ao backend o estado real, ignorando dados possivelmente sujos do banco
        const fetchWhatsAppStatus = async () => {
          try {
            const statusData = await getWhatsAppStatus();
            console.log(`[Dashboard] 📱 WhatsApp status sync: ${statusData.status}`, statusData);
            setWhatsappStatus(statusData as any);
          } catch (err) {
            console.warn('[Dashboard] Could not fetch WhatsApp status:', err);
          }
        };

        // Initial fetch
        fetchWhatsAppStatus();

        // SEGURANÇA: Polling a cada 5 segundos para garantir que o front acompanhe o backend
        const statusPollInterval = setInterval(fetchWhatsAppStatus, 5000);

        // 2. Stats + Activities + Appointments em paralelo (aguarda todos juntos)
        const statsPromise = isAdmin ? getGlobalDashboardStats() : getDashboardStats(userId);
        const activitiesPromise = isAdmin ? getGlobalRecentActivities() : getRecentActivities(userId);

        const [statsResult, activitiesResult, appointmentsResult] = await Promise.allSettled([
          statsPromise,
          activitiesPromise,
          getUpcomingAppointments()
        ]);

        if (statsResult.status === 'fulfilled' && statsResult.value) {
          const s = statsResult.value;
          setStats(s);
          const data: any[] = Array.from({ length: 7 }).map((_, i) => {
            const date = subDays(new Date(), 6 - i);
            return {
              name: format(date, 'dd MMM', { locale: ptBR }),
              leads: Math.floor(Math.random() * ((s.contacts || 0) / 3 + 1)),
              agendamentos: Math.floor(Math.random() * ((s.appointments || 0) / 3 + 1))
            };
          });
          setChartData(data);
        }

        if (activitiesResult.status === 'fulfilled') {
          setActivities(activitiesResult.value || []);
        }

        if (appointmentsResult.status === 'fulfilled') {
          setUpcomingAppointments(appointmentsResult.value || []);
        }

      } catch (error) {
        console.error('Failed to initiate dashboard fetches:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    return () => {
      if (unsubscribe) unsubscribe();
      // @ts-ignore
      if (typeof statusPollInterval !== 'undefined') clearInterval(statusPollInterval);
    };
  }, [user?.id, role]);

  const handleConnect = async () => {
    if (whatsappStatus?.status === 'connected') {
      toast.info('WhatsApp já está conectado.');
      return;
    }
    try {
      setIsConnecting(true);
      setIsWhatsAppModalOpen(true);
      const result = await connectWhatsApp();
      if (result.success && result.qr) {
        setWhatsappStatus(prev => ({
          status: (result.status as any) || 'waiting',
          qr: result.qr
        }));
      }
    } catch (error: any) {
      console.error('Failed to connect WhatsApp:', error);
      const errorMsg = error.message || 'Erro ao iniciar conexão com WhatsApp';
      toast.error(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshQr = async () => {
    try {
      setIsConnecting(true);
      const result = await connectWhatsApp();
      if (result.success && result.qr) {
        setWhatsappStatus(prev => ({
          status: (result.status as any) || 'waiting',
          qr: result.qr
        }));
      }
    } catch (error: any) {
      console.error('Failed to refresh QR:', error);
      const errorMsg = error.message || 'Erro ao atualizar QR Code';
      toast.error(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsConnecting(true);
      const { disconnectWhatsApp } = await import('../services/whatsappService');
      await disconnectWhatsApp();
      setWhatsappStatus({ status: 'disconnected' });
      toast.success('WhatsApp desconectado com sucesso!');
    } catch (error: any) {
      console.error('Failed to disconnect WhatsApp:', error);
      toast.error(error.message || 'Erro ao desconectar WhatsApp');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsConnecting(true);
      const { disconnectWhatsApp } = await import('../services/whatsappService');
      await disconnectWhatsApp();
      setWhatsappStatus({ status: 'disconnected' });
      toast.success('Conexão resetada com sucesso.');
      setIsWhatsAppModalOpen(false);
    } catch (error: any) {
      console.error('Failed to reset WhatsApp:', error);
      toast.error('Erro ao resetar conexão.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Dashboard Header: Greetings & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {role === 'admin' ? 'Painel Geral SaaS' : `Olá, ${(profile?.nome_completo || profile?.name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0]) || 'Usuário'}!`}
          </h1>
          <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
            {role === 'admin' ? 'Visão global de todos os clientes e métricas da plataforma.' : 'Aqui está o que aconteceu no seu CRM hoje.'}
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onTabChange?.('inbox')}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <MessageSquare size={18} /> Ver Inbox
          </button>
          <button 
            onClick={() => onTabChange?.('schedule')}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <Calendar size={18} /> Nova Task
          </button>
        </div>
      </div>

      {/* 2. Banner de Conexão (Topo) - Só aparece se não estiver conectado */}
      <AnimatePresence>
        {(whatsappStatus?.status !== 'connected') && (
          <motion.div 
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 ${whatsappStatus?.status === 'connecting' ? 'bg-blue-500' : 'bg-green-500'} rounded-full flex items-center justify-center text-white shadow-lg ${whatsappStatus?.status === 'connecting' ? 'shadow-blue-200' : 'shadow-green-200'} transition-colors`}>
                  {whatsappStatus?.status === 'connecting' ? <Loader2 size={32} className="animate-spin" /> : <MessageCircle size={32} fill="currentColor" />}
                </div>
                <div className="space-y-1">
                  <h2 className={`text-xl font-black ${whatsappStatus?.status === 'connecting' ? 'text-blue-900' : 'text-green-900'}`}>
                    {whatsappStatus?.status === 'connecting' ? 'Restaurando conexão...' : 'Ative sua assistente no WhatsApp'}
                  </h2>
                  <p className={`text-sm ${whatsappStatus?.status === 'connecting' ? 'text-blue-700' : 'text-green-700'} opacity-80`}>
                    {whatsappStatus?.status === 'connecting' 
                      ? 'Estamos acordando sua IA para retomar o atendimento. Isso leva alguns segundos.' 
                      : 'Conecte seu WhatsApp e deixe a IA cuidar do atendimento e dos agendamentos.'}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span className={`px-2 py-0.5 ${whatsappStatus?.status === 'connecting' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'} text-[10px] font-bold uppercase rounded border ${whatsappStatus?.status === 'connecting' ? 'border-blue-200' : 'border-green-200'} flex items-center gap-1`}>
                      <Zap size={10} /> {whatsappStatus?.status === 'connecting' ? 'Recuperação automática' : 'Ativação instantânea'}
                    </span>
                    <span className={`px-2 py-0.5 ${whatsappStatus?.status === 'connecting' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'} text-[10px] font-bold uppercase rounded border ${whatsappStatus?.status === 'connecting' ? 'border-blue-200' : 'border-green-200'} flex items-center gap-1`}>
                      <Clock size={10} /> Atendimento 24h
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={handleConnect}
                  disabled={isConnecting || whatsappStatus?.status === 'connecting'}
                  className={`whitespace-nowrap px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md disabled:opacity-50 
                    ${whatsappStatus?.status === 'connecting' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700 text-white shadow-green-200'}`}
                >
                  { (isConnecting || whatsappStatus?.status === 'connecting') ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
                  {whatsappStatus?.status === 'connecting' ? 'Aguarde...' : 'Conectar WhatsApp'}
                </button>

                {whatsappStatus?.status === 'connecting' && (
                  <button 
                    onClick={handleReset}
                    className="whitespace-nowrap px-6 py-3 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg font-bold flex items-center gap-2 transition-all shadow-sm"
                  >
                    <RefreshCw size={18} />
                    Resetar
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Grid de Navegação Rápida */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickNavCard 
          icon={Bot} 
          title="Agentes" 
          subtitle="Configure seu agente" 
          onClick={() => onTabChange?.('agents')}
        />
        <QuickNavCard 
          icon={MessageSquare} 
          title="Chats" 
          subtitle="Acompanhe suas conversas" 
          onClick={() => onTabChange?.('inbox')}
        />
        <QuickNavCard 
          icon={Calendar} 
          title="Agendamentos" 
          subtitle="Veja seus agendamentos" 
          onClick={() => onTabChange?.('schedule')}
        />
        <QuickNavCard 
          icon={Users} 
          title="Contatos" 
          subtitle="Gerencie seus contatos" 
          onClick={() => onTabChange?.('contacts')}
        />
        <QuickNavCard 
          icon={Clock} 
          title="Disponibilidade" 
          subtitle="Defina seus horários" 
          onClick={() => onTabChange?.('availability')}
        />
        <QuickNavCard 
          icon={Radio} 
          title="Canais" 
          subtitle="Gerencie seus canais" 
          onClick={() => onTabChange?.('settings', 'channels')}
        />
        <QuickNavCard 
          icon={Plug} 
          title="Integrações" 
          subtitle="Conecte suas ferramentas" 
          onClick={() => onTabChange?.('integrations')}
        />
        <QuickNavCard 
          icon={BarChart3} 
          title="Relatórios" 
          subtitle="Confira seus resultados" 
          onClick={() => onTabChange?.('reports')}
        />
      </div>

      {/* 3. Banner de Plano / Upsell */}
      <div className="bg-[#f0f9f9] border border-[#d1eeee] rounded-xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 text-[#2d7a7a] opacity-10">
          <Sparkles size={120} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-[#2d7a7a] text-white text-[10px] font-bold uppercase rounded flex items-center gap-1">
              <Zap size={10} fill="currentColor" /> Teste Grátis
            </span>
          </div>
          <h2 className="text-2xl font-black text-[#1a4d4d] mb-1">Escolha o melhor plano para você</h2>
          <p className="text-sm text-[#2d7a7a] opacity-80 mb-8">Escolha um plano e comece a transformar seu atendimento com nossa IA hoje mesmo</p>

          <div className="flex flex-col items-center justify-center mb-8">
            <p className="text-[10px] font-bold text-[#2d7a7a] uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={12} /> Tempo restante do teste grátis:
            </p>
            <div className="flex gap-4">
              {[
                { val: String(timeLeft.days), label: 'dias' },
                { val: String(timeLeft.hours).padStart(2, '0'), label: 'horas' },
                { val: String(timeLeft.mins).padStart(2, '0'), label: 'min' },
                { val: String(timeLeft.secs).padStart(2, '0'), label: 'seg' }
              ].map((t, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-14 h-14 bg-white rounded-lg border border-[#d1eeee] flex items-center justify-center text-xl font-black text-[#1a4d4d] shadow-sm">
                    {t.val}
                  </div>
                  <span className="text-[10px] font-bold text-[#2d7a7a] mt-1 uppercase">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 mb-8 max-w-md">
            {[
              "Agenda automatizada com IA",
              "Agente personalizado para seu negócio",
              "Integração com WhatsApp"
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-[#1a4d4d] font-medium">
                <CheckCircle2 size={16} className="text-green-500" />
                {item}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button 
              onClick={() => onTabChange?.('settings', 'subscription')}
              className="w-full py-3 bg-[#2d7a7a] hover:bg-[#235e5e] text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-[#2d7a7a]/20"
            >
              <LayoutGrid size={18} />
              Escolher Plano
            </button>
            <button 
              onClick={() => window.open('https://wa.me/5532984963439?text=Olá! Vim pelo sistema e gostaria de falar com um consultor.', '_blank')}
              className="w-full py-3 bg-white border border-[#2d7a7a] text-[#2d7a7a] hover:bg-[#f0f9f9] rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
            >
              <MessageCircle size={18} />
              Chamar consultor
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Análise Geral</h2>
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-all shadow-sm">
            Últimos 7 dias <ChevronDown size={14} />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Novos Leads', value: stats.contacts, icon: Users, color: 'blue', trend: 'Total' },
            { label: 'Qualificados', value: stats.qualified, icon: Sparkles, color: 'purple', trend: 'Score > 7' },
            { label: 'Agendamentos', value: stats.appointments, icon: Calendar, color: 'emerald', trend: 'CRM' },
            { label: 'Conversão', value: `${stats.conversionRate}%`, icon: Zap, color: 'amber', trend: 'Lead → Appt' },
          ].map((item, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card glass-card-hover p-6 rounded-3xl relative overflow-hidden group"
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-2xl transition-all duration-500 bg-${item.color}-50 text-${item.color}-600 group-hover:bg-${item.color}-600 group-hover:text-white shadow-sm`}>
                  <item.icon size={24} />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest text-${item.color}-600 bg-${item.color}-50 px-2 py-1 rounded-full border border-${item.color}-100`}>
                  {item.trend}
                </span>
              </div>
              <div className="mt-5 relative z-10">
                <h3 className="text-4xl font-extrabold text-slate-900 tracking-tighter">
                  {loading ? <div className="h-10 w-20 bg-slate-100 animate-pulse rounded-xl" /> : item.value}
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.label}</p>
              </div>
              
              {/* Decorative Background Icon */}
              <div className={`absolute -bottom-10 -right-10 text-${item.color}-500 opacity-[0.03] group-hover:opacity-[0.07] transition-all duration-700`}>
                <item.icon size={160} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

        {/* Gráfico de Evolução Premium */}
        <div className="glass-card p-8 rounded-3xl mt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Crescimento da Operação</h3>
              <button 
                onClick={() => onTabChange?.('reports')}
                className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-1 hover:underline flex items-center gap-1"
              >
                Análise de Performance Semanal <ArrowUpRight size={10} />
              </button>
            </div>
            <div className="flex items-center gap-6 bg-slate-50/50 p-2 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 px-3">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-lg shadow-blue-200" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Leads</span>
              </div>
              <div className="flex items-center gap-2 px-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-200" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Agendamentos</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Gráfico Linear de Histórico */}
            <div className="lg:col-span-2 h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSched" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" strokeOpacity={0.4} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="custom-tooltip">
                          <span className="label text-slate-400 text-[10px] font-black uppercase mb-2 block">{label}</span>
                          <div className="space-y-2">
                            {payload.map((p: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-6">
                                <span className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                                  <span className="text-white/80 font-medium">{p.name}</span>
                                </span>
                                <span className="font-black text-white">{p.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="leads" 
                  name="Leads"
                  stroke="#3b82f6" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorLeads)" 
                  animationDuration={2000}
                />
                <Area 
                  type="monotone" 
                  dataKey="agendamentos" 
                  name="Agendamentos"
                  stroke="#10b981" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorSched)" 
                  animationDuration={2000}
                  animationBegin={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel e Qualidade Side Panel */}
          <div className="lg:col-span-1 border-l border-slate-100 pl-4 space-y-8">
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Funil de Vendas</h4>
              <div className="space-y-4">
                {[
                  { label: 'Total de Leads', value: stats.contacts, pct: 100, color: 'bg-blue-500' },
                  { label: 'Qualificados', value: stats.qualified, pct: stats.contacts > 0 ? (stats.qualified / stats.contacts) * 100 : 0, color: 'bg-purple-500' },
                  { label: 'Agendados', value: stats.appointments, pct: stats.contacts > 0 ? (stats.appointments / stats.contacts) * 100 : 0, color: 'bg-emerald-500' }
                ].map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="text-slate-900">{item.value}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.pct}%` }}
                        className={`h-full ${item.color}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-amber-500 shadow-sm">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h5 className="text-sm font-black text-slate-900">Score Médio</h5>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Qualidade da Base</p>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900">{stats.avgScore}</span>
                <span className="text-sm font-bold text-slate-400">/ 10</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Painéis Inferiores (Split 50/50) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna Esquerda: Próximos Agendamentos */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col min-h-[400px]">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Próximos Agendamentos</h3>
            <Calendar size={18} className="text-gray-400" />
          </div>
          
          <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[400px]">
            {upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 mb-4">
                  <CalendarX size={32} />
                </div>
                <h4 className="text-sm font-bold text-gray-900">Nenhum agendamento próximo</h4>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px]">Quando houver novos agendamentos, eles aparecerão aqui.</p>
              </div>
            ) : (
              upcomingAppointments.map((appt) => (
                <div 
                  key={appt.id} 
                  onClick={() => setSelectedItem(appt)}
                  className="flex items-center gap-4 p-4 rounded-xl border border-gray-50 hover:bg-emerald-50/30 hover:border-emerald-100 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] uppercase font-black leading-none">{new Date(appt.date).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                    <span className="text-lg font-black leading-tight">{new Date(appt.date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{appt.name}</h4>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} /> {appt.time}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-gray-50/50 border-t border-gray-50 text-center">
            <button 
              onClick={() => onTabChange?.('schedule')}
              className="text-xs font-bold text-gray-500 hover:text-blue-600 transition-colors"
            >
              Ver todos os agendamentos
            </button>
          </div>
        </div>

        {/* Coluna Direita: Atividades Recentes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col min-h-[400px]">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Atividades Recentes</h3>
            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{activities.length}</span>
          </div>
          
          <div className="p-6 space-y-4 overflow-y-auto max-h-[400px]">
            {activities.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs text-gray-400">Nenhuma atividade recente.</p>
              </div>
            ) : (
              activities.map((activity, i) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedItem(activity)}
                  className="flex items-start gap-4 p-4 rounded-xl border border-gray-50 hover:bg-gray-50 transition-all cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative ${
                    activity.type === 'contact' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'
                  }`}>
                    {activity.type === 'contact' ? <User size={20} /> : <Calendar size={20} />}
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center border border-gray-100">
                      <MessageCircle size={10} className="text-green-500" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900">{activity.title}</h4>
                    <p className="text-xs text-gray-500 truncate">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-blue-600 truncate">{activity.name} {activity.phone}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">• {new Date(activity.time).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors mt-2" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes da Atividade */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden relative z-10"
            >
              {/* Header do Modal */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                    selectedItem.type === 'contact' ? 'bg-blue-500' : 'bg-emerald-500'
                  }`}>
                    {selectedItem.type === 'contact' ? <User size={20} /> : <Calendar size={20} />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{selectedItem.title}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      ID: {selectedItem.id?.slice(0, 8) || 'N/A'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-xl transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Conteúdo do Modal */}
              <div className="p-8 space-y-6">
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Informações do Contato</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <span className="text-xs text-gray-500">Nome:</span>
                      <span className="text-sm font-bold text-gray-900">{selectedItem.name}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <span className="text-xs text-gray-500">Telefone:</span>
                      <span className="text-sm font-bold text-blue-600">{selectedItem.phone}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Resumo da Atividade</h4>
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5">
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      "{selectedItem.description}"
                    </p>
                    {selectedItem.summary && (
                      <div className="mt-4 pt-4 border-t border-blue-100">
                        <p className="text-xs text-blue-600 font-bold mb-1 uppercase tracking-tight">Observações:</p>
                        <p className="text-sm text-gray-600">{selectedItem.summary}</p>
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400 font-bold">
                      <Clock size={12} />
                      {new Date(selectedItem.time || selectedItem.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="p-6 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => {
                    const jid = `${selectedItem.phone.replace(/\D/g, '')}@c.us`;
                    const url = new URL(window.location.href);
                    url.searchParams.set('jid', jid);
                    window.history.pushState({}, '', url);
                    onTabChange?.('inbox');
                    setSelectedItem(null);
                  }}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all"
                >
                  <MessageSquare size={18} />
                  Abrir Chat
                </button>
                <button 
                  onClick={() => {
                    onTabChange?.('schedule');
                    setSelectedItem(null);
                  }}
                  className="px-6 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-bold text-sm transition-all shadow-sm"
                >
                  Ver Agenda
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Conectar WhatsApp */}
      <AnimatePresence>
        {isWhatsAppModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsWhatsAppModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden relative z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Conectar ao WhatsApp</h3>
                <button 
                  onClick={() => setIsWhatsAppModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Instruções */}
                <div className="space-y-6">
                  {[
                    "Abra o WhatsApp no celular",
                    "Toque em Mais opções ou Configurações",
                    "Toque em Aparelhos conectados",
                    "Aponte a câmera para esta tela"
                  ].map((text, i) => (
                    <div key={i} className="flex gap-4 items-start">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-600 font-medium leading-relaxed pt-1">
                        {text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* QR Code Placeholder */}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-56 h-56 border-2 border-dashed border-gray-200 rounded-3xl flex items-center justify-center bg-gray-50/50 relative group overflow-hidden">
                    {whatsappStatus?.qr ? (
                      <img 
                        src={whatsappStatus.qr.startsWith('data:') ? whatsappStatus.qr : `data:image/png;base64,${whatsappStatus.qr}`} 
                        alt="WhatsApp QR Code" 
                        className="w-full h-full object-contain p-2"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ) : (
                      <QrCode size={120} className="text-gray-200 group-hover:text-emerald-500 transition-colors" />
                    )}
                    
                    {isConnecting && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center">
                        <Loader2 size={40} className="animate-spin text-emerald-500" />
                      </div>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={handleRefreshQr}
                        className="bg-white px-4 py-2 rounded-lg shadow-lg text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-50 transition-all"
                      >
                        <RefreshCw size={12} />
                        Atualizar QR
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100">
                <div className="flex items-center gap-3 text-gray-400 text-sm font-medium">
                  {whatsappStatus?.status === 'connected' ? (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Check size={18} />
                      WhatsApp Conectado!
                    </div>
                  ) : (
                    <>
                      <Loader2 size={18} className="animate-spin text-emerald-500" />
                      {isConnecting ? 'Processando...' : 'Aguardando leitura do QR Code…'}
                    </>
                  )}
                </div>

                {whatsappStatus?.status !== 'connected' && (
                  <button 
                    onClick={handleReset}
                    className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Resetar conexão
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
