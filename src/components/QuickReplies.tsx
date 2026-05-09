import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Save, 
  Loader2,
  Search,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { listQuickReplies, createQuickReply, deleteQuickReply, type QuickReply } from '../services/supabaseService';
import { motion, AnimatePresence } from 'motion/react';

export default function QuickReplies() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newReply, setNewReply] = useState({ title: '', content: '' });

  useEffect(() => {
    fetchReplies();
  }, []);

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const data = await listQuickReplies();
      setReplies(data);
    } catch (err) {
      toast.error('Erro ao carregar respostas rápidas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newReply.title || !newReply.content) {
      toast.error('Preencha o título e o conteúdo');
      return;
    }

    setIsSaving(true);
    try {
      await createQuickReply(newReply.title, newReply.content);
      toast.success('Resposta rápida criada!');
      setNewReply({ title: '', content: '' });
      fetchReplies();
    } catch (err) {
      toast.error('Erro ao criar resposta rápida');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta resposta rápida?')) return;
    try {
      await deleteQuickReply(id);
      toast.success('Excluída com sucesso');
      fetchReplies();
    } catch (err) {
      toast.error('Erro ao excluir');
    }
  };

  const filteredReplies = replies.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Respostas Rápidas</h2>
          <p className="text-sm text-slate-500 mt-1">Gerencie seus modelos de mensagem para ganhar tempo no atendimento.</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Pesquisar atalhos..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full md:w-64 pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Criação */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm sticky top-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                <Plus size={20} />
              </div>
              <h3 className="font-bold text-slate-900">Novo Atalho</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título do Botão</label>
                <input 
                  type="text"
                  placeholder="Ex: Saudação"
                  value={newReply.title}
                  onChange={e => setNewReply({ ...newReply, title: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-primary-500/10 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mensagem Completa</label>
                <textarea 
                  rows={4}
                  placeholder="Olá! Como posso ajudar você hoje?"
                  value={newReply.content}
                  onChange={e => setNewReply({ ...newReply, content: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-primary-500/10 outline-none transition-all resize-none"
                />
              </div>

              <button 
                onClick={handleCreate}
                disabled={isSaving}
                className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary-500/20 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar Atalho
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Respostas */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 size={40} className="animate-spin mb-4" />
              <p className="text-sm font-medium">Carregando seus atalhos...</p>
            </div>
          ) : filteredReplies.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                <MessageSquare size={32} className="text-slate-200" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">Nenhum atalho encontrado</h4>
              <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">Crie seu primeiro modelo de resposta para agilizar seu trabalho.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredReplies.map((reply) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={reply.id}
                    className="bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-primary-200 transition-all shadow-sm group relative"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary-500" />
                        <h4 className="font-black text-slate-900 text-[13px] uppercase tracking-wider">{reply.title}</h4>
                      </div>
                      <button 
                        onClick={() => handleDelete(reply.id!)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      {reply.content}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Zap size={12} className="text-amber-500" />
                      Atalho pronto para uso no chat
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
