import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar, 
  Zap, 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  Download,
  Calendar as CalendarIcon,
  ChevronDown,
  Loader2,
  Trophy,
  Activity,
  Target
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
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getDashboardStats, getDashboardGrowth } from '../services/supabaseService';

const ReportCard = ({ children, title, subtitle, icon: Icon }: { children: React.ReactNode, title: string, subtitle?: string, icon?: any }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
    <div className="flex items-center justify-between mb-8">
      <div>
        <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{subtitle}</p>}
      </div>
      {Icon && (
        <div className="p-2.5 bg-slate-50 rounded-xl text-slate-400">
          <Icon size={20} />
        </div>
      )}
    </div>
    {children}
  </div>
);

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    contacts: 0, 
    appointments: 0, 
    qualified: 0, 
    conversionRate: 0, 
    avgScore: 0 
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const s = await getDashboardStats();
        setStats(s as any);

        // Fetch real historical data for the chart
        const growthData = await getDashboardGrowth();
        
        const data = growthData.map((d: any) => ({
          name: format(new Date(d.date + 'T12:00:00'), 'dd MMM', { locale: ptBR }),
          leads: d.leads || 0,
          agendamentos: d.resolvidos || d.agendamentos || 0
        }));
        
        setChartData(data);
      } catch (error) {
        console.error('Failed to fetch report stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 size={40} className="animate-spin text-blue-600" />
      </div>
    );
  }

  const funnelData = [
    { name: 'Leads Totais', value: stats.contacts, color: '#3b82f6' },
    { name: 'Qualificados', value: stats.qualified, color: '#a855f7' },
    { name: 'Agendamentos', value: stats.appointments, color: '#10b981' }
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Relatórios Analíticos</h1>
          <p className="text-slate-500 font-medium mt-1">Visão profunda da performance da sua assistente IA.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            <Download size={16} /> Exportar CSV
          </button>
          <button className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2">
            <CalendarIcon size={16} /> Últimos 30 dias <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Taxa de Conversão', value: `${stats.conversionRate}%`, icon: Target, color: 'blue', desc: 'Leads → Agenda' },
          { label: 'Score Médio', value: stats.avgScore, icon: Trophy, color: 'amber', desc: 'Qualidade dos Leads' },
          { label: 'Leads Qualificados', value: stats.qualified, icon: Sparkles, color: 'purple', desc: 'Score maior que 7' },
          { label: 'Custo por Agendamento', value: 'R$ 0,00', icon: Activity, color: 'emerald', desc: 'Economia com IA' },
        ].map((item, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm group hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2.5 rounded-xl bg-${item.color}-50 text-${item.color}-600 group-hover:bg-${item.color}-600 group-hover:text-white transition-all`}>
                <item.icon size={20} />
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">
                <TrendingUp size={10} /> +0%
              </div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{item.value}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.label}</p>
            <p className="text-[10px] text-slate-300 font-medium mt-2">{item.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Funnel Chart */}
        <div className="lg:col-span-1">
          <ReportCard title="Funil de Conversão" subtitle="Jornada do Cliente" icon={Filter}>
            <div className="h-[350px] w-full py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ left: -20, right: 40 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl">
                            {payload[0].value} {payload[0].name}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={40}>
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-3 mt-4">
              {funnelData.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {item.value}
                    {i > 0 && stats.contacts > 0 && (
                      <span className="ml-2 text-[10px] text-slate-400 font-bold">
                        ({Math.round((item.value / stats.contacts) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ReportCard>
        </div>

        {/* Growth Chart */}
        <div className="lg:col-span-2">
          <ReportCard title="Crescimento da Operação" subtitle="Performance Diária (Últimos 15 dias)" icon={TrendingUp}>
            <div className="h-[430px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLeadsReport" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSchedReport" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
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
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="leads" 
                    name="Leads"
                    stroke="#3b82f6" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorLeadsReport)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="agendamentos" 
                    name="Agendamentos"
                    stroke="#10b981" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorSchedReport)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>
        </div>
      </div>

      {/* Bottom Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportCard title="Distribuição de Qualidade" subtitle="Nível de Interesse dos Leads" icon={Sparkles}>
          <div className="flex items-center justify-center h-[200px] gap-12">
            <div className="text-center">
              <div className="text-4xl font-black text-blue-600 mb-1">{stats.contacts}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Leads Totais</div>
            </div>
            <div className="w-px h-12 bg-slate-100" />
            <div className="text-center">
              <div className="text-4xl font-black text-purple-600 mb-1">{stats.qualified}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qualificados</div>
            </div>
            <div className="w-px h-12 bg-slate-100" />
            <div className="text-center">
              <div className="text-4xl font-black text-emerald-600 mb-1">{stats.appointments}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agendados</div>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 italic text-xs text-slate-500 text-center">
            "Sua IA está qualificando aproximadamente {stats.contacts > 0 ? Math.round((stats.qualified / stats.contacts) * 100) : 0}% dos leads que entram em contato."
          </div>
        </ReportCard>

        <ReportCard title="Próximas Metas" subtitle="Objetivos de Conversão" icon={Zap}>
          <div className="space-y-6 py-2">
            <div>
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-slate-600">Alcançar 20% de Conversão</span>
                <span className="text-blue-600">{stats.conversionRate}% / 20%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-1000" 
                  style={{ width: `${Math.min(100, (stats.conversionRate / 20) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-slate-600">Melhorar Qualidade da Base (Score 8.0)</span>
                <span className="text-purple-600">{stats.avgScore} / 8.0</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-1000" 
                  style={{ width: `${Math.min(100, (Number(stats.avgScore) / 8) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </ReportCard>
      </div>
    </div>
  );
}
