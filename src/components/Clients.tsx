import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Download, 
  User,
  Phone,
  Calendar,
  Loader2,
  ChevronRight,
  Clock,
  MessageSquare,
  Star,
  RefreshCw,
  Trash2,
  X,
  Zap,
  CheckCircle2,
  Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  listContacts, 
  listContactAppointments,
  updateContactFunilStatus,
  deleteContact,
  type Contact,
  type Appointment
} from '../services/supabaseService';
import { toast } from 'sonner';
import { User as SupabaseUser } from '@supabase/supabase-js';

// ── Helpers ──

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

const getInitials = (name: string) => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-primary-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-primary-500', 'bg-teal-500',
];
const getAvatarColor = (id: string) => AVATAR_COLORS[(id.charCodeAt(0) + id.charCodeAt(1)) % AVATAR_COLORS.length];

const FUNIL_STYLES: Record<Contact['status_funil'], { label: string; className: string; icon: React.ReactNode }> = {
  Lead:       { label: 'Lead',       className: 'bg-primary-50 text-primary-700 border-primary-200',     icon: <Zap size={10} /> },
  Qualificado:{ label: 'Qualificado',className: 'bg-green-50 text-green-700 border-green-200',   icon: <CheckCircle2 size={10} /> },
  Cliente:    { label: 'Cliente',    className: 'bg-amber-50 text-amber-700 border-amber-200',   icon: <Star size={10} /> },
};

const StatusBadge = ({ status, onClick }: { status: Contact['status_funil']; onClick?: () => void }) => {
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

// ── Side Panel ──

interface SidePanelProps {
  contact: Contact;
  onClose: () => void;
  onTabChange?: (tab: string) => void;
  onStatusChange: (contactId: string, status: Contact['status_funil']) => void;
}

const SidePanel = ({ contact, onClose, onTabChange, onStatusChange }: SidePanelProps) => {
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

  const openInbox = () => {
    const jid = `${contact.telefone.replace(/\D/g, '')}@c.us`;
    const url = new URL(window.location.href);
    url.searchParams.set('jid', jid);
    window.history.pushState({}, '', url);
    if (onTabChange) onTabChange('inbox');
  };

  const color = getAvatarColor(contact.id || contact.telefone);

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
          <div className={`w-14 h-14 rounded-2xl ${color} text-white flex items-center justify-center text-xl font-black shadow-lg`}>
            {getInitials(contact.nome)}
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900 leading-tight">{contact.nome}</h3>
            <p className="text-sm text-gray-500">{formatPhone(contact.telefone)}</p>
            <div className="mt-1.5">
              <StatusBadge 
                status={contact.status_funil} 
                onClick={() => {
                  const order: Contact['status_funil'][] = ['Lead', 'Qualificado', 'Cliente'];
                  const next = order[(order.indexOf(contact.status_funil) + 1) % order.length];
                  handleUpdateStatus(next);
                }} 
              />
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
          <X size={20} />
        </button>
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
            {(['Lead', 'Qualificado', 'Cliente'] as const).map((status) => {
              const isActive = contact.status_funil === status;
              const s = FUNIL_STYLES[status];
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

// ── Main Component ──

export default function Clients({ onTabChange, user, role }: { onTabChange?: (tab: string) => void, user: SupabaseUser | null, role: string | null }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const fetchClients = async () => {
    try {
      setIsLoading(true);
      const data = await listContacts();
      const clients = data.filter(c => c.status_funil === 'Cliente');
      const sorted = clients.sort((a, b) => {
        const aTime = new Date(a.ultimaInteracao || a.data_criacao || 0).getTime();
        const bTime = new Date(b.ultimaInteracao || b.data_criacao || 0).getTime();
        return bTime - aTime;
      });
      setContacts(sorted);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      toast.error('Erro ao carregar lista de clientes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  const filteredClients = useMemo(() => 
    contacts.filter(c => 
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.telefone.includes(searchTerm)
    ), [contacts, searchTerm]);

  const handleDeleteClient = async (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    if (!contact.id) return;

    const confirmed = window.confirm(`Tem certeza que deseja excluir o cliente "${contact.nome}"?`);
    if (confirmed) {
      try {
        await deleteContact(contact.id);
        setContacts(prev => prev.filter(c => c.id !== contact.id));
        if (selectedContact?.id === contact.id) setSelectedContact(null);
        toast.success('Cliente removido com sucesso');
      } catch (error) {
        toast.error('Erro ao remover cliente');
      }
    }
  };

  const openInbox = (telefone: string) => {
    const jid = `${telefone.replace(/\D/g, '')}@c.us`;
    const url = new URL(window.location.href);
    url.searchParams.set('jid', jid);
    window.history.pushState({}, '', url);
    if (onTabChange) onTabChange('inbox');
  };

  const handleStatusChange = (contactId: string, newStatus: Contact['status_funil']) => {
    if (newStatus !== 'Cliente') {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      if (selectedContact?.id === contactId) setSelectedContact(null);
    } else {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status_funil: newStatus } : c));
      if (selectedContact?.id === contactId) {
        setSelectedContact(prev => prev ? { ...prev, status_funil: newStatus } : prev);
      }
    }
  };

  return (
    <div className="relative min-h-[600px]">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-100">
                <Star size={24} fill="currentColor" />
              </div>
              Minha Carteira (CRM)
            </h1>
            <p className="text-gray-500 text-sm mt-1">Gestão de contatos que já converteram ou estão em negociação avançada.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchClients}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              title="Atualizar lista"
            >
              <RefreshCw size={18} />
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
              <Download size={18} className="text-gray-400" /> Exportar Planilha
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <Star size={16} fill="currentColor" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Total de Clientes</span>
            </div>
            <p className="text-3xl font-black text-gray-900">{contacts.length}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-primary-600 mb-2">
              <MessageSquare size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary-500">Conversas Ativas</span>
            </div>
            <p className="text-3xl font-black text-gray-900">{contacts.filter(c => c.totalMensagens && c.totalMensagens > 0).length}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <Calendar size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Novos este Mês</span>
            </div>
            <p className="text-3xl font-black text-gray-900">
              {contacts.filter(c => {
                const d = new Date(c.data_criacao);
                const now = new Date();
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              }).length}
            </p>
          </div>
        </div>

        {/* Table & Search */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-50 bg-gray-50/30">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar cliente na carteira..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <Loader2 size={40} className="animate-spin mb-4 text-amber-500" />
              <p className="font-medium">Carregando carteira (CRM)...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-200 mb-4">
                <Star size={32} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Sua carteira está crescendo!
              </h3>
              <p className="text-gray-500 text-sm max-w-xs">
                Motive seus leads no CRM para o status "Cliente" e eles aparecerão automaticamente aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cliente</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden md:table-cell">WhatsApp</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:table-cell">Última Interação</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 transition-all">
                  {filteredClients.map((client) => {
                    const color = getAvatarColor(client.id || client.telefone);
                    const isActive = selectedContact?.id === client.id;
                    return (
                      <tr 
                        key={client.id} 
                        onClick={() => setSelectedContact(client)}
                        className={`hover:bg-amber-50/20 transition-colors group cursor-pointer ${isActive ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl ${color} text-white flex items-center justify-center text-sm font-black flex-shrink-0 shadow-sm`}>
                              {getInitials(client.nome)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-gray-900">{client.nome}</p>
                              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">Cliente desde {formatDate(client.data_criacao)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 hidden md:table-cell">
                          <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                            <Phone size={13} className="text-gray-400" />
                            {formatPhone(client.telefone)}
                          </div>
                        </td>
                        <td className="px-6 py-5 hidden sm:table-cell">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock size={13} className="text-gray-400" />
                            {formatRelative(client.ultimaInteracao || client.data_criacao)}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); openInbox(client.telefone); }}
                              className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                              title="Conversar"
                            >
                              <MessageSquare size={18} />
                            </button>
                            <button 
                              onClick={(e) => handleDeleteClient(e, client)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Remover"
                            >
                              <Trash2 size={18} />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Side Panel Overlay */}
      <AnimatePresence>
        {selectedContact && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedContact(null)}
              className="fixed inset-0 bg-black/5 backdrop-blur-[1px] z-30"
            />
            <SidePanel 
              contact={selectedContact}
              onClose={() => setSelectedContact(null)}
              onTabChange={onTabChange}
              onStatusChange={handleStatusChange}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
