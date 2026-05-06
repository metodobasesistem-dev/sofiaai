import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  MoreVertical, 
  Calendar, 
  Mail, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Sparkles,
  X,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { listProfessionals, upsertProfessional, deleteProfessional, type Professional } from '../services/supabaseService';
import { Skeleton, CardSkeleton } from './common/SkeletonLoader';
import { toast } from 'sonner';

export default function Professionals() {
  const [profs, setProfs] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  
  const [formData, setFormData] = useState<Partial<Professional>>({
    name: '',
    specialties: '',
    googleCalendarId: '',
    bio: '',
    isActive: true
  });

  const fetchData = async () => {
    const timeoutId = setTimeout(() => {
      setLoading(false);
      console.warn('[Professionals] Safety timeout reached (5s)');
    }, 5000);

    try {
      setLoading(true);
      const data = await listProfessionals();
      setProfs(data || []);
    } catch (error: any) {
      console.error('[Professionals] Failed to fetch:', error.message);
      toast.error('Erro de conexão ao carregar equipe.');
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return toast.error('Nome é obrigatório');

    try {
      setIsSaving(true);
      await upsertProfessional({
        ...formData,
        id: editingProf?.id
      });
      toast.success(editingProf ? 'Profissional atualizado!' : 'Profissional cadastrado!');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving professional:', error);
      toast.error('Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este profissional?')) return;
    try {
      await deleteProfessional(id);
      toast.success('Removido com sucesso.');
      fetchData();
    } catch (error) {
      toast.error('Erro ao deletar.');
    }
  };

  const handleEdit = (p: Professional) => {
    setEditingProf(p);
    setFormData({
      name: p.name,
      specialties: p.specialties,
      googleCalendarId: p.googleCalendarId,
      bio: p.bio,
      isActive: p.isActive
    });
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingProf(null);
    setFormData({
      name: '',
      specialties: '',
      googleCalendarId: '',
      bio: '',
      isActive: true
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Minha Equipe</h1>
          <p className="text-slate-500 font-medium mt-1">Gerencie os profissionais e suas agendas individuais.</p>
        </div>
        
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all"
        >
          <Plus size={18} />
          Adicionar Profissional
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : profs.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-3xl p-16 text-center max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
            <Users size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Comece sua equipe</h2>
          <p className="text-slate-500 mt-2 mb-8 font-medium italic">
            "Cadastre seus colaboradores para que a IA possa gerenciar agendamentos específicos para cada um."
          </p>
          <button 
            onClick={handleAddNew}
            className="px-8 py-3 bg-primary-600 text-white rounded-2xl font-bold text-sm hover:bg-primary-700 transition-all shadow-lg shadow-primary-100"
          >
            Cadastrar Primeiro Membro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profs.map((p) => (
            <motion.div 
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm group hover:shadow-md transition-all relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-black text-xl border border-slate-100">
                    {p.name[0]}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 leading-tight">{p.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      {p.isActive ? (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 tracking-wider">
                          <CheckCircle2 size={10} /> Disponível
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          <XCircle size={10} /> Inativo
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(p.id!)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Especialidades</p>
                  <div className="flex flex-wrap gap-2">
                    {p.specialties.split(',').map((s, i) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-100">
                        {s.trim()}
                      </span>
                    ))}
                  </div>
                </div>

                {p.googleCalendarId && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-primary-600 bg-primary-50 p-2 rounded-xl">
                    <Calendar size={14} /> Agenda Google Vinculada
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-0 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {editingProf ? 'Editar Profissional' : 'Novo Profissional'}
                  </h2>
                  <p className="text-slate-500 font-medium">Configure as competências e agenda.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">
                  <X />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nome Completo</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: João da Silva"
                    className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-600/10 focus:bg-white transition-all font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Especialidades (separadas por vírgula)</label>
                  <input 
                    type="text" 
                    value={formData.specialties}
                    onChange={e => setFormData({...formData, specialties: e.target.value})}
                    placeholder="Ex: Corte de Cabelo, Barba, Sobrancelha"
                    className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-600/10 focus:bg-white transition-all font-medium text-slate-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Calendar ID</label>
                    <a 
                      href="https://calendar.google.com/calendar/u/0/r/settings" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[9px] font-bold text-primary-600 hover:underline flex items-center gap-1"
                    >
                      Como achar o ID?
                    </a>
                  </div>
                  <input 
                    type="text" 
                    value={formData.googleCalendarId}
                    onChange={e => setFormData({...formData, googleCalendarId: e.target.value})}
                    placeholder="ex: barbeiro.joao@gmail.com ou ID secundário"
                    className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-600/10 focus:bg-white transition-all font-medium text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    * Use o e-mail do profissional ou o "ID da agenda" nas configurações do Google Calendar. 
                    Se vazio, usará a agenda principal.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bio / Descrição rápida (IA usará isso para vender o profissional)</label>
                  <textarea 
                    rows={3}
                    value={formData.bio}
                    onChange={e => setFormData({...formData, bio: e.target.value})}
                    placeholder="Ex: Especialista em cortes clássicos com mais de 10 anos de experiência..."
                    className="w-full px-5 py-4 bg-slate-50 rounded-2xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-600/10 focus:bg-white transition-all font-medium text-slate-900 resize-none"
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="flex-1 px-8 py-4 bg-primary-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-primary-100 hover:bg-primary-700 transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                    {editingProf ? 'Salvar Alterações' : 'Finalizar Cadastro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
