import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Clock, 
  MessageSquare, 
  ArrowUpRight, 
  Target,
  Loader2,
  PieChart as PieIcon,
  Activity,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { getDashboardStats, getReportsHistory } from '../services/supabaseService';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function ReportsDashboard() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [stats, setStats] = useState({ 
    contacts: 0, 
    appointments: 0, 
    messages: 0, 
    qualified: 0, 
    conversionRate: 0 
  });
  const [history, setHistory] = useState<any[]>([]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [s, h] = await Promise.all([
        getDashboardStats(),
        getReportsHistory(period)
      ]);
      setStats(s as any);
      setHistory(h);
    } catch (err) {
      console.error('[Reports] Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [period]);

  const funnelData = useMemo(() => [
    { name: 'Leads', value: Math.max(0, stats.contacts - stats.qualified - stats.appointments), color: '#3b82f6' },
    { name: 'Qualificados', value: stats.qualified, color: '#f59e0b' },
    { name: 'Convertidos', value: stats.appointments, color: '#10b981' },
  ].filter(d => d.value > 0), [stats]);

  const kpis = [
    { 
      title: 'Mensagens Total', 
      value: stats.messages.toLocaleString(), 
      change: '+12%', 
      icon: <MessageSquare size={20} />, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      desc: 'Fluxo total de interações'
    },
    { 
      title: 'Tempo Médio Resposta', 
      value: (stats as any).avgResponseTime || '1m 45s', 
      change: '-18%', 
      icon: <Clock size={20} />, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50',
      desc: 'Tempo médio Sofia/Equipe'
    },
    { 
      title: 'Conversão de Leads', 
      value: `${stats.conversionRate}%`, 
      change: '+4.2%', 
      icon: <TrendingUp size={20} />, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-50',
      desc: 'Leads → Clientes'
    },
    { 
      title: 'Contatos Totais', 
      value: stats.contacts.toLocaleString(), 
      change: '+22%', 
      icon: <Users size={20} />, 
      color: 'text-amber-600', 
      bg: 'bg-amber-50',
      desc: 'Base de leads ativa'
    },
  ];

  if (loading && history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50/50">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Carregando métricas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/30 overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="p-6 md:p-8 border-b border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
            <BarChart3 className="text-blue-600" />
            Relatórios e Métricas
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Acompanhe a inteligência e conversão do seu atendimento.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
          {[
            { label: '7 Dias', val: 7 },
            { label: '30 Dias', val: 30 },
            { label: '90 Dias', val: 90 }
          ].map((item) => (
            <button 
              key={item.val}
              onClick={() => setPeriod(item.val)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${period === item.val ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {kpis.map((kpi, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              key={i} 
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${kpi.bg} ${kpi.color} group-hover:scale-110 transition-transform`}>
                  {kpi.icon}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <ArrowUpRight size={10} /> {kpi.change}
                </div>
              </div>
              <h3 className="text-3xl font-black text-gray-900 mb-1 tracking-tighter">{kpi.value}</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{kpi.title}</p>
              <p className="text-[10px] text-gray-300 font-medium mt-2">{kpi.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Traffic Chart */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-8 flex flex-col h-[450px]">
             <div className="flex items-center justify-between mb-8">
               <div>
                 <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                   <Activity size={18} className="text-blue-500" />
                   Volume de Atendimento
                 </h3>
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Interações Sofia vs Humano</p>
               </div>
               <div className="flex gap-4">
                 <div className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-full bg-blue-500" />
                   <span className="text-[10px] font-bold text-gray-500 uppercase">Sofia (IA)</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-full bg-emerald-500" />
                   <span className="text-[10px] font-bold text-gray-500 uppercase">Humano</span>
                 </div>
               </div>
             </div>

             <div className="flex-1 w-full">
               {history.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <defs>
                       <linearGradient id="colorIA" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                         <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                       </linearGradient>
                       <linearGradient id="colorHuman" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                         <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <XAxis 
                       dataKey="name" 
                       axisLine={false} tickLine={false} 
                       tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                       tickFormatter={(str) => format(parseISO(str), 'dd/MM')}
                       dy={10}
                     />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                     <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                        labelFormatter={(str) => format(parseISO(str), 'dd MMMM yyyy', { locale: ptBR })}
                     />
                     <Area type="monotone" dataKey="ia" name="Sofia (IA)" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorIA)" />
                     <Area type="monotone" dataKey="humano" name="Humano" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorHuman)" />
                   </AreaChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-gray-300">
                   <Activity size={40} className="mb-2 opacity-20" />
                   <p className="text-sm font-bold">Sem dados para este período</p>
                 </div>
               )}
             </div>
          </div>

          {/* Funnel Chart */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 flex flex-col h-[450px]">
             <div className="mb-8">
               <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                 <PieIcon size={18} className="text-indigo-500" />
                 Saúde do CRM
               </h3>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Distribuição de contatos</p>
             </div>

             <div className="flex-1 w-full relative">
               {funnelData.length > 0 ? (
                 <>
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie
                         data={funnelData}
                         innerRadius={80}
                         outerRadius={110}
                         paddingAngle={8}
                         dataKey="value"
                       >
                         {funnelData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                         ))}
                       </Pie>
                       <Tooltip 
                         contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                       />
                     </PieChart>
                   </ResponsiveContainer>
                   <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-3xl font-black text-gray-900 tracking-tighter">{stats.contacts}</span>
                     <span className="text-[10px] font-bold text-gray-400 uppercase">Contatos</span>
                   </div>
                 </>
               ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-300">
                  <PieIcon size={40} className="mb-2 opacity-20" />
                  <p className="text-sm font-bold">Base vazia</p>
                </div>
               )}
             </div>

             <div className="mt-6 space-y-2">
               {funnelData.map((item, i) => (
                 <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                   <div className="flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                     <span className="text-[11px] font-black text-gray-600 uppercase tracking-wider">{item.name}</span>
                   </div>
                   <span className="text-xs font-black text-gray-900">{item.value}</span>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Value Prop Banner */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }}
          className="bg-indigo-600 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
        >
          <div className="relative z-10">
            <h3 className="text-2xl font-black tracking-tight mb-2">Performance de Automação Sofia</h3>
            <p className="text-indigo-100 font-medium max-w-md">
              Sua inteligência artificial está processando uma parcela significativa do volume total de atendimento de forma autônoma.
            </p>
          </div>
          <div className="flex gap-4 relative z-10">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 text-center min-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-1">Horas Poupadas</p>
              <p className="text-2xl font-black">~{Math.round(stats.messages * 0.05)}h</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 text-center min-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-1">Eficiência IA</p>
              <p className="text-2xl font-black">Alta</p>
            </div>
          </div>
          <div className="absolute -right-20 -top-20 opacity-10">
            <Zap size={300} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
