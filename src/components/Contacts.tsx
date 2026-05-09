import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Download, 
  User,
  Phone,
  Calendar,
  Filter,
  Plus,
  Loader2,
  X,
  UserPlus,
  MessageSquare,
  ChevronRight,
  Clock,
  Hash,
  Zap,
  CheckCircle2,
  Star,
  ArrowUpRight,
  RefreshCw,
  Trash2,
  Edit2
} from 'lucide-react';
import { ContactAvatar } from './ContactAvatar';
import { motion, AnimatePresence } from 'motion/react';
import { 
  listContacts, 
  createContact, 
  listContactAppointments,
  updateContactFunilStatus,
  deleteContact,
  updateContact,
  type Contact,
  type Appointment
} from '../services/supabaseService';
import { syncContacts } from '../services/whatsappService';
import { toast } from 'sonner';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import { User as SupabaseUser } from '@supabase/supabase-js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatPhone = (phone: string) => {
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


// ── Status Badge ────────────────────────────────────────────────────────────────

const FUNIL_STYLES: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  Lead:       { label: 'Lead',       className: 'bg-primary-50 text-primary-700 border-primary-200',     icon: <Zap size={10} /> },
  Qualificado:{ label: 'Qualificado',className: 'bg-primary-50 text-primary-700 border-primary-200',   icon: <CheckCircle2 size={10} /> },
  Resolvido:  { label: 'Resolvido',  className: 'bg-emerald-50 text-emerald-700 border-emerald-200',   icon: <CheckCircle2 size={10} /> },
};

const StatusBadge = ({ status, onClick }: { status: Contact['status_funil']; onClick?: (e: React.MouseEvent) => void }) => {
  const s = FUNIL_STYLES[status] || FUNIL_STYLES['Lead'];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide transition-all hover:opacity-80 ${s.className}`}
    >
      {s.icon} {s.label}
    </button>
  );
};

// ── Side Panel ────────────────────────────────────────────────────────────────

interface SidePanelProps {
  contact: Contact;
  onClose: () => void;
  onTabChange?: (tab: string, jid?: string) => void;
  onStatusChange: (contactId: string, status: Contact['status_funil']) => void;
  onEdit: (contact: Contact) => void;
}

const SidePanel: React.FC<SidePanelProps> = ({ contact, onClose, onTabChange, onStatusChange, onEdit }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!contact.telefone) return;
    setLoadingAppts(true);
    listContactAppointments(contact.telefone)
      .then(setAppointments)
      .catch(console.error)
      .finally(() => setLoadingAppts(false));
  }, [contact.telefone]);

  const handleUpdateStatus = async (newStatus: Contact['status_funil']) => {
    if (!contact.id || updatingStatus || contact.status_funil === newStatus) return;
    setUpdatingStatus(true);
    try {
      await updateContactFunilStatus(contact.id, newStatus);
      onStatusChange(contact.id, newStatus);
      toast.success(`Status atualizado para ${newStatus}`);
    } catch (err) {
      toast.error('Erro ao atualizar status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const toggleIsClient = async () => {
    if (!contact.id || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const newVal = !contact.is_client;
      await updateContact(contact.id, { is_client: newVal } as any);
      onStatusChange(contact.id, contact.status_funil); // Just to trigger parent refresh, better way would be a new callback
      // Force local update if possible, but let's assume parent handles it
      toast.success(newVal ? 'Marcado como Cliente! ⭐' : 'Removido de Clientes');
      window.location.reload(); // Quick fix to sync all states
    } catch (err) {
      toast.error('Erro ao atualizar etiqueta');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openInbox = () => {
    const cleanPhone = contact.telefone.replace(/\D/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;
    if (onTabChange) onTabChange('inbox', jid);
  };
  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-40 flex flex-col border-l border-gray-100"
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <ContactAvatar url={contact.profile_picture_url} name={contact.nome} size="lg" />
          <div>
            <h3 className="text-lg font-black text-gray-900 leading-tight flex items-center gap-2">
              {/^\d+$/.test(contact.nome) ? formatPhone(contact.nome) : contact.nome}
              {contact.is_client && <Star size={16} className="fill-amber-500 text-amber-500" />}
            </h3>
            <p className="text-sm text-gray-500">{formatPhone(contact.telefone)}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge 
                status={contact.status_funil} 
                onClick={() => {
                  const order: any[] = ['Lead', 'Qualificado', 'Resolvido'];
                  const next = order[(order.indexOf(contact.status_funil) + 1) % order.length];
                  handleUpdateStatus(next);
                }} 
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(contact)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all">
            <Edit2 size={18} />
          </button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-0 border-b border-gray-100">
        {[
          { label: 'Mensagens', value: contact.totalMensagens ?? 0, icon: <MessageSquare size={14} /> },
          { label: 'Agendamentos', value: appointments.length, icon: <Calendar size={14} /> },
          { label: 'Desde', value: formatDate(contact.primeiroContato || contact.data_criacao), icon: <Clock size={12} /> },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col items-center py-4 border-r last:border-r-0 border-gray-100">
            <span className="text-gray-400 mb-1">{stat.icon}</span>
            <span className="text-base font-black text-gray-900">{stat.value}</span>
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Special Action: Mark as Client */}
      <div className="p-6 border-b border-gray-100">
        <button
          onClick={toggleIsClient}
          disabled={updatingStatus}
          className={`w-full flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all
            ${contact.is_client 
              ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm' 
              : 'bg-white border-gray-100 text-gray-400 hover:border-amber-200 hover:text-amber-500'}`}
        >
          <Star size={16} className={contact.is_client ? 'fill-amber-500' : ''} />
          {contact.is_client ? 'É Cliente ⭐' : 'Etiquetar como Cliente'}
        </button>
      </div>

      {/* Info */}
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">

        {/* Last message */}
        {contact.ultimaMensagem && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Última mensagem</p>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-sm text-gray-700 line-clamp-3">{contact.ultimaMensagem}</p>
              <p className="text-[10px] text-gray-400 mt-1">{formatRelative(contact.ultimaInteracao)}</p>
            </div>
          </div>
        )}

        {/* Details */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Informações</p>
          <div className="space-y-2">
            {[
              { icon: <Phone size={13} />, label: 'WhatsApp', value: formatPhone(contact.telefone) },
              { icon: <Clock size={13} />, label: 'Última interação', value: formatRelative(contact.ultimaInteracao) },
              { icon: <Calendar size={13} />, label: 'Primeiro contato', value: formatDate(contact.primeiroContato || contact.data_criacao) },
              { icon: <Hash size={13} />, label: 'Origem', value: contact.source === 'whatsapp' ? 'WhatsApp' : 'Manual' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="text-gray-400">{item.icon}</span>
                  {item.label}
                </span>
                <span className="text-xs font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Appointments */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Agendamentos</p>
          {loadingAppts ? (
            <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
              <Loader2 size={12} className="animate-spin" /> Carregando...
            </div>
          ) : appointments.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Nenhum agendamento encontrado.</p>
          ) : (
            <div className="space-y-2">
              {appointments.map((appt) => (
                <div key={appt.id} className="bg-primary-50 border border-primary-100 rounded-xl p-3">
                  <p className="text-xs font-bold text-primary-800">{appt.date} às {appt.time}</p>
                  <p className="text-xs text-primary-600">{appt.summary || appt.niche || 'Consulta'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual Status Change */}
        <div className="pt-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Mudar Status (Funil)</p>
          <div className="grid grid-cols-3 gap-2">
            {(['Lead', 'Qualificado', 'Resolvido'] as const).map((status) => {
              const isActive = contact.status_funil === status;
              const s = FUNIL_STYLES[status] || FUNIL_STYLES['Lead'];
              return (
                <button
                  key={status}
                  onClick={() => handleUpdateStatus(status)}
                  disabled={updatingStatus}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-[10px] font-bold transition-all relative
                    ${isActive 
                      ? `${s.className} ring-2 ring-offset-1 ring-current` 
                      : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                >
                  {s.icon}
                  {s.label}
                  {isActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-current rounded-full border-2 border-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 flex gap-3">
        <button
          onClick={openInbox}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-sm shadow-primary-200"
        >
          <MessageSquare size={16} /> Abrir Chat
        </button>
      </div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function Contacts({ onTabChange, user, role }: { onTabChange?: (tab: string, jid?: string) => void, user: SupabaseUser | null, role: string | null }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [filterStatus, setFilterStatus] = useState<Contact['status_funil'] | 'Todos'>('Todos');
  const [isSyncing, setIsSyncing] = useState(false);
  const [formData, setFormData] = useState({ nome: '', telefone: '' });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const loadingToast = toast.loading('Sincronizando contatos da caixa de entrada...');
      const result = await syncContacts();
      toast.dismiss(loadingToast);
      console.log(`[Contacts] Sync result:`, result);
      toast.success(`${result.synced} contatos sincronizados com sucesso!`);
      // Forced delay to allow Firestore to propagate
      setTimeout(() => fetchContacts(), 500);
    } catch (error: any) {
      toast.error('Erro ao sincronizar: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleDeleteContact = async (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    if (!contact.id) return;

    const confirmed = window.confirm(`Tem certeza que deseja excluir o contato "${contact.nome}"? Esta ação também removerá a conversa da caixa de entrada.`);
    
    if (confirmed) {
      try {
        await deleteContact(contact.id);
        setContacts(prev => prev.filter(c => c.id !== contact.id));
        toast.success('Contato excluído com sucesso');
      } catch (error) {
        toast.error('Erro ao excluir contato');
      }
    }
  };

  const fetchContacts = async () => {
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      console.warn('[Contacts] Safety timeout triggered after 5s');
    }, 5000);

    try {
      setIsLoading(true);
      const data = await listContacts();
      
      const sorted = (data || []).sort((a, b) => {
        const aTime = new Date(a.ultimaInteracao || a.data_criacao || 0).getTime();
        const bTime = new Date(b.ultimaInteracao || b.data_criacao || 0).getTime();
        return bTime - aTime;
      });
      setContacts(sorted);
    } catch (error: any) {
      console.error('[Contacts] Failed to fetch contacts:', error.message);
      toast.error('Estabilidade: Erro ao carregar contatos.');
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    if (user?.id) fetchContacts(); 
  }, [user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.telefone) return;
    try {
      setIsSaving(true);
      if (editingContactId) {
        await updateContact(editingContactId, { nome: formData.nome, telefone: formData.telefone });
        toast.success('Contato atualizado!');
        setSelectedContact(prev => prev && prev.id === editingContactId ? { ...prev, nome: formData.nome, telefone: formData.telefone } : prev);
      } else {
        await createContact({ nome: formData.nome, telefone: formData.telefone, status_funil: 'Lead' });
        toast.success('Contato criado!');
      }
      setIsModalOpen(false);
      setFormData({ nome: '', telefone: '' });
      setEditingContactId(null);
      await fetchContacts();
    } catch (error) {
      console.error('Failed to save contact:', error);
      toast.error('Erro ao salvar contato');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (contactId: string, newStatus: Contact['status_funil']) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status_funil: newStatus } : c));
    if (selectedContact?.id === contactId) {
      setSelectedContact(prev => prev ? { ...prev, status_funil: newStatus } : prev);
    }
  };

  const filteredContacts = useMemo(() => 
    contacts.filter(c => {
      const matchSearch = c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.telefone.includes(searchTerm);
      
      let matchStatus = true;
      if (filterStatus === 'Cliente') matchStatus = !!c.is_client;
      else if (filterStatus !== 'Todos') matchStatus = c.status_funil === filterStatus;
      
      let matchDate = true;
      if (dateFilter !== 'all') {
        const contactDate = new Date(c.data_criacao || c.primeiroContato || 0);
        const now = new Date();
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
    }), [contacts, searchTerm, filterStatus, dateFilter]);

  const stats = useMemo(() => ({
    total: contacts.length,
    leads: contacts.filter(c => c.status_funil === 'Lead').length,
    qualificados: contacts.filter(c => c.status_funil === 'Qualificado').length,
    resolvidos: contacts.filter(c => c.status_funil === 'Resolvido').length,
    clientes: contacts.filter(c => c.is_client).length,
  }), [contacts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Contatos (CRM)</h1>
            <p className="text-gray-500 text-xs sm:text-sm">Gerencie seus leads e histórico via WhatsApp.</p>
          </div>
          <button 
            onClick={fetchContacts}
            className="md:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-row gap-3">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full">
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
              className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-[11px] font-black hover:bg-emerald-100 transition-all shadow-sm"
            >
              <RefreshCw size={14} /> Sincronizar
            </button>
            <button 
              onClick={() => { 
                setEditingContactId(null); 
                setFormData({ nome: '', telefone: '' }); 
                setIsModalOpen(true); 
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl text-[11px] font-black hover:bg-primary-700 transition-colors shadow-lg shadow-primary-100"
            >
              <Plus size={16} /> Novo Contato
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
                    `"${new Date(c.data_criacao).toLocaleString('pt-BR')}"`,
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
              className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download size={14} className="text-gray-400" /> Exportar Planilha
            </button>
            <button 
              onClick={fetchContacts}
              className="hidden md:flex flex-shrink-0 items-center justify-center p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all border border-transparent"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {!isLoading && contacts.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', status: 'Todos' },
            { label: 'Leads', value: stats.leads, color: 'text-primary-700', bg: 'bg-primary-50', border: 'border-primary-100', status: 'Lead' },
            { label: 'Clientes', value: stats.clientes, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100', status: 'Cliente' },
            { label: 'Resolvidos', value: stats.resolvidos, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', status: 'Resolvido' },
          ].map((s, i) => (
            <button
              key={i}
              onClick={() => setFilterStatus(s.status as any)}
              className={`w-full ${s.bg} border ${s.border} rounded-2xl p-4 text-left transition-all hover:shadow-sm ${filterStatus === s.status ? 'ring-2 ring-offset-1 ring-primary-400' : ''}`}
            >
              <p className={`text-xl md:text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] md:text-xs font-bold text-gray-500 mt-0.5 uppercase tracking-wider">{s.label}</p>
            </button>
          ))}
        </motion.div>
      )}

      {/* Search & Filter */}
      <div className="bg-white p-3 md:p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou número..." 
            className="w-full pl-11 pr-4 py-2.5 bg-gray-50/50 border border-gray-100 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-44">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50/50 border border-gray-100 rounded-xl text-xs font-bold text-gray-600 focus:bg-white focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="all">Todo o período</option>
              <option value="today">Hoje</option>
              <option value="week">Últimos 7 dias</option>
              <option value="month">Últimos 30 dias</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <ChevronRight size={14} className="rotate-90" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
          <div className="flex-shrink-0 p-1.5 bg-gray-50 rounded-lg md:hidden">
             <Filter size={14} className="text-gray-400" />
          </div>
          <Filter size={16} className="text-gray-400 hidden md:block" />
          {(['Todos', 'Lead', 'Qualificado', 'Resolvido', 'Cliente'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f as any)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all ${filterStatus === f ? 'bg-primary-600 text-white shadow-lg shadow-primary-100' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List / Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      >
        {isLoading ? (
          <div className="p-6">
            <ListSkeleton rows={8} />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
              <MessageSquare size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {contacts.length === 0 ? 'Nenhum contato encontrado' : 'Sem resultados para os filtros'}
            </h3>
            <p className="text-gray-500 text-sm max-w-xs">
              {contacts.length === 0 
                ? 'Os contatos aparecerão automaticamente quando alguém enviar uma mensagem pelo WhatsApp.'
                : 'Tente buscar por outro nome ou número.'}
            </p>
            {contacts.length === 0 && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="mt-6 flex items-center gap-2 px-4 py-2 text-primary-600 font-semibold text-sm hover:bg-primary-50 rounded-lg transition-colors"
              >
                <Plus size={18} /> Adicionar primeiro contato
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Contato</th>
                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">Número</th>
                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Última mensagem</th>
                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell text-center">Tipo</th>
                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredContacts.map((contact) => (
                      <tr 
                        key={contact.id} 
                        onClick={() => setSelectedContact(contact)}
                        className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <ContactAvatar url={contact.profile_picture_url} name={contact.nome} size="md" />
                            <div>
                              <p className="text-sm font-black text-gray-900">{/^\d+$/.test(contact.nome) ? formatPhone(contact.nome) : contact.nome}</p>
                              {contact.totalMensagens !== undefined && (
                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{contact.totalMensagens} msgs • {contact.source === 'whatsapp' ? 'WhatsApp' : 'Manual'}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                            <Phone size={12} className="text-gray-400" />
                            {formatPhone(contact.telefone)}
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell max-w-[220px]">
                          <p className="text-xs text-gray-500 truncate">{contact.ultimaMensagem || '—'}</p>
                        </td>
                        <td className="px-5 py-4 hidden sm:table-cell text-center">
                          {contact.is_client ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[9px] font-black uppercase tracking-wider">
                              <Star size={10} className="fill-amber-500" /> Cliente
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Lead</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge 
                            status={contact.status_funil} 
                            onClick={async (e: any) => {
                               e.stopPropagation();
                               if (!contact.id) return;
                               const order: any[] = ['Lead', 'Qualificado', 'Resolvido'];
                               const next = order[(order.indexOf(contact.status_funil) + 1) % order.length];
                              try {
                                await updateContactFunilStatus(contact.id, next);
                                handleStatusChange(contact.id, next);
                                toast.success(`Status atualizado para ${next}`);
                              } catch (err) {
                                toast.error('Erro ao atualizar status');
                              }
                            }}
                          />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={(e) => handleDeleteContact(e, contact)}
                              className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                              title="Excluir Lead"
                            >
                              <Trash2 size={16} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedContact(contact); }}
                              className="p-2 text-gray-300 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                              title="Ver detalhes"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50">
              {filteredContacts.map((contact) => (
                <div 
                  key={contact.id} 
                  onClick={() => setSelectedContact(contact)}
                  className="p-4 flex items-center gap-4 active:bg-gray-50 transition-colors"
                >
                  <ContactAvatar url={contact.profile_picture_url} name={contact.nome} size="md" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-sm font-black text-gray-900 truncate">
                        {/^\d+$/.test(contact.nome) ? formatPhone(contact.nome) : contact.nome}
                      </h4>
                      <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">
                        {formatRelative(contact.ultimaInteracao)}
                      </span>
                    </div>
                    
                    {contact.ultimaMensagem ? (
                      <p className="text-xs text-gray-500 truncate mb-2">
                        {contact.ultimaMensagem}
                      </p>
                    ) : (
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-2">
                        {formatPhone(contact.telefone)}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <StatusBadge status={contact.status_funil} />
                      {contact.is_client && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[9px] font-black uppercase tracking-wider">
                          <Star size={10} className="fill-amber-500" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-gray-300">
                    <ChevronRight size={20} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer count */}
        {!isLoading && filteredContacts.length > 0 && (
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Mostrando <span className="font-bold text-gray-600">{filteredContacts.length}</span> de <span className="font-bold text-gray-600">{contacts.length}</span> contatos
            </p>
          </div>
        )}
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
            <SidePanel 
              contact={selectedContact} 
              onClose={() => setSelectedContact(null)} 
              onTabChange={onTabChange}
              onStatusChange={handleStatusChange}
              onEdit={(c) => {
                setEditingContactId(c.id || null);
                setFormData({ nome: c.nome, telefone: c.telefone });
                setIsModalOpen(true);
              }}
            />
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
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-lg shadow-primary-200">
                    {editingContactId ? <Edit2 size={20} /> : <UserPlus size={20} />}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{editingContactId ? 'Editar Contato' : 'Novo Contato'}</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome Completo</label>
                    <input 
                      type="text" required placeholder="Ex: João Silva"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      value={formData.nome}
                      onChange={e => setFormData({...formData, nome: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">WhatsApp (com DDD)</label>
                    <input 
                      type="tel" required placeholder="Ex: 11 99999-9999"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm"
                      value={formData.telefone}
                      onChange={e => setFormData({...formData, telefone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button" onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" disabled={isSaving}
                    className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary-200 flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isSaving ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : 'Salvar Contato'}
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
