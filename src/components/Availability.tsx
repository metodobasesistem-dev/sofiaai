import React, { useState } from 'react';
import { 
  Clock, 
  Trash2, 
  Plus, 
  Copy, 
  ChevronDown,
  CalendarDays,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getAvailability, saveAvailability, listProfessionals, type Professional } from '../services/supabaseService';

interface TimeSlot {
  start: string;
  end: string;
}

interface DayAvailability {
  day: string;
  active: boolean;
  slots: TimeSlot[];
}

interface SpecificDate {
  id: string;
  date: Date;
  slots: TimeSlot[];
}

const TimeInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => (
  <div className="relative flex items-center group">
    <div className="absolute left-3 text-gray-400 group-focus-within:text-emerald-500 transition-colors">
      <Clock size={14} />
    </div>
    <input 
      type="time" 
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
    />
  </div>
);

const SpecificDateModal = ({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: (date: Date, slots: TimeSlot[]) => void }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 2, 27)); // March 27, 2026
  const [slots, setSlots] = useState<TimeSlot[]>([{ start: '09:00', end: '12:00' }]);
  const [viewMonth, setViewMonth] = useState(2); // March

  if (!isOpen) return null;

  const handleAddSlot = () => {
    const lastSlot = slots[slots.length - 1];
    const newStart = lastSlot ? lastSlot.end : '09:00';
    const [hours, minutes] = newStart.split(':').map(Number);
    const newEnd = `${String(Math.min(hours + 1, 23)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setSlots([...slots, { start: newStart, end: newEnd }]);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length > 1) {
      setSlots(slots.filter((_, i) => i !== index));
    } else {
      toast.error('É necessário pelo menos um horário disponível.');
    }
  };

  const handleUpdateSlot = (index: number, field: 'start' | 'end', value: string) => {
    setSlots(slots.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const formatDateLong = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const renderCalendar = (month: number, year: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const days = [];

    // Empty slots for days before the 1st
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="py-2"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isSelected = selectedDate.toDateString() === date.toDateString();
      const isToday = new Date().toDateString() === date.toDateString();

      days.push(
        <div 
          key={day} 
          onClick={() => setSelectedDate(date)}
          className={`py-2 rounded-lg cursor-pointer transition-all font-medium text-center
            ${isSelected ? 'bg-emerald-500 text-white shadow-md' : isToday ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'hover:bg-white hover:shadow-sm text-gray-600'}`}
        >
          {day}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Adicionar Horário Específico</h2>
            <p className="text-sm text-gray-500">Selecione uma data ou intervalo e defina os horários disponíveis.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Calendar Section */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-gray-700">Data ou Intervalo</label>
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30">
              <div className="flex items-center justify-between mb-4 px-2">
                <button 
                  onClick={() => setViewMonth(prev => prev - 1)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex gap-12 font-bold text-sm uppercase tracking-wider text-gray-500">
                  <span>{new Date(2026, viewMonth, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                  <span>{new Date(2026, viewMonth + 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                </div>
                <button 
                  onClick={() => setViewMonth(prev => prev + 1)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-8">
                {/* Current View Month */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                  {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map(d => <div key={d} className="text-gray-400 font-bold py-1 uppercase">{d}</div>)}
                  {renderCalendar(viewMonth, 2026)}
                </div>
                {/* Next Month */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                  {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map(d => <div key={d} className="text-gray-400 font-bold py-1 uppercase">{d}</div>)}
                  {renderCalendar(viewMonth + 1, 2026)}
                </div>
              </div>
            </div>
          </div>

          {/* Time Selection */}
          <div className="border border-gray-100 rounded-xl p-6 bg-gray-50/30 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900">Em que horários você está disponível?</h4>
                <p className="text-xs text-emerald-600 font-medium">{formatDateLong(selectedDate)}</p>
              </div>
              <button 
                onClick={handleAddSlot}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
              >
                <Plus size={14} />
                Adicionar Bloco
              </button>
            </div>

            <div className="space-y-3">
              {slots.map((slot, index) => (
                <div key={index} className="flex items-center gap-3">
                  <TimeInput value={slot.start} onChange={(v) => handleUpdateSlot(index, 'start', v)} />
                  <span className="text-gray-400">—</span>
                  <TimeInput value={slot.end} onChange={(v) => handleUpdateSlot(index, 'end', v)} />
                  <button 
                    onClick={() => handleRemoveSlot(index)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50 flex items-center justify-end gap-3 border-t border-gray-100">
          <button 
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-all"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(selectedDate, slots)}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            Aplicar Horário
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const DayRow: React.FC<{ 
  day: string, 
  active: boolean, 
  slots: TimeSlot[], 
  showApplyButton?: boolean,
  onToggle: () => void,
  onAddSlot: () => void,
  onRemoveSlot: (index: number) => void,
  onUpdateSlot: (index: number, field: 'start' | 'end', value: string) => void,
  onApplyToWeekdays?: () => void
}> = ({ 
  day, 
  active, 
  slots, 
  showApplyButton,
  onToggle,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
  onApplyToWeekdays
}) => (
  <div className="flex flex-col md:flex-row md:items-start gap-4 py-4 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-4 min-w-[160px]">
      <div 
        onClick={onToggle}
        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer
        ${active ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-300'}`}>
        {active && <Check size={14} strokeWidth={3} />}
      </div>
      <span className={`text-sm font-bold w-24 cursor-pointer select-none ${active ? 'text-gray-900' : 'text-gray-400'}`} onClick={onToggle}>{day}</span>
    </div>

    <div className="flex-1 space-y-3">
      {active ? (
        slots.map((slot, index) => (
          <div key={index} className="flex items-center gap-3">
            <TimeInput value={slot.start} onChange={(val) => onUpdateSlot(index, 'start', val)} />
            <span className="text-gray-400">—</span>
            <TimeInput value={slot.end} onChange={(val) => onUpdateSlot(index, 'end', val)} />
            
            <div className="flex items-center gap-1 ml-2">
              <button 
                onClick={() => onRemoveSlot(index)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Remover horário"
              >
                <Trash2 size={16} />
              </button>
              {index === slots.length - 1 && (
                <button 
                  onClick={onAddSlot}
                  className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                  title="Adicionar horário"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <span className="text-sm italic text-gray-300 py-2 block">Indisponível</span>
      )}
    </div>

    {showApplyButton && active && slots.length > 0 && (
      <div className="md:ml-auto">
        <button 
          onClick={onApplyToWeekdays}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all border border-transparent hover:border-emerald-100"
        >
          <Copy size={14} />
          Aplicar de Seg a Sex
        </button>
      </div>
    )}
  </div>
);

export default function Availability() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [specificDates, setSpecificDates] = useState<SpecificDate[]>([]);
  const [profs, setProfs] = useState<Professional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [loadingProfs, setLoadingProfs] = useState(true);

  const [days, setDays] = useState<DayAvailability[]>([
    { day: 'Segunda-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
    { day: 'Terça-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
    { day: 'Quarta-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
    { day: 'Quinta-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
    { day: 'Sexta-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
    { day: 'Sábado', active: true, slots: [{ start: '09:00', end: '12:00' }] },
    { day: 'Domingo', active: false, slots: [] },
  ]);

  useEffect(() => {
    const init = async () => {
      try {
        setLoadingProfs(true);
        const list = await listProfessionals();
        setProfs(list);
        if (list.length > 0) {
          setSelectedProfId(list[0].id || '');
        }
      } catch (err) {
        console.error('Error listing professionals:', err);
      } finally {
        setLoadingProfs(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const loadAvailability = async () => {
      if (!selectedProfId) return;

      try {
        const config = await getAvailability(selectedProfId);
        if (config) {
          if (config.weekly) setDays(config.weekly);
          if (config.specificDates) {
            const datesWithObj = config.specificDates.map((sd: any) => ({
              ...sd,
              date: new Date(sd.date + 'T12:00:00')
            }));
            setSpecificDates(datesWithObj);
          }
        } else {
          // Default state if no availability found
          setDays([
            { day: 'Segunda-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
            { day: 'Terça-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
            { day: 'Quarta-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
            { day: 'Quinta-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
            { day: 'Sexta-feira', active: true, slots: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
            { day: 'Sábado', active: true, slots: [{ start: '09:00', end: '12:00' }] },
            { day: 'Domingo', active: false, slots: [] },
          ]);
          setSpecificDates([]);
        }
      } catch (error) {
        console.error('Error loading availability:', error);
      }
    };
    loadAvailability();
  }, [selectedProfId]);

  const handleToggleDay = (index: number) => {
    setDays(prev => prev.map((d, i) => {
      if (i === index) {
        const newActive = !d.active;
        return { 
          ...d, 
          active: newActive,
          slots: newActive && d.slots.length === 0 ? [{ start: '09:00', end: '17:00' }] : d.slots
        };
      }
      return d;
    }));
  };

  const handleAddSlot = (dayIndex: number) => {
    setDays(prev => prev.map((d, i) => {
      if (i === dayIndex) {
        const lastSlot = d.slots[d.slots.length - 1];
        const newStart = lastSlot ? lastSlot.end : '09:00';
        const [hours, minutes] = newStart.split(':').map(Number);
        const newEnd = `${String(Math.min(hours + 1, 23)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        return { ...d, slots: [...d.slots, { start: newStart, end: newEnd }] };
      }
      return d;
    }));
  };

  const handleRemoveSlot = (dayIndex: number, slotIndex: number) => {
    setDays(prev => prev.map((d, i) => {
      if (i === dayIndex) {
        const newSlots = d.slots.filter((_, si) => si !== slotIndex);
        return { ...d, slots: newSlots, active: newSlots.length > 0 ? d.active : false };
      }
      return d;
    }));
  };

  const handleUpdateSlot = (dayIndex: number, slotIndex: number, field: 'start' | 'end', value: string) => {
    setDays(prev => prev.map((d, i) => {
      if (i === dayIndex) {
        const newSlots = d.slots.map((s, si) => {
          if (si === slotIndex) {
            return { ...s, [field]: value };
          }
          return s;
        });
        return { ...d, slots: newSlots };
      }
      return d;
    }));
  };

  const handleApplyToWeekdays = () => {
    const mondaySlots = [...days[0].slots];
    const weekdays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
    setDays(prev => prev.map(d => {
      if (weekdays.includes(d.day)) {
        return { ...d, active: true, slots: JSON.parse(JSON.stringify(mondaySlots)) };
      }
      return d;
    }));
    toast.success('Horários da segunda-feira aplicados aos dias úteis!');
  };

  const handleSaveSpecificDate = (date: Date, slots: TimeSlot[]) => {
    const newDate: SpecificDate = {
      id: Math.random().toString(36).substr(2, 9),
      date,
      slots
    };
    setSpecificDates([...specificDates, newDate]);
    setIsModalOpen(false);
    toast.success(`Horário para ${date.toLocaleDateString('pt-BR')} adicionado com sucesso!`);
  };

  const handleRemoveSpecificDate = (id: string) => {
    setSpecificDates(specificDates.filter(d => d.id !== id));
    toast.info('Horário específico removido.');
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // Prepare data for Firestore (convert Dates to strings)
      const dataToSave = {
        weekly: days,
        specificDates: specificDates.map(sd => ({
          id: sd.id,
          date: sd.date.toISOString().split('T')[0],
          slots: sd.slots
        }))
      };

      await saveAvailability(dataToSave, selectedProfId);
      toast.success('Configurações de disponibilidade salvas com sucesso!');
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Erro ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto pb-20"
    >
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-10">
        
        {/* 1. Seção Profissional */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Profissional</label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <select 
                value={selectedProfId}
                onChange={(e) => setSelectedProfId(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
              >
                {loadingProfs ? (
                  <option>Carregando equipe...</option>
                ) : profs.length === 0 ? (
                  <option>Nenhum profissional cadastrado</option>
                ) : (
                  profs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <ChevronDown size={18} />
              </div>
            </div>
            <button 
              onClick={() => window.location.hash = '#/equipe'}
              className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
              title="Gerenciar Equipe"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* 2. Seção Horas Semanais */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-black text-gray-900">Horas semanais</h3>
            <p className="text-sm text-gray-500">Defina os horários de atendimento padrão para cada dia da semana.</p>
          </div>

          <div className="bg-gray-50/30 rounded-2xl border border-gray-100 p-2">
            {days.map((d, i) => (
              <DayRow 
                key={i} 
                day={d.day} 
                active={d.active} 
                slots={d.slots} 
                showApplyButton={d.day === 'Segunda-feira'}
                onToggle={() => handleToggleDay(i)}
                onAddSlot={() => handleAddSlot(i)}
                onRemoveSlot={(si) => handleRemoveSlot(i, si)}
                onUpdateSlot={(si, field, val) => handleUpdateSlot(i, si, field, val)}
                onApplyToWeekdays={handleApplyToWeekdays}
              />
            ))}
          </div>
        </div>

        {/* 3. Seção Datas e Horários Específicos */}
        <div className="pt-6 border-t border-gray-100 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900">Datas e horários específicos</h3>
              <p className="text-sm text-gray-500">Adicione exceções para datas específicas (ex: feriados ou folgas).</p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <Plus size={18} />
              Horários
            </button>
          </div>

          {specificDates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {specificDates.map((sd) => (
                <div key={sd.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between group hover:border-emerald-200 transition-all">
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">{sd.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    <div className="flex gap-2 mt-1">
                      {sd.slots.map((s, i) => (
                        <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-100 text-gray-500">
                          {s.start} - {s.end}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveSpecificDate(sd.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-gray-300 mb-3 shadow-sm">
                <CalendarDays size={24} />
              </div>
              <p className="text-sm text-gray-400 font-medium">Nenhuma data específica adicionada.</p>
            </div>
          )}
        </div>

        {/* 4. Rodapé (Ação Principal) */}
        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSaveAll}
            disabled={isSaving}
            className={`px-8 py-3 bg-[#1a4d4d] hover:bg-[#143a3a] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#1a4d4d]/20 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {isSaving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check size={18} />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <SpecificDateModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            onSave={handleSaveSpecificDate}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
