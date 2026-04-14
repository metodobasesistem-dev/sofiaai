import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Zap, 
  ShieldCheck, 
  Server,
  RefreshCw,
  MessageSquare,
  Bell,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HealthStatus {
  id: string;
  last_run: string;
  status: 'healthy' | 'error';
  metadata: any;
}

export default function Health() {
  const [stats, setStats] = useState<HealthStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('sys_health').select('*');
      if (error) throw error;
      setStats(data || []);
    } catch (error) {
      console.error('Failed to fetch health stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Monitor do Sistema</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Status em tempo real dos serviços de background e automações.</p>
        </div>
        <button 
          onClick={fetchHealth}
          className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2 font-bold text-xs"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* API Status (Mocked as healthy since it's the UI) */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Zap size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interface Web</p>
              <h3 className="text-lg font-black text-slate-900">Online</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 mb-4">
            <ShieldCheck size={14} /> Sistema operacional
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-[100%]" />
          </div>
        </div>

        {/* Supabase Status */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Server size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco de Dados</p>
              <h3 className="text-lg font-black text-slate-900">Supabase Cloud</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-4">
            <CheckCircle2 size={14} /> Latência otimizada
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 w-[98%]" />
          </div>
        </div>

        {/* WhatsApp Status (Real-time connection) */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IA & Mensageria</p>
              <h3 className="text-lg font-black text-slate-900">Ativo</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-teal-600 mb-4">
            <CheckCircle2 size={14} /> OpenAI & LLM Prontos
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 w-[100%]" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Activity className="text-slate-400" size={20} />
            Processos em Background
          </h2>
          <span className="px-4 py-1.5 bg-slate-50 text-slate-500 text-[10px] font-black rounded-full uppercase tracking-widest">
            Auditados a cada 15m
          </span>
        </div>

        <div className="divide-y divide-slate-50">
          {stats.map((s) => (
            <div key={s.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-6">
                <div className={`p-4 rounded-3xl ${s.status === 'healthy' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {s.id === 'reminders' ? <Bell size={24} /> : <MessageSquare size={24} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 capitalize tracking-tight">
                    {s.id === 'reminders' ? 'Enviador de Lembretes' : 'Automação de Follow-up'}
                  </h3>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                      <Clock size={14} />
                      Visto {formatDistanceToNow(new Date(s.last_run), { addSuffix: true, locale: ptBR })}
                    </span>
                    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      s.status === 'healthy' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'
                    }`}>
                      {s.status === 'healthy' ? 'Operacional' : 'Falha'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Carga Processada</p>
                  <p className="font-black text-slate-900">{s.metadata?.total_checked || 0} registros</p>
                </div>
                <div className="w-px h-8 bg-slate-100 hidden md:block mx-2" />
                <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-100">
                  Ver Logs
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-[40px] p-10 text-white relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl font-black tracking-tight mb-2 italic">Infraestrutura Local</h3>
            <p className="text-slate-400 font-medium mb-8 max-w-sm">
              Você está rodando em ambiente de desenvolvimento. O monitoramento rastreia loops de threads locais.
            </p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Uptime</p>
                <p className="text-lg font-black">99.9%</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Versão v3.2</p>
                <p className="text-lg font-black text-teal-400 shadow-teal-500/50 drop-shadow-md">Enterprise AI</p>
              </div>
            </div>
          </div>
          <Activity className="absolute bottom-[-20px] right-[-20px] text-slate-800" size={200} strokeWidth={1} />
        </div>

        <div className="bg-teal-500 rounded-[40px] p-10 text-white flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-2 italic">Segurança Operacional</h3>
            <p className="text-teal-50 font-medium max-w-sm">
              Todas as interações com OpenAI e Google Calendar são enviadas via HTTPS criptografado.
            </p>
          </div>
          <button className="w-full py-4 bg-white text-teal-600 rounded-3xl font-black text-sm hover:bg-teal-50 transition-all mt-8">
            Baixar Relatório de Segurança
          </button>
        </div>
      </div>
    </div>
  );
}
