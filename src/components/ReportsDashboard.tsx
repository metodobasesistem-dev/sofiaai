import React from 'react';
import { BarChart3, TrendingUp, Users, Clock, MessageSquare, ArrowUpRight, Target } from 'lucide-react';
import { motion } from 'motion/react';

export default function ReportsDashboard() {
  const kpis = [
    { title: 'Total de Atendimentos', value: '1,248', change: '+12%', icon: <MessageSquare size={20} />, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Tempo Médio Resposta', value: '4m 32s', change: '-18%', icon: <Clock size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Conversão de Leads', value: '28.4%', change: '+4.2%', icon: <TrendingUp size={20} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { title: 'Tickets Resolvidos', value: '892', change: '+22%', icon: <Target size={20} />, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/50 overflow-y-auto">
      {/* Header */}
      <div className="p-6 md:p-8 border-b border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <BarChart3 className="text-blue-600" />
            Relatórios e Métricas
          </h1>
          <p className="text-gray-500 text-sm mt-1">Acompanhe o desempenho do atendimento e conversões.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {['Hoje', '7 Dias', '30 Dias', 'Este Mês'].map((period, i) => (
            <button 
              key={period}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${i === 2 ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {kpis.map((kpi, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={i} 
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${kpi.bg} ${kpi.color}`}>
                  {kpi.icon}
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                  <ArrowUpRight size={12} /> {kpi.change}
                </div>
              </div>
              <h3 className="text-3xl font-black text-gray-900 mb-1">{kpi.value}</h3>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{kpi.title}</p>
              <div className="absolute -bottom-4 -right-4 text-gray-50/50 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                {React.cloneElement(kpi.icon as React.ReactElement, { size: 100 })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Placeholder para Gráficos (Futura Integração Recharts) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col h-[400px]">
             <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6">Volume de Atendimento (Mensagens)</h3>
             <div className="flex-1 border-2 border-dashed border-gray-100 rounded-xl flex items-center justify-center bg-gray-50/50">
               <div className="text-center">
                 <BarChart3 size={32} className="text-gray-300 mx-auto mb-3" />
                 <p className="text-gray-400 font-medium text-sm">Gráfico de Volume de Mensagens</p>
                 <p className="text-gray-400 text-xs mt-1">O Recharts será integrado aqui na próxima fase.</p>
               </div>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col h-[400px]">
             <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-6">Status dos Tickets</h3>
             <div className="flex-1 border-2 border-dashed border-gray-100 rounded-xl flex items-center justify-center bg-gray-50/50">
               <div className="text-center">
                 <Target size={32} className="text-gray-300 mx-auto mb-3" />
                 <p className="text-gray-400 font-medium text-sm">Gráfico de Pizza (Aberto/Resolvido)</p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
