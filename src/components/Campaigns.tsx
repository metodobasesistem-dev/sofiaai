import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Send, 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  Info,
  Users,
  Layout,
  BarChart3,
  Sparkles,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Skeleton } from './common/SkeletonLoader';

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: 'pending' | 'sending' | 'completed' | 'failed';
  total_contacts: number;
  sent_count: number;
  error_count: number;
  created_at: string;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch Campaigns
  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar campanhas: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100"><CheckCircle2 size={12}/> Concluído</span>;
      case 'sending':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100 animate-pulse"><Zap size={12}/> Enviando...</span>;
      case 'pending':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-600 text-xs font-bold border border-amber-100"><Clock size={12}/> Pendente</span>;
      case 'failed':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100"><AlertCircle size={12}/> Falhou</span>;
      default:
        return <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-500 text-xs font-bold border border-gray-100">{status}</span>;
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
           <Send size={120} className="-rotate-12" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-50 text-primary-600 rounded-xl">
              <Send size={24} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Campanhas Oficiais</h1>
          </div>
          <p className="text-slate-500 max-w-md">
            Dispare mensagens em massa utilizando modelos aprovados pela Meta com segurança e alta taxa de entrega.
          </p>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="relative z-10 flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 group"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          Nova Campanha
        </button>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-4">
        <div className="p-2 bg-white rounded-xl text-amber-600 shadow-sm shrink-0">
          <Info size={20} />
        </div>
        <div className="text-sm text-amber-900 leading-relaxed">
          <p className="font-black uppercase tracking-wider text-[10px] mb-1">Compliance e Segurança</p>
          <p>Para evitar bloqueios, o disparo oficial só permite o uso de **Modelos (Templates)** previamente aprovados pela Meta. Mensagens fora de padrão não serão enviadas.</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Pesquisar campanhas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/5 transition-all text-sm font-medium"
          />
        </div>
      </div>

      {/* Campaigns List */}
      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />
          ))
        ) : campaigns.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
              <Send size={40} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Nenhuma campanha criada</h2>
            <p className="text-slate-500 max-w-sm">Você ainda não realizou nenhum disparo oficial. Clique em "Nova Campanha" para começar.</p>
          </div>
        ) : (
          campaigns.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map((campaign) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={campaign.id}
              className="group bg-white p-6 rounded-2xl border border-slate-100 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-500/5 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border ${
                    campaign.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                    campaign.status === 'failed' ? 'bg-red-50 text-red-600 border-red-100' :
                    'bg-slate-50 text-slate-600 border-slate-100'
                  }`}>
                    <Layout size={24} />
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-900 truncate">{campaign.name}</h3>
                      {getStatusBadge(campaign.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                      <span className="flex items-center gap-1"><Sparkles size={14}/> Template: {campaign.template_name}</span>
                      <span className="flex items-center gap-1"><Users size={14}/> {campaign.total_contacts} contatos</span>
                      <span className="flex items-center gap-1"><Clock size={14}/> {new Date(campaign.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  {/* Stats Mini */}
                  <div className="hidden md:flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Enviadas</p>
                      <p className="text-lg font-black text-slate-900 tabular-nums">{campaign.sent_count}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Erros</p>
                      <p className={`text-lg font-black tabular-nums ${campaign.error_count > 0 ? 'text-red-500' : 'text-slate-900'}`}>{campaign.error_count}</p>
                    </div>
                  </div>

                  <div className="p-2 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all">
                    <ChevronRight size={24} />
                  </div>
                </div>
              </div>

              {/* Progress Bar for active campaigns */}
              {campaign.status === 'sending' && (
                <div className="mt-6 pt-6 border-t border-slate-50">
                   <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                     <span>Progresso do Disparo</span>
                     <span>{Math.round((campaign.sent_count / campaign.total_contacts) * 100)}%</span>
                   </div>
                   <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(campaign.sent_count / campaign.total_contacts) * 100}%` }}
                        className="h-full bg-primary-500"
                     />
                   </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Modal - New Campaign (Placeholder for step 2) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-50 text-primary-600 rounded-xl">
                      <Plus size={20} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Nova Campanha</h2>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <Trash2 size={20} />
                  </button>
                </div>
                <p className="text-slate-500 text-sm">Siga os passos para configurar seu disparo oficial via Meta.</p>
              </div>

              <div className="p-10 text-center">
                 <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-6">
                    <BarChart3 size={40} />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-2">Módulo em Construção</h3>
                 <p className="text-slate-500 mb-8">Estamos finalizando a interface de seleção de público e templates aprovados.</p>
                 <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                 >
                   Fechar
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
