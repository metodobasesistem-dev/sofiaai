import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Zap, 
  MessageSquare, 
  Bot, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Server,
  ArrowUpRight,
  ArrowDownRight,
  History,
  HardDrive,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { format, subHours, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface HealthStatus {
  id: string;
  status: 'healthy' | 'error';
  last_run: string;
  metadata?: any;
}

const StatusCard = ({ id, label, icon: Icon, status, metadata }: { id: string, label: string, icon: any, status?: 'healthy' | 'error', metadata?: any }) => {
  const isHealthy = status === 'healthy';
  const latency = metadata?.latency_ms || metadata?.latency || null;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${isHealthy ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} transition-colors`}>
          <Icon size={20} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className={`text-[10px] font-black uppercase tracking-wider ${isHealthy ? 'text-emerald-600' : 'text-red-600'}`}>
            {isHealthy ? 'Operacional' : 'Falha'}
          </span>
        </div>
      </div>
      
      <div className="mt-4">
        <h4 className="text-sm font-bold text-slate-900">{label}</h4>
        <div className="flex items-baseline gap-2 mt-1">
          {latency && (
            <span className="text-xs font-medium text-slate-400">{latency}ms</span>
          )}
          {!latency && metadata?.usedMemory && (
            <span className="text-xs font-medium text-slate-400">{metadata.usedMemory} de RAM</span>
          )}
        </div>
      </div>

      {metadata?.queues && (
        <div className="mt-3 pt-3 border-t border-slate-50 grid grid-cols-2 gap-2">
          {Object.entries(metadata.queues).map(([name, count]: [string, any]) => (
            <div key={name} className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase font-bold truncate">{name.replace('_queue', '')}</span>
              <span className="text-xs font-black text-slate-700">{count} jobs</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default function Overview() {
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    total24h: 0,
    ia24h: 0,
    human24h: 0,
    resolved24h: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 1. Health Status
        const { data: healthData } = await supabase.from('sys_health').select('*');
        setHealth(healthData || []);

        // 2. Metrics (Last 24h)
        const yesterday = subHours(new Date(), 24).toISOString();
        
        const { count: totalMsg } = await supabase.from('messages').select('*', { count: 'exact', head: true }).gt('created_at', yesterday);
        const { count: iaMsg } = await supabase.from('messages').select('*', { count: 'exact', head: true }).gt('created_at', yesterday).eq('role', 'assistant');
        const { count: humanMsg } = await supabase.from('messages').select('*', { count: 'exact', head: true }).gt('created_at', yesterday).eq('role', 'user');

        setMetrics({
          total24h: totalMsg || 0,
          ia24h: iaMsg || 0,
          human24h: humanMsg || 0,
          resolved24h: 0 // Mock for now
        });

        // 3. Incident History
        const { data: historyData } = await supabase
          .from('sys_health_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        setHistory(historyData || []);

        // 4. Chart Data (Mocking until real aggregation route is ready)
        const mockChart = Array.from({ length: 24 }).map((_, i) => {
          const hour = subHours(new Date(), 23 - i);
          return {
            time: format(hour, 'HH:mm'),
            ia: Math.floor(Math.random() * 50),
            human: Math.floor(Math.random() * 30)
          };
        });
        setChartData(mockChart);

      } catch (err) {
        console.error('Error fetching overview data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to realtime health updates
    const channel = supabase
      .channel('sys_health_overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sys_health' }, (payload) => {
        setHealth(prev => {
          const index = prev.findIndex(h => h.id === (payload.new as any).id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = payload.new as HealthStatus;
            return next;
          }
          return [...prev, payload.new as HealthStatus];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getServiceStatus = (id: string) => health.find(h => h.id === id);
  const globalStatus = health.some(h => h.status === 'error') ? 'DEGRADADO' : 'OPERACIONAL';

  return (
    <div className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Visão Geral 
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${globalStatus === 'OPERACIONAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} flex items-center gap-1.5`}>
              <div className={`w-1.5 h-1.5 rounded-full ${globalStatus === 'OPERACIONAL' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {globalStatus}
            </div>
          </h1>
          <p className="text-slate-500 font-medium mt-1">Torre de controle e clareza operacional do WppAI.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
          <button className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs shadow-lg shadow-slate-200">24 Horas</button>
          <button className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl font-bold text-xs transition-all">7 Dias</button>
        </div>
      </div>

      {/* Live Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatusCard id="database" label="Supabase DB" icon={Database} status={getServiceStatus('database')?.status} metadata={getServiceStatus('database')?.metadata} />
        <StatusCard id="redis" label="Redis / Filas" icon={HardDrive} status={getServiceStatus('redis')?.status} metadata={getServiceStatus('redis')?.metadata} />
        <StatusCard id="reminders" label="Lembretes" icon={Clock} status={getServiceStatus('reminders')?.status} metadata={getServiceStatus('reminders')?.metadata} />
        <StatusCard id="follow_ups" label="Follow-ups" icon={Zap} status={getServiceStatus('follow_ups')?.status} metadata={getServiceStatus('follow_ups')?.metadata} />
        <StatusCard id="server_core" label="Core API" icon={Server} status={getServiceStatus('server_core')?.status} metadata={getServiceStatus('server_core')?.metadata} />
        <StatusCard id="whatsapp" label="WhatsApp" icon={MessageSquare} status={getServiceStatus('whatsapp')?.status} metadata={getServiceStatus('whatsapp')?.metadata} />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Mensagens Total', value: metrics.total24h, icon: MessageSquare, color: 'blue' },
          { label: 'Atendimento IA', value: metrics.ia24h, icon: Bot, color: 'purple' },
          { label: 'Interação Humana', value: metrics.human24h, icon: Activity, color: 'emerald' },
          { label: 'Conversas Ativas', value: 12, icon: Zap, color: 'amber' },
        ].map((m, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className={`w-12 h-12 rounded-2xl bg-${m.color}-50 text-${m.color}-600 flex items-center justify-center mb-4`}>
              <m.icon size={24} />
            </div>
            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{m.value}</h3>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">{m.label}</p>
            <div className={`absolute -right-4 -bottom-4 text-${m.color}-500/5 group-hover:scale-110 transition-transform`}>
              <m.icon size={100} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Pulso de Tráfego</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Volume de mensagens por hora</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[10px] font-bold text-slate-600 uppercase">IA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-slate-600 uppercase">Humano</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
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
                  dataKey="time" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                  interval={3}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="ia" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorIA)" />
                <Area type="monotone" dataKey="human" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorHuman)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Timeline of Incidents */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Timeline</h3>
            <History size={20} className="text-slate-400" />
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <CheckCircle2 size={40} className="text-emerald-500 mb-4 opacity-20" />
                <p className="text-sm font-bold text-slate-400">Nenhum incidente nos últimos 7 dias</p>
              </div>
            ) : (
              history.map((h, i) => (
                <div key={i} className="flex gap-4 relative">
                  {i !== history.length - 1 && <div className="absolute left-2.5 top-6 bottom-0 w-px bg-slate-100" />}
                  <div className={`w-5 h-5 rounded-full z-10 flex items-center justify-center ${h.status === 'error' ? 'bg-red-500 shadow-lg shadow-red-200' : 'bg-emerald-500 shadow-lg shadow-emerald-200'}`}>
                    {h.status === 'error' ? <AlertTriangle size={10} className="text-white" /> : <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">{h.service_id}</h4>
                      <span className="text-[9px] font-bold text-slate-400">{format(parseISO(h.created_at), 'HH:mm')}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                      {h.status === 'error' ? 'Falha detectada' : 'Serviço recuperado'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <button className="w-full py-3 mt-6 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
            Ver Logs Completos
          </button>
        </div>
      </div>
    </div>
  );
}
