import React, { useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  List, 
  Clock, 
  User, 
  Bot, 
  CalendarDays,
  MoreVertical,
  XCircle,
  RefreshCw,
  Loader2,
  MessageSquare,
  Send
} from 'lucide-react';
import { motion } from 'motion/react';
import { listAppointments, deleteAppointment, updateAppointment, type Appointment as DBAppointment } from '../services/supabaseService';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import { Skeleton, ListSkeleton } from './common/SkeletonLoader';
import { User as SupabaseUser } from '@supabase/supabase-js';

const AppointmentCard: React.FC<{ 
  appointment: Appointment, 
  onCancel: (id: string) => void,
  onReschedule: (appointment: Appointment) => void,
  onEdit: (appointment: Appointment) => void,
  onViewDetails: (appointment: Appointment) => void
}> = ({ appointment, onCancel, onReschedule, onEdit, onViewDetails }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center gap-6 relative"
    >
      {/* Date & Time Section (Clickable) */}
      <div 
        onClick={() => onViewDetails(appointment)}
        className="flex flex-row sm:flex-col items-center justify-center bg-blue-50 rounded-xl p-4 min-w-[100px] text-blue-600 border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors group"
      >
        <span className="text-xs font-bold uppercase tracking-wider opacity-70 group-hover:scale-110 transition-transform">{appointment.dateLabel.split(' ')[0]}</span>
        <span className="text-2xl font-black leading-none my-1 group-hover:scale-110 transition-transform">{appointment.dateLabel.split(' ')[1]}</span>
        <div className="flex items-center gap-1 text-xs font-bold">
          <Clock size={12} />
          {appointment.time}
        </div>
      </div>

      {/* Info Section */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900">{appointment.clientName}</h3>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase tracking-wide">
            {appointment.service}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Bot size={14} className="text-blue-500" />
          <span>Marcado por <span className="font-semibold text-gray-700">{appointment.agent}</span></span>
        </div>
      </div>

      {/* Actions Section */}
      <div className="flex items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0">
        <button 
          onClick={() => onReschedule(appointment)}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={16} className="text-gray-400" />
          Reagendar
        </button>
        <button 
          onClick={() => onCancel(appointment.id)}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-red-100 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
        >
          <XCircle size={16} />
          Cancelar
        </button>
        <div className="relative">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <MoreVertical size={20} />
          </button>
          
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-30">
              <button 
                onClick={() => {
                  onEdit(appointment);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Edit3 size={16} className="text-gray-400" />
                Editar Agendamento
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

interface Appointment {
  id: string;
  rawDate: string;
  dateLabel: string;
  time: string;
  clientName: string;
  clientPhone?: string;
  service: string;
  agent: string;
  summary?: string;
}

export default function Schedules({ user, role }: { user: SupabaseUser | null, role: string | null }) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Edit/Reschedule State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editFormData, setEditFormData] = useState({ clientName: '', date: '', time: '' });

  const fetchAppointments = async () => {
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      console.warn('[Schedules] Safety timeout: 5s reached');
    }, 5000);

    try {
      setIsLoading(true);
      const data = await listAppointments();
      if (data) {
        const formatted = data.map((app: any) => {
          const dateObj = parseISO(app.date);
          return {
            id: app.id,
            rawDate: app.date,
            dateLabel: format(dateObj, 'MMM dd', { locale: ptBR }).toUpperCase(),
            time: app.time,
            clientName: app.clientName,
            clientPhone: app.clientPhone,
            service: app.niche || 'Geral',
            agent: app.agentName || 'IA',
            summary: app.summary
          };
        });
        
        // Sort by date and time
        formatted.sort((a, b) => {
           const dateA = `${a.rawDate}T${a.time}`;
           const dateB = `${b.rawDate}T${b.time}`;
           return dateA.localeCompare(dateB);
        });
        setAppointments(formatted);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      toast.error('Erro ao carregar agendamentos.');
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (user?.id) fetchAppointments();
  }, [user?.id]);

  const handleCancel = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja cancelar este agendamento?')) return;
    try {
      await deleteAppointment(id);
      toast.success('Agendamento cancelado.');
      fetchAppointments();
    } catch (error) {
      toast.error('Erro ao cancelar.');
    }
  };

  const openEditModal = (app: Appointment) => {
    setSelectedAppointment(app);
    setEditFormData({
      clientName: app.clientName,
      date: app.rawDate,
      time: app.time
    });
    setIsEditModalOpen(true);
  };

  const openDetailsModal = (app: Appointment) => {
    setSelectedAppointment(app);
    setIsDetailsModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedAppointment) return;
    try {
      await updateAppointment(selectedAppointment.id, {
        clientName: editFormData.clientName,
        date: editFormData.date,
        time: editFormData.time
      });
      toast.success('Agendamento atualizado!');
      setIsEditModalOpen(false);
      fetchAppointments();
    } catch (error) {
      toast.error('Erro ao atualizar.');
    }
  };

  // Calendar logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <>
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agendamentos</h1>
          <p className="text-gray-500 text-sm">Visualize e gerencie os compromissos marcados pela IA.</p>
        </div>
        
        <div className="flex items-center bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
          <button 
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${view === 'list' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <List size={18} />
            Lista
          </button>
          <button 
            onClick={() => setView('calendar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${view === 'calendar' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <CalendarIcon size={18} />
            Calendário
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-6">
                <Skeleton variant="rect" width={100} height={80} className="rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="40%" height={20} />
                  <Skeleton variant="text" width="60%" height={15} />
                </div>
                <div className="flex gap-2">
                  <Skeleton variant="rect" width={100} height={40} className="rounded-lg" />
                  <Skeleton variant="rect" width={100} height={40} className="rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : view === 'list' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <CalendarDays size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Próximos Dias</span>
          </div>
          
          {appointments.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {appointments.map((appointment) => (
                <AppointmentCard 
                  key={appointment.id} 
                  appointment={appointment} 
                  onCancel={handleCancel}
                  onReschedule={openEditModal}
                  onEdit={openEditModal}
                  onViewDetails={openDetailsModal}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center justify-center text-center">
              <CalendarIcon size={48} className="text-gray-200 mb-4" />
              <h3 className="text-lg font-bold text-gray-900">Nenhum agendamento</h3>
              <p className="text-sm text-gray-500">Os compromissos marcados pela IA aparecerão aqui.</p>
            </div>
          )}

          {/* Empty State / Load More */}
          {appointments.length > 0 && (
            <div className="pt-4 flex justify-center">
              <button className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-2">
                Ver agendamentos passados
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
          {/* Calendar Header */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
             <h2 className="text-xl font-bold text-gray-900">
               {format(currentMonth, 'MMMM yyyy', { locale: ptBR }).toUpperCase()}
             </h2>
             <div className="flex items-center gap-2">
               <button 
                 onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                 className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                 <ChevronLeft size={20} />
               </button>
               <button 
                 onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                 className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
               >
                 <ChevronRight size={20} />
               </button>
             </div>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 border-b border-gray-50">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-bold text-gray-400 uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 flex-1">
            {calendarDays.map(day => {
              const dayApps = appointments.filter(a => isSameDay(parseISO(a.rawDate), day));
              return (
                <div 
                  key={day.toString()}
                  className={`min-h-[100px] p-2 border-r border-b border-gray-50 transition-colors
                    ${!isSameMonth(day, monthStart) ? 'bg-gray-50/50' : 'bg-white hover:bg-blue-50/10'}`}
                >
                  <span className={`text-xs font-bold ${!isSameMonth(day, monthStart) ? 'text-gray-300' : 'text-gray-500'}`}>
                    {format(day, 'd')}
                  </span>
                  <div className="mt-2 space-y-1">
                    {dayApps.map(app => (
                      <div 
                        key={app.id}
                        onClick={() => openDetailsModal(app)}
                        className="text-[9px] font-bold p-1 bg-blue-100 text-blue-700 rounded truncate cursor-pointer hover:bg-blue-200 transition-colors"
                      >
                        {app.time} - {app.clientName}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit/Reschedule Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Editar Agendamento</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nome do Cliente</label>
                <input 
                  type="text"
                  value={editFormData.clientName}
                  onChange={e => setEditFormData({...editFormData, clientName: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Data</label>
                  <input 
                    type="date"
                    value={editFormData.date}
                    onChange={e => setEditFormData({...editFormData, date: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Horário</label>
                  <input 
                    type="time"
                    value={editFormData.time}
                    onChange={e => setEditFormData({...editFormData, time: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex items-center gap-3">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveEdit}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
              >
                Salvar Alterações
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lead Details Modal */}
      {isDetailsModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                  {selectedAppointment.clientName[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{selectedAppointment.clientName}</h3>
                  <p className="text-white/70 text-xs">{selectedAppointment.clientPhone || 'Sem telefone'}</p>
                </div>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-white/70 hover:text-white transition-colors">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-8">
              {/* Meeting Info */}
              <div className="grid grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Data da Reunião</label>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <CalendarDays size={16} className="text-blue-500" />
                    {selectedAppointment.dateLabel} às {selectedAppointment.time}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Especialidade/Nicho</label>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Bot size={16} className="text-purple-500" />
                    {selectedAppointment.service}
                  </p>
                </div>
              </div>

              {/* Context Summary */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-gray-900">
                  <MessageSquare size={18} className="text-blue-500" />
                  <h4 className="font-bold">Contexto do Atendimento</h4>
                </div>
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  {selectedAppointment.summary ? (
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      "{selectedAppointment.summary}"
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-gray-400 text-xs text-center">
                      <Bot size={24} className="mb-2 opacity-20" />
                      O agente ainda não gerou um resumo para esta conversa.
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-4 flex items-center justify-center gap-4">
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    openEditModal(selectedAppointment);
                  }}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} />
                  Reagendar
                </button>
                <a 
                  href={`https://wa.me/${selectedAppointment.clientPhone?.replace(/\D/g, '')}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  Chamar no WhatsApp
                </a>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lead Details Modal */}
      {isDetailsModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                  {selectedAppointment.clientName[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{selectedAppointment.clientName}</h3>
                  <p className="text-white/70 text-xs">{selectedAppointment.clientPhone || 'Sem telefone'}</p>
                </div>
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-white/70 hover:text-white transition-colors">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-8">
              {/* Meeting Info */}
              <div className="grid grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Data da Reunião</label>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <CalendarDays size={16} className="text-blue-500" />
                    {selectedAppointment.dateLabel} às {selectedAppointment.time}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Especialidade/Nicho</label>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Bot size={16} className="text-purple-500" />
                    {selectedAppointment.service}
                  </p>
                </div>
              </div>

              {/* Context Summary */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-gray-900">
                  <MessageSquare size={18} className="text-blue-500" />
                  <h4 className="font-bold">Contexto do Atendimento</h4>
                </div>
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  {selectedAppointment.summary ? (
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      "{selectedAppointment.summary}"
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-gray-400 text-xs text-center">
                      <Bot size={24} className="mb-2 opacity-20" />
                      O agente ainda não gerou um resumo para esta conversa.
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-4 flex items-center justify-center gap-4">
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    openEditModal(selectedAppointment);
                  }}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} />
                  Reagendar
                </button>
                <a 
                  href={`https://wa.me/${selectedAppointment.clientPhone?.replace(/\D/g, '')}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  Chamar no WhatsApp
                </a>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
