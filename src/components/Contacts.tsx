import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Filter, 
  Download, 
  RefreshCw, 
  ChevronRight, 
  MoreVertical,
  Phone,
  Calendar,
  UserPlus,
  Trash2,
  Edit2,
  X,
  Loader2,
  Star,
  CheckCircle2,
  Clock,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
// ── Helpers ──
const formatPhone = (phone: string) => {
  if (!phone) return '—';
  const p = phone.replace(/\D/g, '');
  if (p.length === 13) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,9)}-${p.slice(9)}`;
  if (p.length === 12) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,8)}-${p.slice(8)}`;
  if (p.length === 11) return `(${p.slice(0,2)}) ${p.slice(2,7)}-${p.slice(7)}`;
  return phone;
};

const formatDate = (date: any): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatRelative = (date: any): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';

  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora mesmo';
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days}d atrás`;
  return formatDate(date);
};
import { syncContacts } from '../services/whatsappService';
import { listContacts, deleteContact, updateContactFunilStatus } from '../services/supabaseService';
import { ContactAvatar } from './ContactAvatar';

// Componente de Badge para Status
const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'Lead': 'bg-primary-50 text-primary-700 border-primary-100',
    'Qualificado': 'bg-blue-50 text-blue-700 border-blue-100',
    'Resolvido': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'Cliente': 'bg-amber-50 text-amber-700 border-amber-100',
    'Perdido': 'bg-slate-50 text-slate-500 border-slate-100'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${styles[status] || styles['Lead']}`}>
      {status}
    </span>
  );
};

const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-4 animate-pulse">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-16 bg-slate-100 rounded-2xl w-full" />
    ))}
  </div>
);

export default function Contacts({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Lead' | 'Qualificado' | 'Resolvido' | 'Cliente'>('Todos');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ nome: '', telefone: '' });

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      setIsLoading(true);
      const data = await listContacts();
      setContacts(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar contatos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.telefone) return;

    try {
      setIsSaving(true);
      const cleanPhone = formData.telefone.replace(/\D/g, '');
      
      if (editingContactId) {
        const { error } = await supabase
          .from('contacts')
          .update({ nome: formData.nome, telefone: cleanPhone })
          .eq('id', editingContactId);
        if (error) throw error;
        toast.success('Contato atualizado!');
      } else {
        const { error } = await supabase
          .from('contacts')
          .insert({ nome: formData.nome, telefone: cleanPhone, status_funil: 'Lead' });
        if (error) throw error;
        toast.success('Contato criado!');
      }

      setIsModalOpen(false);
      fetchContacts();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async (e: React.MouseEvent, contact: any) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir o contato ${contact.nome}?`)) return;

    try {
      const res = await deleteContact(contact.id);
      if (res.success) {
        toast.success('Contato excluído');
        setContacts(prev => prev.filter(c => c.id !== contact.id));
      }
    } catch (err: any) {
      toast.error('Erro ao excluir');
    }
  };

  const handleStatusChange = async (contactId: string, newStatus: string) => {
    try {
      await updateContactFunilStatus(contactId, newStatus as any);
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status_funil: newStatus } : c));
      if (selectedContact?.id === contactId) {
        setSelectedContact((prev: any) => prev ? { ...prev, status_funil: newStatus } : prev);
      }
    } catch (err) {
      toast.error('Erro ao atualizar status');
    }
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const matchSearch = (contact.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (contact.telefone || '').includes(searchTerm);
      const matchStatus = filterStatus === 'Todos' || 
                          (filterStatus === 'Cliente' ? contact.is_client : contact.status_funil === filterStatus);
      
      let matchDate = true;
      if (dateFilter !== 'all') {
        const now = new Date();
        const contactDate = new Date(contact.data_criacao || Date.now());
        if (dateFilter === 'today') {
          matchDate = contactDate.toDateString() === now.toDateString();
        } else if (dateFilter === 'week') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          matchDate = contactDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date();
          monthAgo.setMonth(now.getMonth() - 1);
          matchDate = contactDate >= monthAgo;
        }
      }
      
      return matchSearch && matchStatus && matchDate;
    });
  }, [contacts, searchTerm, filterStatus, dateFilter]);

  const stats = useMemo(() => ({
    total: contacts.length,
    leads: contacts.filter(c => c.status_funil === 'Lead').length,
    clientes: contacts.filter(c => c.is_client).length,
    resolvidos: contacts.filter(c => c.status_funil === 'Resolvido').length,
  }), [contacts]);

  return (
    <div className="flex-1 h-full bg-slate-50/50 overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
             <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
              <UserPlus size={22} />
            </div>
            Contatos (CRM)
          </h1>
          <p className="text-gray-500 text-sm font-medium mt-1">Gerencie seus leads e histórico via WhatsApp.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={async () => {
              try {
                toast.loading('Sincronizando contatos...');
                const res = await syncContacts();
                toast.dismiss();
                if (res.success) {
                  toast.success(`${res.synced} novos contatos sincronizados!`);
                  fetchContacts();
                }
              } catch (err: any) {
                toast.dismiss();
                toast.error('Erro ao sincronizar: ' + err.message);
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm"
          >
            <RefreshCw size={14} /> Sincronizar
          </button>
          
          <button 
            onClick={() => {
              if (filteredContacts.length === 0) {
                toast.error('Nenhum contato para exportar');
                return;
              }

              try {
                const headers = ['Nome', 'Telefone', 'Status', 'Cliente', 'Total Mensagens', 'Origem', 'Data Criacao', 'Ultima Interacao'];
                const csvRows = filteredContacts.map(c => [
                  `"${(c.nome || '').replace(/"/g, '""')}"`,
                  `"${c.telefone}"`,
                  `"${c.status_funil}"`,
                  `"${c.is_client ? 'Sim' : 'Não'}"`,
                  `"${c.totalMensagens || 0}"`,
                  `"${c.source || 'manual'}"`,
                  `"${new Date(c.data_criacao || Date.now()).toLocaleString('pt-BR')}"`,
                  `"${c.ultimaInteracao ? new Date(c.ultimaInteracao).toLocaleString('pt-BR') : '—'}"`
                ].join(','));

                const csvContent = [headers.join(','), ...csvRows].join('\n');
                const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `contatos_crm_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success(`${filteredContacts.length} contatos exportados!`);
              } catch (err) {
                console.error('[Export] Error:', err);
                toast.error('Erro ao exportar contatos');
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download size={14} className="text-gray-400" /> Exportar
          </button>

          <button 
            onClick={() => { 
              setEditingContactId(null); 
              setFormData({ nome: '', telefone: '' }); 
              setIsModalOpen(true); 
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-black shadow-lg shadow-primary-500/30 hover:bg-primary-700 transition-all active:scale-95"
          >
            <Plus size={18} /> Novo Contato
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {!isLoading && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900', bg: 'bg-white', border: 'border-slate-100', status: 'Todos' },
            { label: 'Leads', value: stats.leads, color: 'text-primary-700', bg: 'bg-white', border: 'border-slate-100', status: 'Lead' },
            { label: 'Clientes', value: stats.clientes, color: 'text-amber-600', bg: 'bg-white', border: 'border-slate-100', status: 'Cliente' },
            { label: 'Resolvidos', value: stats.resolvidos, color: 'text-emerald-600', bg: 'bg-white', border: 'border-slate-100', status: 'Resolvido' },
          ].map((s, i) => (
            <button
              key={i}
              onClick={() => setFilterStatus(s.status as any)}
              className={`w-full ${s.bg} border ${s.border} rounded-[32px] p-6 text-left transition-all hover:shadow-md relative overflow-hidden group ${filterStatus === s.status ? 'ring-2 ring-primary-500' : 'shadow-sm'}`}
            >
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">{s.label}</p>
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                 <UserPlus size={40} className={s.color} />
              </div>
            </button>
          ))}
        </motion.div>
      )}

      {/* Main Content Area */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden"
      >
        {/* Search & Filter Bar */}
        <div className="px-8 py-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar por nome ou número..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:border-primary-500 focus:ring-4 focus:ring-primary-50 transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="relative w-44">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:border-primary-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="all">Todo o período</option>
                <option value="today">Hoje</option>
                <option value="week">Últimos 7 dias</option>
                <option value="month">Últimos 30 dias</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {(['Todos', 'Lead', 'Qualificado', 'Resolvido', 'Cliente'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f as any)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all ${filterStatus === f ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List Content */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8">
              <ListSkeleton rows={8} />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <UserPlus size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Nenhum resultado</h3>
              <p className="text-sm text-slate-500">Tente buscar por outro termo ou mude o filtro.</p>
            </div>
          ) : (
            <>
              {/* Desktop View */}
              <div className="hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contato</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Número</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Última Mensagem</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tipo</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-8 py-5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredContacts.map((contact, idx) => (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        key={contact.id} 
                        onClick={() => setSelectedContact(contact)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <ContactAvatar url={contact.profile_picture_url} name={contact.nome} size="md" />
                            <div>
                              <p className="text-sm font-bold text-slate-900">{/^\d+$/.test(contact.nome) ? formatPhone(contact.nome) : contact.nome}</p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-1">{contact.totalMensagens || 0} msgs • {contact.source || 'WhatsApp'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                            <Phone size={12} className="text-slate-400" />
                            {formatPhone(contact.telefone)}
                          </div>
                        </td>
                        <td className="px-8 py-6 max-w-[250px]">
                          <p className="text-xs text-slate-500 truncate">{contact.ultimaMensagem || '—'}</p>
                          {contact.ultimaInteracao && <p className="text-[10px] text-slate-400 mt-1">{formatRelative(contact.ultimaInteracao)}</p>}
                        </td>
                        <td className="px-8 py-6 text-center">
                          {contact.is_client ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[9px] font-black uppercase tracking-wider">
                              <Star size={10} className="fill-amber-500" /> Cliente
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Lead</span>
                          )}
                        </td>
                        <td className="px-8 py-6">
                          <StatusBadge status={contact.status_funil} />
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={(e) => handleDeleteContact(e, contact)}
                              className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={16} />
                            </button>
                            <ChevronRight size={18} className="text-slate-300 group-hover:text-primary-600 transition-all" />
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile View */}
              <div className="md:hidden divide-y divide-slate-50">
                {filteredContacts.map((contact) => (
                  <div 
                    key={contact.id} 
                    onClick={() => setSelectedContact(contact)}
                    className="p-4 flex items-center gap-4 active:bg-slate-50 transition-colors"
                  >
                    <ContactAvatar url={contact.profile_picture_url} name={contact.nome} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="text-sm font-black text-slate-900 truncate">
                          {/^\d+$/.test(contact.nome) ? formatPhone(contact.nome) : contact.nome}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">
                          {formatRelative(contact.ultimaInteracao)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-2">{contact.ultimaMensagem || formatPhone(contact.telefone)}</p>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={contact.status_funil} />
                        {contact.is_client && <Star size={10} className="fill-amber-500 text-amber-500" />}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                  </div>
                ))}
              </div>

              {/* Footer */}
              {!isLoading && filteredContacts.length > 0 && (
                <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Total: <span className="text-slate-900">{filteredContacts.length} contatos</span>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Side Panel Overlay */}
      <AnimatePresence>
        {selectedContact && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedContact(null)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
            />
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-40 flex flex-col border-l border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-4">
                  <ContactAvatar url={selectedContact.profile_picture_url} name={selectedContact.nome} size="lg" />
                  <div>
                    <h3 className="text-base font-black text-slate-900">{selectedContact.nome}</h3>
                    <p className="text-xs text-slate-500">{formatPhone(selectedContact.telefone)}</p>
                    <div className="mt-1.5"><StatusBadge status={selectedContact.status_funil} /></div>
                  </div>
                </div>
                <button onClick={() => setSelectedContact(null)} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div className="space-y-3">
                  {[
                    { label: 'Telefone', value: formatPhone(selectedContact.telefone) },
                    { label: 'Status', value: selectedContact.status_funil },
                    { label: 'Mensagens', value: `${selectedContact.totalMensagens || 0} msgs` },
                    { label: 'Última interação', value: formatRelative(selectedContact.ultimaInteracao) },
                    { label: 'Cliente desde', value: formatRelative(selectedContact.data_criacao) },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-xs text-slate-400 font-medium">{item.label}</span>
                      <span className="text-xs font-bold text-slate-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 space-y-2">
                <button
                  onClick={() => { setEditingContactId(selectedContact.id || null); setFormData({ nome: selectedContact.nome, telefone: selectedContact.telefone }); setIsModalOpen(true); setSelectedContact(null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-sm"
                >
                  <Edit2 size={16} /> Editar Contato
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Contact Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden relative z-10 border border-slate-100"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary-500/30">
                    {editingContactId ? <Edit2 size={24} /> : <UserPlus size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{editingContactId ? 'Editar Contato' : 'Novo Contato'}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preencha os dados abaixo</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
                    <input 
                      type="text" required placeholder="Ex: João Silva"
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium bg-slate-50/50 focus:bg-white"
                      value={formData.nome}
                      onChange={e => setFormData({...formData, nome: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">WhatsApp (com DDD)</label>
                    <input 
                      type="tel" required placeholder="Ex: 11 99999-9999"
                      className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-sm font-medium bg-slate-50/50 focus:bg-white"
                      value={formData.telefone}
                      onChange={e => setFormData({...formData, telefone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button" onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" disabled={isSaving}
                    className="flex-1 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-primary-500/30 flex items-center justify-center gap-2 disabled:opacity-70 active:scale-95"
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : 'Salvar Contato'}
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
