import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, LayoutGrid, Ticket, User, MessageCircle, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner'; // Assuming we export or reuse types, wait let's just make it generic or use any for now
import { User as SupabaseUser } from '@supabase/supabase-js';

interface KanbanBoardProps {
  user: SupabaseUser | null;
  threads: any[];
  onThreadsChange: (updater: (prev: any[]) => any[]) => void;
}

export default function KanbanBoard({ user, threads, onThreadsChange }: KanbanBoardProps) {
  const [viewMode, setViewMode] = useState<'funil' | 'ticket'>('funil');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Estrutura das colunas baseadas no modo de visualização
  const columns = viewMode === 'funil' 
    ? [
        { id: 'Lead', title: 'Leads', color: 'bg-slate-100', borderColor: 'border-slate-200', titleColor: 'text-slate-600' },
        { id: 'Qualificado', title: 'Qualificados', color: 'bg-indigo-50', borderColor: 'border-indigo-100', titleColor: 'text-indigo-600' },
        { id: 'Cliente', title: 'Clientes', color: 'bg-emerald-50', borderColor: 'border-emerald-100', titleColor: 'text-emerald-600' }
      ]
    : [
        { id: 'open', title: 'Abertos', color: 'bg-amber-50', borderColor: 'border-amber-100', titleColor: 'text-amber-600' },
        { id: 'pending', title: 'Pendentes', color: 'bg-blue-50', borderColor: 'border-blue-100', titleColor: 'text-blue-600' },
        { id: 'resolved', title: 'Resolvidos', color: 'bg-emerald-50', borderColor: 'border-emerald-100', titleColor: 'text-emerald-600' }
      ];

  // Agrupamento estático para mockup (na próxima fase ligaremos aos threads reais)
  const getCards = (columnId: string) => {
    return threads.filter(t => {
      const matchSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;
      
      if (viewMode === 'funil') {
        return (t.funilStatus || 'Lead') === columnId;
      } else {
        return (t.ticketStatus || 'open') === columnId;
      }
    });
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCardId(cardId);
    // To allow nice drag effect:
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedCardId) return;

    const card = threads.find(t => t.id === draggedCardId);
    if (!card) return;

    // Prevent unnecessary updates
    if (viewMode === 'funil' && card.funilStatus === targetColumnId) return;
    if (viewMode === 'ticket' && card.ticketStatus === targetColumnId) return;

    // Update optimistically
    onThreadsChange(prev => prev.map(t => {
      if (t.id === draggedCardId) {
        return viewMode === 'funil'
          ? { ...t, funilStatus: targetColumnId }
          : { ...t, ticketStatus: targetColumnId };
      }
      return t;
    }));

    // Send to Supabase
    try {
      if (viewMode === 'funil') {
        // Need to update contacts table via cleanPhone
        const cleanPhone = card.remoteJid.split('@')[0].replace(/\D/g, '');
        const { error } = await supabase
          .from('contacts')
          .update({ status_funil: targetColumnId })
          .ilike('telefone', `%${cleanPhone.slice(-8)}%`);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('threads')
          .update({ ticket_status: targetColumnId })
          .eq('id', draggedCardId);
        if (error) throw error;
      }
      toast.success(`Movido para ${targetColumnId}`);
    } catch (err) {
      toast.error('Erro ao mover card');
    }
    setDraggedCardId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/50">
      {/* Header */}
      <div className="p-6 md:p-8 border-b border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <LayoutGrid className="text-blue-600" />
            Kanban Board
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie seus contatos e tickets de forma visual.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar card..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-full sm:w-64"
            />
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('funil')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'funil' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Filter size={16} /> Por Funil
            </button>
            <button 
              onClick={() => setViewMode('ticket')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'ticket' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Ticket size={16} /> Por Ticket
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 md:p-8">
        <div className="flex gap-6 h-full items-start min-w-max">
          {columns.map(col => {
            const cards = getCards(col.id);
            return (
              <div key={col.id} className="w-80 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className={`text-sm font-black uppercase tracking-wider ${col.titleColor}`}>{col.title}</h3>
                  <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-gray-500 shadow-sm border border-gray-100">
                    {cards.length}
                  </span>
                </div>
                
                <div 
                  onDrop={(e) => handleDrop(e, col.id)}
                  onDragOver={handleDragOver}
                  className={`flex-1 overflow-y-auto p-3 rounded-2xl border ${col.color} ${col.borderColor} space-y-3 custom-scrollbar transition-all duration-200
                    ${draggedCardId ? 'border-dashed border-2' : ''}`}
                >
                  {cards.length === 0 ? (
                    <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200/50 rounded-xl opacity-50">
                      <p className="text-xs font-bold text-gray-400">Nenhum card</p>
                    </div>
                  ) : (
                    cards.map(card => (
                      <motion.div 
                        layoutId={`card-${card.id}`}
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, card.id)}
                        className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all cursor-grab active:cursor-grabbing group
                          ${draggedCardId === card.id ? 'opacity-50 scale-95' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">{card.name}</h4>
                          {card.priority && card.priority !== 'normal' && (
                            <span className="text-xs">{card.priority === 'urgent' ? '🔥' : card.priority === 'high' ? '🔴' : '🟢'}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                          <MessageCircle size={12} />
                          <p className="line-clamp-1">{card.lastMessage || 'Sem mensagens'}</p>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                          <div className="flex items-center gap-1.5">
                             <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold">
                               {card.name.charAt(0).toUpperCase()}
                             </div>
                             <span className="text-[10px] font-semibold text-gray-400">{card.agent_name || 'Robô'}</span>
                          </div>
                          <button className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-600 transition-all">
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
