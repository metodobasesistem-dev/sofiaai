import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, LayoutGrid, Ticket, User, MessageCircle, ArrowRight, Calendar, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { promoteToClient, demoteClient } from '../services/supabaseService';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { 
  format, 
  subDays, 
  isWithinInterval, 
  startOfDay, 
  endOfDay, 
  parseISO,
  isAfter,
  isBefore
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface KanbanBoardProps {
  user: SupabaseUser | null;
  threads: any[];
  onThreadsChange: (updater: (prev: any[]) => any[]) => void;
}

export default function KanbanBoard({ user, threads, onThreadsChange }: KanbanBoardProps) {
  const [viewMode, setViewMode] = useState<'funil' | 'ticket'>('funil');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom'>('all');
  const [dateType, setDateType] = useState<'created' | 'updated'>('updated');
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Estrutura das colunas baseadas no modo de visualização
  const columns = viewMode === 'funil'
    ? [
        { id: 'novo_lead',      title: 'Novo Lead',       desc: 'Primeiro contato recebido',              dot: 'bg-slate-400',   color: 'bg-slate-50',    borderColor: 'border-slate-200',   titleColor: 'text-slate-600' },
        { id: 'primeiro_atend', title: 'Primeiro Atend.', desc: 'Em conversa ativa com a equipe',         dot: 'bg-blue-400',    color: 'bg-blue-50',     borderColor: 'border-blue-100',    titleColor: 'text-blue-600' },
        { id: 'sem_resposta',   title: 'Sem Resposta',    desc: 'Aguardando retorno do lead',             dot: 'bg-amber-400',   color: 'bg-amber-50',    borderColor: 'border-amber-100',   titleColor: 'text-amber-600' },
        { id: 'qualificado',    title: 'Qualificado',     desc: 'Interesse confirmado, pronto para agendar', dot: 'bg-violet-400', color: 'bg-violet-50',  borderColor: 'border-violet-100',  titleColor: 'text-violet-600' },
        { id: 'agendamento',    title: 'Agendamento',     desc: 'Consulta marcada no calendário',         dot: 'bg-indigo-400',  color: 'bg-indigo-50',   borderColor: 'border-indigo-100',  titleColor: 'text-indigo-600' },
        { id: 'cliente',        title: 'Cliente',         desc: 'Conversão concluída',                    dot: 'bg-emerald-400', color: 'bg-emerald-50',  borderColor: 'border-emerald-100', titleColor: 'text-emerald-600' },
      ]
    : [
        { id: 'open',     title: 'Abertos',    desc: '', dot: 'bg-amber-400',   color: 'bg-amber-50',   borderColor: 'border-amber-100',   titleColor: 'text-amber-600' },
        { id: 'pending',  title: 'Pendentes',  desc: '', dot: 'bg-primary-400', color: 'bg-primary-50', borderColor: 'border-primary-100', titleColor: 'text-primary-600' },
        { id: 'resolved', title: 'Resolvidos', desc: '', dot: 'bg-emerald-400', color: 'bg-emerald-50', borderColor: 'border-emerald-100', titleColor: 'text-emerald-600' },
      ];

  // Etapa do funil (banco) ↔ coluna do quadro. 'Cliente' NÃO é etapa de funil:
  // é a flag contacts.is_client, a mesma que a tela de Clientes usa. Antes
  // 'Resolvido' era exibido como Cliente, o que fazia a mesma pessoa aparecer
  // como cliente aqui e como lead na lista de contatos.
  const FUNIL_COMPAT: Record<string, string> = {
    'Lead': 'novo_lead',
    'Qualificado': 'qualificado',
    'Agendado': 'agendamento',
    'Resolvido': 'resolvido',
  };
  const normFunil = (s?: string) => { if (!s) return 'novo_lead'; return FUNIL_COMPAT[s] ?? s; };

  // Coluna → valor aceito pelo CHECK de contacts.status_funil. As colunas
  // 'primeiro_atend' e 'sem_resposta' não têm equivalente no banco: são
  // visuais e por isso não gravam etapa (ver nota no handleDrop).
  const COLUNA_PARA_FUNIL: Record<string, string> = {
    novo_lead: 'Lead',
    qualificado: 'Qualificado',
    agendamento: 'Agendado',
    resolvido: 'Resolvido',
  };

  /** A coluna Cliente é alimentada pela flag, não pela etapa. */
  const cardEhCliente = (t: any) => t.is_client === true;

  const getCards = (columnId: string) => {
    return threads.filter(t => {
      // 1. Filtro de Busca
      const matchSearch = t.name?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      // 2. Filtro de Modo (Funil vs Ticket)
      const matchMode = viewMode === 'funil'
        ? (columnId === 'cliente'
            ? cardEhCliente(t)
            : !cardEhCliente(t) && normFunil(t.funilStatus) === columnId)
        : (t.ticketStatus || 'open') === columnId;
      if (!matchMode) return false;

      // 3. Filtro de Data
      if (dateFilter !== 'all') {
        const dateToCompare = dateType === 'created' ? parseISO(t.createdAt) : parseISO(t.updatedAt);
        const now = new Date();
        
        let start = startOfDay(now);
        let end = endOfDay(now);

        if (dateFilter === 'today') {
          // Já definido
        } else if (dateFilter === 'yesterday') {
          start = startOfDay(subDays(now, 1));
          end = endOfDay(subDays(now, 1));
        } else if (dateFilter === '7days') {
          start = startOfDay(subDays(now, 7));
        } else if (dateFilter === '30days') {
          start = startOfDay(subDays(now, 30));
        } else if (dateFilter === 'custom') {
          if (customRange.start) start = startOfDay(parseISO(customRange.start));
          else start = new Date(0); // início dos tempos
          if (customRange.end) end = endOfDay(parseISO(customRange.end));
          else end = new Date(2100, 0, 1); // futuro distante
        }

        const isInRange = isWithinInterval(dateToCompare, { start, end });
        if (!isInRange) return false;
      }
      
      return true;
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
    if (viewMode === 'funil' && targetColumnId === 'cliente' && card.is_client) return;
    if (viewMode === 'funil' && targetColumnId !== 'cliente' && !card.is_client && card.funilStatus === targetColumnId) return;
    if (viewMode === 'ticket' && card.ticketStatus === targetColumnId) return;

    // Atualização otimista — 'cliente' mexe na flag, as demais na etapa
    onThreadsChange(prev => prev.map(t => {
      if (t.id !== draggedCardId) return t;
      if (viewMode === 'funil') {
        if (targetColumnId === 'cliente') {
          return { ...t, is_client: true, ticketStatus: 'resolved' };
        }
        return {
          ...t,
          is_client: false,
          funilStatus: targetColumnId,
          ticketStatus: targetColumnId === 'resolvido' ? 'resolved' : 'open',
        };
      }
      return { ...t, ticketStatus: targetColumnId };
    }));

    // Persistência
    //
    // Antes gravava o id da COLUNA em contacts.status_funil ('novo_lead',
    // 'cliente'…), valores que o CHECK da coluna não aceita
    // (Lead/Qualificado/Agendado/Resolvido) — toda movimentação de card
    // falhava no banco e voltava ao lugar no reload.
    try {
      if (viewMode === 'funil') {
        const contactId = card.contactId;

        if (targetColumnId === 'cliente') {
          // Vira cliente: sai dos leads e ganha ficha comercial.
          if (!contactId) throw new Error('Contato ainda não sincronizado');
          await promoteToClient(contactId);
          onThreadsChange(prev => prev.map(t => t.id === draggedCardId ? { ...t, is_client: true } : t));
        } else {
          // Saiu da coluna Cliente: volta a ser lead.
          if (card.is_client && contactId) {
            await demoteClient(contactId);
            onThreadsChange(prev => prev.map(t => t.id === draggedCardId ? { ...t, is_client: false } : t));
          }

          const etapa = COLUNA_PARA_FUNIL[targetColumnId];
          if (etapa && contactId) {
            const { error } = await supabase.from('contacts').update({ status_funil: etapa }).eq('id', contactId);
            if (error) throw error;
          }
          // 'primeiro_atend' e 'sem_resposta' não existem no funil salvo:
          // o card se move na tela, mas não há etapa correspondente para gravar.

          const ticketStatusUpdate = targetColumnId === 'resolvido' ? 'resolved' : 'open';
          await supabase.from('threads').update({ ticket_status: ticketStatusUpdate }).eq('id', draggedCardId);
        }
      } else {
        await supabase.from('threads').update({ ticket_status: targetColumnId }).eq('id', draggedCardId);
      }
      toast.success('Card movido');
    } catch (err: any) {
      toast.error('Erro ao mover card: ' + (err?.message || ''));
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
      <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <LayoutGrid size={16} className="text-primary-600" />
          <h1 className="text-sm font-black text-gray-900">Kanban Board</h1>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Busca */}
          <div className="relative w-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
            <input
              type="text"
              placeholder="Buscar card..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Tipo de data */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setDateType('updated')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${dateType === 'updated' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Atualização
            </button>
            <button
              onClick={() => setDateType('created')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${dateType === 'created' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Criação
            </button>
          </div>

          {/* Período */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-600 hover:border-primary-300 transition-all shadow-sm"
            >
              <Calendar size={12} className="text-primary-500" />
              {dateFilter === 'all' ? 'Todo o período' :
               dateFilter === 'today' ? 'Hoje' :
               dateFilter === 'yesterday' ? 'Ontem' :
               dateFilter === '7days' ? '7 dias' :
               dateFilter === '30days' ? '30 dias' : 'Personalizado'}
              <ChevronDown size={12} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowDatePicker(false)} />
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-30">
                  {(['all', 'today', 'yesterday', '7days', '30days', 'custom'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => { setDateFilter(f); if (f !== 'custom') setShowDatePicker(false); }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dateFilter === f ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      {f === 'all' ? 'Todo o período' : f === 'today' ? 'Hoje' : f === 'yesterday' ? 'Ontem' : f === '7days' ? 'Últimos 7 dias' : f === '30days' ? 'Últimos 30 dias' : 'Personalizado...'}
                    </button>
                  ))}
                  {dateFilter === 'custom' && (
                    <div className="mt-2 p-2 border-t border-gray-50 space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-400">Início</label>
                        <input type="date" value={customRange.start} onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))} className="w-full text-xs p-1.5 border border-gray-100 rounded-md outline-none focus:border-primary-300" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-gray-400">Fim</label>
                        <input type="date" value={customRange.end} onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))} className="w-full text-xs p-1.5 border border-gray-100 rounded-md outline-none focus:border-primary-300" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Modo de Visualização */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('funil')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'funil' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Filter size={12} /> Por Funil
            </button>
            <button
              onClick={() => setViewMode('ticket')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'ticket' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Ticket size={12} /> Por Ticket
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full items-start min-w-max w-full">
          {columns.map(col => {
            const cards = getCards(col.id);
            return (
              <div key={col.id} className="flex-1 min-w-[200px] max-w-xs h-full flex flex-col">
                <div className="mb-4 px-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${col.dot}`} />
                      <h3 className={`text-[11px] font-black uppercase tracking-widest ${col.titleColor}`}>{col.title}</h3>
                    </div>
                    <span className="bg-white px-1.5 py-0.5 rounded-full text-[10px] font-bold text-gray-400 shadow-sm border border-gray-100">
                      {cards.length}
                    </span>
                  </div>
                  {col.desc && <p className="text-[10px] text-gray-400 mt-0.5 pl-3">{col.desc}</p>}
                </div>
                
                <div 
                  onDrop={(e) => handleDrop(e, col.id)}
                  onDragOver={handleDragOver}
                  className={`flex-1 overflow-y-auto p-3 rounded-2xl border ${col.color} ${col.borderColor} space-y-3 custom-scrollbar transition-all duration-200
                    ${draggedCardId ? 'border-dashed border-2' : ''}`}
                >
                  {cards.length === 0 ? (
                    <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200/50 rounded-xl opacity-50">
                      <p className="text-xs font-bold text-gray-400">Arraste aqui</p>
                    </div>
                  ) : (
                    cards.map(card => (
                      <motion.div 
                        layoutId={`card-${card.id}`}
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, card.id)}
                        className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-primary-200 transition-all cursor-grab active:cursor-grabbing group
                          ${draggedCardId === card.id ? 'opacity-50 scale-95' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="text-sm font-bold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-1 flex items-center gap-2">
                            {card.name}
                            {card.is_client && <span className="text-amber-500" title="Cliente">⭐</span>}
                          </h4>
                          {card.priority && card.priority !== 'normal' && (
                            <span className="text-xs">{card.priority === 'urgent' ? '🔥' : card.priority === 'high' ? '🔴' : '🟢'}</span>
                          )}
                        </div>
                        {card.is_client && (
                          <div className="mb-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Cliente</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                          <MessageCircle size={12} />
                          <p className="line-clamp-1">{card.lastMessage || 'Sem mensagens'}</p>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                          <div className="flex items-center gap-1.5">
                             <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-[9px] font-bold overflow-hidden">
                               {card.photo_url ? (
                                 <img src={card.photo_url} alt={card.name} className="w-full h-full object-cover" />
                               ) : (
                                 card.name.charAt(0).toUpperCase()
                               )}
                             </div>
                             <span className="text-[10px] font-semibold text-gray-400">{card.agent_name || 'Robô'}</span>
                          </div>
                          <button className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-primary-600 transition-all">
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
