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
  ChevronRight,
  Send
} from 'lucide-react';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
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
  getDashboardGrowth,
  getUserProfile,
  getAIStats,
  type AIStats,
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
import { format, subDays, startOfMonth, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useFeatureContext } from '../contexts/FeatureFlagContext';

const DATE_RANGES = [
  { label: 'Hoje',          days: 1   },
  { label: 'Últimos 7 dias', days: 7  },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
  { label: 'Este mês',       days: -1  },
] as const;

const ACCENT: Record<string, { bg: string; text: string; border: string }> = {
  violet: { bg: 'bg-violet-50', text: 'text-violet-500', border: 'hover:border-violet-200' },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-500',   border: 'hover:border-blue-200' },
  emerald:{ bg: 'bg-emerald-50',text: 'text-emerald-500',border: 'hover:border-emerald-200' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500', border: 'hover:border-indigo-200' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-500',  border: 'hover:border-amber-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-500', border: 'hover:border-orange-200' },
  teal:   { bg: 'bg-teal-50',   text: 'text-teal-500',   border: 'hover:border-teal-200' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-500', border: 'hover:border-purple-200' },
  rose:   { bg: 'bg-rose-50',   text: 'text-rose-500',   border: 'hover:border-rose-200' },
  sky:    { bg: 'bg-sky-50',    text: 'text-sky-500',    border: 'hover:border-sky-200' },
  pink:   { bg: 'bg-pink-50',   text: 'text-pink-500',   border: 'hover:border-pink-200' },
  slate:  { bg: 'bg-slate-50',  text: 'text-slate-400',  border: 'hover:border-slate-200' },
};

const QuickNavCard = ({ icon: Icon, imageSrc, title, subtitle, onClick, accent = 'slate' }: {
  icon?: any, imageSrc?: string, title: string, subtitle: string, onClick?: () => void, accent?: string
}) => {
  const a = ACCENT[accent] ?? ACCENT.slate;
  return (
    <div
      onClick={onClick}
      className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group ${a.border}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${a.bg} ${a.text} flex items-center justify-center group-hover:scale-110 transition-transform overflow-hidden shrink-0`}>
          {imageSrc ? (
            <img src={imageSrc} alt="Zyreo Sofia" className="w-full h-full object-cover" />
          ) : Icon && (
            <Icon size={20} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900">{title}</h4>
          <p className="text-[11px] text-gray-400 truncate">{subtitle}</p>
        </div>
        <ChevronRight size={14} className="text-slate-200 group-hover:text-slate-400 transition-colors shrink-0" />
      </div>
    </div>
  );
};

const MetricCard = ({ icon: Icon, title, value }: { icon: any, title: string, value: string }) => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
    <div className="flex items-center gap-2 text-gray-400 mb-4">
      <Icon size={16} />
      <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
    </div>
    <h3 className="text-3xl font-black text-gray-900">{value}</h3>
  </div>
);

export default function Dashboard({ onTabChange, role, user, plano }: { onTabChange?: (tab: string, subTab?: string) => void, role?: string, user: SupabaseUser | null, plano?: string | null }) {
  const { flags } = useFeatureContext();
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  const checkPlan = (minPlan: string) => {
    if (role === 'admin') return true;
    const plans = ['Trial', 'Starter', 'Pro', 'Elite', 'Enterprise'];
    const userPlanIdx = plans.indexOf(plano || 'Trial');
    const minPlanIdx = plans.indexOf(minPlan);
    return userPlanIdx >= minPlanIdx;
  };

  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedRange, setSelectedRange] = useState<typeof DATE_RANGES[number]>(DATE_RANGES[1]);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const rangeRef = React.useRef<HTMLDivElement>(null);
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
  const [aiStats, setAiStats] = useState<AIStats | null>(null);
  const [timeLeft, setTimeLeft] = useState({ days: 10, hours: 0, mins: 0, secs: 0 });
  const [isExpired, setIsExpired] = useState(false);

  // Trial Timer Logic
  useEffect(() => {
    if (!user?.created_at && !profile?.trial_ends_at) return;

    const calculateTime = () => {
      let trialEndDate: Date;
      
      if (profile?.trial_ends_at) {
        trialEndDate = new Date(profile.trial_ends_at);
      } else {
        const signupDate = new Date(user?.created_at || Date.now());
        trialEndDate = new Date(signupDate.getTime() + 10 * 24 * 60 * 60 * 1000);
      }

      const now = new Date();
      const diff = trialEndDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0 });
        setIsExpired(true);
        return;
      }
      setIsExpired(false);

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
  }, [user?.created_at, profile?.trial_ends_at]);

  // Close date range dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) setIsRangeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch stats filtered by selected date range
  useEffect(() => {
    if (!user?.id) return;
    const fetchFilteredStats = async () => {
      const now = new Date();
      const startDate = selectedRange.days === -1
        ? startOfMonth(now).toISOString()
        : new Date(Date.now() - selectedRange.days * 24 * 60 * 60 * 1000).toISOString();

      const [newLeadsRes, qualifiedRes, resolvedRes] = await Promise.all([
        supabase.from('contacts').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('data_criacao', startDate),
        supabase.from('contacts').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status_funil', 'Qualificado').gte('data_criacao', startDate),
        supabase.from('contacts').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status_funil', 'Resolvido').gte('data_criacao', startDate),
      ]);

      const newLeads = newLeadsRes.count ?? 0;
      const qualified = qualifiedRes.count ?? 0;
      const resolved = resolvedRes.count ?? 0;
      const conversionRate = newLeads > 0 ? Math.round((resolved / newLeads) * 100) : 0;

      setStats(prev => ({ ...prev, contacts: newLeads, qualified, appointments: resolved, conversionRate }));
    };

    fetchFilteredStats();
  }, [user?.id, selectedRange]);

  // Update growth chart when range changes
  useEffect(() => {
    if (!user?.id) return;
    const days = selectedRange.days === -1
      ? Math.max(1, differenceInDays(new Date(), startOfMonth(new Date())) + 1)
      : selectedRange.days;

    getDashboardGrowth(days).then(growthData => {
      const baseAppts = (stats.appointments || 0) / (growthData.length || days);
      const baseLeads = (stats.contacts || 0) / (growthData.length || days);
      const formatted = growthData.map((d: any) => ({
        name: format(new Date(d.date + 'T12:00:00'), days <= 7 ? 'dd MMM' : days <= 30 ? 'dd/MM' : 'MMM', { locale: ptBR }),
        leads: d.leads || Math.max(0, Math.floor(baseLeads + (Math.random() * 2))),
        resolvidos: d.resolvidos || Math.max(0, Math.floor(baseAppts + (Math.random() * 1.5)))
      }));
      setChartData(formatted);
    }).catch(() => setChartData([]));
  }, [user?.id, selectedRange]);

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
          if (p && (p.nome_completo || p.name)) {
            setProfile(p);
          } else {
            supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
              if (data) {
                setProfile(prev => ({ ...(prev || {}), ...(data as any), nome_completo: data.nome_completo || data.name || (data as any).full_name || prev?.nome_completo }));
              }
            });
          }
        });

        // AI Performance stats (non-blocking)
        getAIStats(userId).then(s => setAiStats(s)).catch(() => {});

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

        // Stats and growth chart are now driven by the selectedRange useEffect

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

  // Force Disconnect if Expired
  useEffect(() => {
    const checkAndDisconnect = async () => {
      if (isExpired && profile?.plano?.toLowerCase() === 'trial' && whatsappStatus?.status === 'connected' && !isConnecting) {
        console.log('[Dashboard] ⚠️ Trial expired. Forcing WhatsApp disconnection.');
        try {
          await handleDisconnect();
          toast.error('Seu período de teste expirou. O WhatsApp foi desconectado.', {
            description: 'Assine um plano para continuar usando a Sofia.'
          });
        } catch (e) {
          console.error('Failed to force disconnect on expiration:', e);
        }
      }
    };
    checkAndDisconnect();
  }, [isExpired, whatsappStatus?.status, profile?.plano]);

  const handleConnect = async () => {
    if (isExpired && profile?.plano?.toLowerCase() === 'trial') {
      toast.error('Período de teste expirado!', {
        description: 'Escolha um plano para ativar seu WhatsApp.'
      });
      onTabChange?.('settings', 'subscription');
      return;
    }
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

  const getUserDisplayName = () => {
    const raw =
      profile?.nome_completo ||
      profile?.name ||
      (profile as any)?.full_name ||
      user?.user_metadata?.nome_completo ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.user_metadata?.nome ||
      (user?.email ? user.email.split('@')[0] : '') ||
      '';
    const clean = raw.trim();
    if (!clean) return 'Usuário';
    const first = clean.split(' ')[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  };

  const isTrialOrNoPlan = (!plano || plano.toLowerCase() === 'trial') || (!profile?.plano || profile?.plano?.toLowerCase() === 'trial');

  return (
    <div className="space-y-5">
      {/* 1. Cabeçalho da página */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="pill bg-primary-50 text-primary-700 uppercase tracking-[0.06em] text-[10px]">
              {role === 'admin' ? 'Todos os clientes' : (profile?.plano ? `Plano ${profile.plano}` : 'Minha conta')}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Conectado em tempo real
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {role === 'admin'
              ? 'Visão Geral e Performance'
              : `Olá, ${getUserDisplayName()}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === 'admin' ? 'Acompanhamento consolidado de todos os clientes e métricas da plataforma.' : 'Aqui está o resumo do seu atendimento hoje.'}
          </p>
        </div>

        <div className="relative self-start md:self-auto" ref={rangeRef}>
          <button
            id="dashboard-range-button"
            onClick={() => setIsRangeOpen(v => !v)}
            className="flex items-center gap-2 h-9 bg-white border border-slate-200 px-3 rounded-lg text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Calendar size={14} className="text-slate-400" />
            {selectedRange.label}
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${isRangeOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {isRangeOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 mt-2 w-44 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50 p-1"
              >
                {DATE_RANGES.map(range => (
                  <button
                    key={range.label}
                    onClick={() => { setSelectedRange(range); setIsRangeOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                      selectedRange.label === range.label
                        ? 'bg-primary-600 text-white'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 2. Banner de Plano / Upsell Compacto (Topo) - Apenas para Trial ou Sem Plano */}
      {(isTrialOrNoPlan && role !== 'admin') && (
        <div className={`${isExpired ? 'bg-red-50 border-red-200' : 'bg-[#f0f9f9] border-[#d1eeee]'} border rounded-xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-5 transition-colors shadow-sm`}>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className={`w-12 h-12 md:w-14 md:h-14 ${isExpired ? 'bg-red-500 text-white shadow-red-200' : 'bg-[#2d7a7a] text-white shadow-[#2d7a7a]/20'} rounded-xl flex items-center justify-center shrink-0 shadow-md`}>
              <Sparkles size={28} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 ${isExpired ? 'bg-red-600' : 'bg-[#2d7a7a]'} text-white text-[10px] font-bold uppercase rounded flex items-center gap-1`}>
                  <Zap size={10} fill="currentColor" /> {isExpired ? 'Acesso Expirado' : 'Teste Grátis'}
                </span>
                <span className={`px-2 py-0.5 ${isExpired ? 'bg-red-100 text-red-700 border-red-200' : 'bg-[#e2f4f4] text-[#2d7a7a] border-[#bfe3e3]'} text-[10px] font-bold uppercase rounded border flex items-center gap-1`}>
                  <Clock size={10} /> {isExpired ? 'Encerrado' : `Restam ${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.mins}m`}
                </span>
              </div>
              <h2 className={`text-lg md:text-xl font-bold ${isExpired ? 'text-red-900' : 'text-[#1a4d4d]'}`}>
                {isExpired ? 'Seu período de teste chegou ao fim' : 'Escolha o melhor plano para você'}
              </h2>
              <p className={`text-xs md:text-sm ${isExpired ? 'text-red-700' : 'text-[#2d7a7a]'} opacity-85`}>
                {isExpired ? 'Assine um de nossos planos para continuar utilizando a plataforma e a IA.' : 'Escolha um plano e comece a transformar seu atendimento com nossa IA hoje mesmo.'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto shrink-0">
            <button
              onClick={() => onTabChange?.('settings', 'subscription')}
              className={`whitespace-nowrap px-5 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md text-sm ${
                isExpired
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-200'
                  : 'bg-[#2d7a7a] hover:bg-[#235e5e] text-white shadow-[#2d7a7a]/25'
              }`}
            >
              <LayoutGrid size={16} />
              Escolher Plano
            </button>
            <button
              onClick={() => window.open('https://wa.me/5532984963439?text=Olá! Vim pelo sistema e gostaria de falar com um consultor.', '_blank')}
              className="whitespace-nowrap px-4 py-2.5 bg-white border border-[#2d7a7a]/30 text-[#2d7a7a] hover:bg-white/80 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all text-sm"
            >
              <MessageCircle size={16} />
              Chamar consultor
            </button>
          </div>
        </div>
      )}

      {/* 3. Grid de Navegação Rápida */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          return (
            <>
              {checkPlan('Pro') && (
                <QuickNavCard imageSrc="/sofiamini.png" accent="violet"
                  title="Agentes" subtitle="Configure seu agente"
                  onClick={() => onTabChange?.('agents')} />
              )}
              {checkPlan('Pro') && (role === 'admin' || flags['agendas'] !== false) && (
                <QuickNavCard icon={Calendar} accent="emerald"
                  title="Agendamentos" subtitle="Veja seus agendamentos"
                  onClick={() => onTabChange?.('schedule')} />
              )}
              {checkPlan('Pro') && (role === 'admin' || flags['agendas'] !== false) && (
                <QuickNavCard icon={Clock} accent="amber"
                  title="Disponibilidade" subtitle="Defina seus horários"
                  onClick={() => onTabChange?.('availability')} />
              )}
              {checkPlan('Starter') && (role === 'admin' || flags['official_api'] !== false) && (
                <QuickNavCard icon={Radio} accent="orange"
                  title="Canais" subtitle="Gerencie seus canais"
                  onClick={() => onTabChange?.('settings', 'channels')} />
              )}
              {checkPlan('Starter') && (role === 'admin' || flags['official_api'] !== false) && (
                <QuickNavCard icon={Plug} accent="teal"
                  title="Integrações" subtitle="Conecte suas ferramentas"
                  onClick={() => onTabChange?.('integrations')} />
              )}
              {checkPlan('Pro') && (
                <QuickNavCard icon={LayoutGrid} accent="purple"
                  title="Kanban" subtitle="Organize seus leads"
                  onClick={() => onTabChange?.('inbox', 'kanban')} />
              )}
              {checkPlan('Pro') && (role === 'admin' || flags['reports'] !== false) && (
                <QuickNavCard icon={BarChart3} accent="rose"
                  title="Relatórios" subtitle="Confira seus resultados"
                  onClick={() => onTabChange?.('reports')} />
              )}
              {checkPlan('Starter') && (
                <QuickNavCard icon={MessageSquare} accent="sky"
                  title="Atalhos" subtitle="Respostas rápidas"
                  onClick={() => onTabChange?.('quick_replies')} />
              )}
              {checkPlan('Elite') && (role === 'admin' || flags['campaigns'] !== false) && (
                <QuickNavCard icon={Send} accent="pink"
                  title="Campanhas" subtitle="Envio em massa"
                  onClick={() => onTabChange?.('campaigns')} />
              )}
            </>
          );
        })()}
      </div>

      {/* 4. Indicadores principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Novos Leads', value: stats.contacts, unit: 'leads', icon: Users, color: '#2563eb', tint: 'bg-blue-50 text-blue-600', trend: '+12%', foot: 'no período' },
          { label: 'Qualificados', value: stats.qualified, unit: 'leads', icon: Sparkles, color: '#7c3aed', tint: 'bg-violet-50 text-violet-600', trend: '+5%', foot: 'prontos para venda' },
          { label: 'Resolvidos', value: stats.appointments, unit: 'atendimentos', icon: CheckCircle2, color: '#f97316', tint: 'bg-orange-50 text-orange-600', trend: '+8%', foot: 'concluídos' },
          { label: 'Taxa de Conversão', value: `${stats.conversionRate}%`, unit: '', icon: Zap, color: '#10b981', tint: 'bg-emerald-50 text-emerald-600', trend: 'Estável', foot: 'resolvidos sobre leads' },
        ].map((item, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="kpi-card"
            style={{ ['--kpi-color' as any]: item.color }}
          >
            <div className="flex items-start justify-between">
              <p className="label-caps">{item.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.tint}`}>
                <item.icon size={16} />
              </div>
            </div>

            <div className="mt-2 flex items-baseline gap-1.5 min-h-[34px]">
              {loading ? (
                <Skeleton variant="text" width={60} height={28} />
              ) : (
                <>
                  <span className="text-[28px] leading-none font-bold text-slate-900 tracking-tight tabular-nums">{item.value}</span>
                  {item.unit && <span className="text-[13px] font-medium text-slate-500">{item.unit}</span>}
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className={`pill ${
                item.trend.includes('+') ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {item.trend.includes('+') && <ArrowUpRight size={11} />}
                {item.trend}
              </span>
              <span className="text-[11px] text-slate-500">{item.foot}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* IA Performance — card compacto, exibido só quando há dados */}
      {aiStats && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
              <h3 className="text-[15px] font-semibold text-slate-900">Performance da IA hoje</h3>
            </div>
            <span className="pill bg-primary-50 text-primary-700"><Bot size={11} /> Sofia</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Interações', value: String(aiStats.total_today), sub: 'mensagens processadas' },
              { label: 'Custo', value: `R$ ${aiStats.cost_today.toFixed(3)}`, sub: 'gasto em tokens hoje' },
              { label: 'Resolução', value: `${aiStats.resolution_rate}%`, sub: 'respondido sem transferência' },
              { label: 'Tempo médio', value: aiStats.avg_duration_ms > 0 ? `${(aiStats.avg_duration_ms / 1000).toFixed(1)}s` : '---', sub: aiStats.top_tool ? `ferramenta mais usada: ${aiStats.top_tool}` : 'tempo de resposta' },
            ].map((item, i) => (
              <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 p-3.5">
                <p className="label-caps text-[10px]">{item.label}</p>
                <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{item.value}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Gráfico + painel lateral (padrão: card largo + card estreito) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de evolução */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                <h3 className="text-[15px] font-semibold text-slate-900">Crescimento da Operação</h3>
              </div>
              <p className="text-[12px] text-slate-500 mt-0.5">Novos leads e atendimentos resolvidos por dia</p>
            </div>
            <span className="pill bg-primary-50 text-primary-700 self-start">{selectedRange.label}</span>
          </div>

          {/* Resumo do período */}
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 border border-slate-100 p-4 mb-5">
            <div>
              <p className="label-caps text-[10px]">Leads no período</p>
              <p className="text-[16px] font-bold text-slate-900 mt-1 tabular-nums">{stats.contacts}</p>
            </div>
            <div>
              <p className="label-caps text-[10px]">Taxa de conversão</p>
              <p className="text-[16px] font-bold text-emerald-600 mt-1 tabular-nums">{stats.conversionRate}%</p>
            </div>
            <div>
              <p className="label-caps text-[10px]">Qualificados</p>
              <p className="text-[16px] font-bold text-slate-900 mt-1 tabular-nums">{stats.qualified}</p>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22}/>
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSched" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="custom-tooltip">
                          <span className="label">{label}</span>
                          <div className="space-y-1.5">
                            {payload.map((p: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-6">
                                <span className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                                  <span className="text-white/80 font-medium">{p.name}</span>
                                </span>
                                <span className="font-bold text-white tabular-nums">{p.value}</span>
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
                  stroke="#2563eb" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorLeads)" 
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  animationDuration={1200}
                />
                <Area 
                  type="monotone" 
                  dataKey="resolvidos" 
                  name="Resolvidos"
                  stroke="#10b981" 
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  fillOpacity={1} 
                  fill="url(#colorSched)" 
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  animationDuration={1200}
                  animationBegin={200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-2 text-[12px] text-slate-600">
                <span className="w-4 h-0.5 rounded bg-primary-600" /> Leads
              </span>
              <span className="flex items-center gap-2 text-[12px] text-slate-600">
                <span className="w-4 h-0 border-t-2 border-dashed border-emerald-500" /> Resolvidos
              </span>
            </div>
            <button 
              onClick={() => onTabChange?.('reports')}
              className="text-[12px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Ver relatório completo <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* Painel lateral: canal + funil */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Canal e Funil</h3>
              <p className="text-[12px] text-slate-500 mt-0.5">Conexão do WhatsApp e etapas de conversão</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center">
              <Radio size={15} />
            </div>
          </div>

          {/* Canal principal */}
          <div className="rounded-lg border border-primary-100 bg-primary-50/50 p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={15} className="text-primary-600" />
                <span className="text-[13px] font-semibold text-slate-900">WhatsApp</span>
              </div>
              <span className={`pill ${
                whatsappStatus?.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${whatsappStatus?.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {whatsappStatus?.status === 'connected' ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-white border border-slate-100 p-2.5">
                <p className="text-[10px] text-slate-500">Instância</p>
                <p className="text-[13px] font-semibold text-slate-900 truncate">{user?.email?.split('@')[0] || '---'}</p>
              </div>
              <div className="rounded-md bg-white border border-slate-100 p-2.5">
                <p className="text-[10px] text-slate-500">Resolvidos</p>
                <p className="text-[13px] font-semibold text-emerald-600 tabular-nums">{stats.appointments}</p>
              </div>
            </div>
            {whatsappStatus?.status !== 'connected' && (
              <button
                onClick={handleConnect}
                className="mt-3 w-full h-8 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-[12px] font-semibold transition-colors"
              >
                Conectar agora
              </button>
            )}
          </div>

          {/* Funil de conversão */}
          <p className="label-caps text-[10px] mb-3">Funil de conversão</p>
          <div className="space-y-4">
            {[
              { label: 'Leads captados', value: stats.contacts, pct: 100, color: '#2563eb' },
              { label: 'Qualificados', value: stats.qualified, pct: stats.contacts > 0 ? (stats.qualified / stats.contacts) * 100 : 0, color: '#7c3aed' },
              { label: 'Resolvidos', value: stats.appointments, pct: stats.contacts > 0 ? (stats.appointments / stats.contacts) * 100 : 0, color: '#10b981' }
            ].map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[13px] text-slate-700">{item.label}</span>
                  </div>
                  <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                    {item.value}
                    <span className="ml-1.5 text-[11px] font-medium text-slate-400">{Math.round(item.pct)}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <div className="flex items-center gap-2 pt-4 border-t border-slate-100 text-[12px] text-slate-500">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Dados atualizados em tempo real
            </div>
          </div>
        </div>
      </div>

      {/* 6. Painéis Inferiores (Agendamentos e Atividades Recentes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna Esquerda: Próximos Agendamentos */}
        <div className="card flex flex-col min-h-[380px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <h3 className="text-[15px] font-semibold text-slate-900">Próximos Agendamentos</h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Calendar size={15} />
            </div>
          </div>
          
          <div className="flex-1 p-4 space-y-2.5 overflow-y-auto max-h-[360px]">
            {loading ? (
              <ListSkeleton rows={4} />
            ) : upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mb-3">
                  <CalendarX size={24} />
                </div>
                <h4 className="text-[13px] font-semibold text-slate-800">Nenhum agendamento próximo</h4>
                <p className="text-[12px] text-slate-400 mt-1 max-w-[220px]">Quando houver novos agendamentos, eles aparecerão aqui.</p>
              </div>
            ) : (
              upcomingAppointments.map((appt) => (
                <div 
                  key={appt.id} 
                  onClick={() => setSelectedItem(appt)}
                  className="flex items-center gap-3.5 p-3 rounded-lg border border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                >
                  <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] uppercase font-bold leading-none">{new Date(appt.date).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                    <span className="text-base font-bold leading-tight mt-0.5">{new Date(appt.date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13px] font-semibold text-slate-900 truncate">{appt.name}</h4>
                    <p className="text-[12px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock size={12} className="text-slate-400" /> {appt.time}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-slate-100 text-center">
            <button
              onClick={() => onTabChange?.('schedule')}
              className="text-[12px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
            >
              Ver todos os agendamentos
            </button>
          </div>
        </div>

        {/* Coluna Direita: Atividades Recentes */}
        <div className="card flex flex-col min-h-[380px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
              <h3 className="text-[15px] font-semibold text-slate-900">Atividades Recentes</h3>
            </div>
            <span className="pill bg-primary-50 text-primary-700">{activities.length}</span>
          </div>
          
          <div className="flex-1 p-4 space-y-2.5 overflow-y-auto max-h-[360px]">
            {loading ? (
              <ListSkeleton rows={4} />
            ) : activities.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[12px] text-slate-400">Nenhuma atividade recente.</p>
              </div>
            ) : (
              activities.map((activity, i) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedItem(activity)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 relative ${
                    activity.type === 'contact' ? 'bg-primary-50 text-primary-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {activity.type === 'contact' ? <User size={16} /> : <Calendar size={16} />}
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center border border-slate-100">
                      <MessageCircle size={9} className="text-emerald-500" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13px] font-semibold text-slate-900">{activity.title}</h4>
                    <p className="text-[12px] text-slate-500 truncate mt-0.5">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-medium text-primary-600 truncate">{activity.name} {activity.phone}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">• {new Date(activity.time).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors mt-2" />
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
                    selectedItem.type === 'contact' ? 'bg-primary-500' : 'bg-emerald-500'
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
                      <span className="text-sm font-bold text-primary-600">{selectedItem.phone}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Resumo da Atividade</h4>
                  <div className="bg-primary-50/50 border border-primary-100 rounded-2xl p-5">
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      "{selectedItem.description}"
                    </p>
                    {selectedItem.summary && (
                      <div className="mt-4 pt-4 border-t border-primary-100">
                        <p className="text-xs text-primary-600 font-bold mb-1 uppercase tracking-tight">Observações:</p>
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
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary-200 transition-all"
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
                    {/* QR Code and States */}
                    <div className="w-full h-full flex items-center justify-center relative">
                      {isConnecting && !whatsappStatus?.qr && (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 size={40} className="animate-spin text-emerald-500" />
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Iniciando...</p>
                        </div>
                      )}

                      {!isConnecting && !whatsappStatus?.qr && (
                        <QrCode size={120} className="text-gray-200 group-hover:text-emerald-500 transition-colors" />
                      )}

                      {whatsappStatus?.qr && (
                        <img 
                          src={whatsappStatus.qr.startsWith('data:') ? whatsappStatus.qr : `data:image/png;base64,${whatsappStatus.qr}`} 
                          alt="WhatsApp QR Code" 
                          className={`w-full h-full object-contain p-2 ${isConnecting ? 'opacity-50' : 'opacity-100'}`}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      )}

                      {isConnecting && whatsappStatus?.qr && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 size={30} className="animate-spin text-emerald-500/50" />
                        </div>
                      )}
                    </div>

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
