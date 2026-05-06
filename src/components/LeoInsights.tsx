import React from 'react';
import { 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Eye, 
  MousePointer2,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  ResponsiveContainer, 
  Tooltip
} from 'recharts';
import { motion } from 'motion/react';

interface InsightCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  data: any[];
  dataKey: string;
  color: string;
  delay?: number;
}

const InsightCard = ({ title, value, change, icon, data, dataKey, color, delay = 0 }: InsightCardProps) => {
  const isPositive = change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card glass-card-hover rounded-3xl p-6 flex flex-col h-[200px] relative overflow-hidden group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2 relative z-10">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</span>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{value}</h3>
            <span className={`flex items-center text-[10px] font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(change)}%
            </span>
          </div>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 group-hover:scale-110 transition-transform duration-500`}>
          {icon}
        </div>
      </div>

      {/* Chart Area */}
      <div className="absolute inset-0 top-24 -bottom-2 -left-1 -right-1 z-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Tooltip 
              contentStyle={{ 
                borderRadius: '16px', 
                border: 'none', 
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
              labelStyle={{ display: 'none' }}
            />
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={3}
              fillOpacity={1} 
              fill={`url(#gradient-${dataKey})`} 
              animationDuration={2000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default function LeoInsights({ insights }: { insights: any }) {
  if (!insights || !insights.metrics || insights.metrics.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-[200px] bg-slate-50 rounded-3xl animate-pulse border border-slate-100"></div>
        ))}
      </div>
    );
  }

  const { metrics, summary } = insights;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <InsightCard 
          title="Alcance (Reach)"
          value={summary.today_reach?.toLocaleString() || '0'}
          change={12.5} // Simulado ou calculado
          icon={<Eye size={20} />}
          data={metrics}
          dataKey="alcance"
          color="#8b5cf6"
          delay={0.1}
        />
        
        <InsightCard 
          title="Visitas ao Perfil"
          value={metrics[metrics.length - 1]?.visitas?.toLocaleString() || '0'}
          change={8.2}
          icon={<TrendingUp size={20} />}
          data={metrics}
          dataKey="visitas"
          color="#ec4899"
          delay={0.2}
        />

        <InsightCard 
          title="Comentários Lidos"
          value={summary.total_comentarios?.toLocaleString() || '0'}
          change={15.3}
          icon={<MessageCircle size={20} />}
          data={metrics}
          dataKey="comentarios"
          color="#06b6d4"
          delay={0.3}
        />

        <InsightCard 
          title="Directs Enviados (Leo)"
          value={summary.total_dms?.toLocaleString() || '0'}
          change={22.1}
          icon={<ArrowUpRight size={20} />}
          data={metrics}
          dataKey="dms"
          color="#10b981"
          delay={0.4}
        />

        <InsightCard 
          title="Cliques no Link"
          value="856"
          change={100}
          icon={<MousePointer2 size={20} />}
          data={metrics}
          dataKey="cliques"
          color="#f59e0b"
          delay={0.5}
        />

        <InsightCard 
          title="Novos Seguidores"
          value="339"
          change={4.2}
          icon={<Users size={20} />}
          data={metrics}
          dataKey="seguidores"
          color="#3b82f6"
          delay={0.6}
        />
      </div>
    </div>
  );
}
