import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, MessageSquare, Users, Calendar, Wifi, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useNotification } from '../contexts/NotificationContext';
import { getWhatsAppStatus } from '../services/whatsappService';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type NotifType = 'message' | 'lead' | 'appointment' | 'warning';

interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time?: string;
  action?: NotifType;
}

const TYPE_STYLES: Record<NotifType, { bg: string; icon: React.ReactNode; dot: string }> = {
  message:     { bg: 'bg-blue-100',   icon: <MessageSquare size={14} className="text-blue-600" />,  dot: 'bg-blue-500' },
  lead:        { bg: 'bg-green-100',  icon: <Users size={14} className="text-green-600" />,          dot: 'bg-green-500' },
  appointment: { bg: 'bg-purple-100', icon: <Calendar size={14} className="text-purple-600" />,      dot: 'bg-purple-500' },
  warning:     { bg: 'bg-red-100',    icon: <Wifi size={14} className="text-red-600" />,             dot: 'bg-red-500' },
};

const STORAGE_KEY = (uid: string) => `notif_read_${uid}`;

interface Props {
  user: User | null;
  onTabChange: (tab: string, subTab?: string) => void;
}

export default function NotificationBell({ user, onTabChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { unreadTotal } = useNotification();

  // Load persisted read IDs
  useEffect(() => {
    if (!user?.id) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY(user.id));
      if (saved) setReadIds(new Set(JSON.parse(saved)));
    } catch {}
  }, [user?.id]);

  const persistRead = useCallback((ids: Set<string>) => {
    if (!user?.id) return;
    localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(Array.from(ids)));
  }, [user?.id]);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const collected: AppNotification[] = [];

    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [threadsRes, leadsRes, apptRes, statusRes] = await Promise.allSettled([
        supabase
          .from('threads')
          .select('id, contact_name, last_message, updated_at, unread_count')
          .eq('user_id', user.id)
          .gt('unread_count', 0)
          .order('updated_at', { ascending: false })
          .limit(5),

        // "Novo Lead" = thread cuja PRIMEIRA mensagem inbound chegou nas últimas 24h.
        // Nunca usar contacts.data_criacao aqui: o contato também é criado quando
        // SOMOS nós que iniciamos a conversa (prospecção/campanha), e o mesmo
        // telefone pode ter dois registros em contacts (duplicava a notificação).
        supabase
          .from('threads')
          .select('id, contact_name, display_phone, first_inbound_at')
          .eq('user_id', user.id)
          .gte('first_inbound_at', yesterday)
          .order('first_inbound_at', { ascending: false })
          .limit(5),

        supabase
          .from('appointments')
          .select('id, client_name, time, summary')
          .eq('user_id', user.id)
          .eq('status', 'confirmed')
          .eq('data', today)
          .order('time', { ascending: true })
          .limit(5),

        getWhatsAppStatus().catch(() => null),
      ]);

      // WhatsApp disconnected warning
      if (statusRes.status === 'fulfilled' && statusRes.value && statusRes.value.status !== 'connected') {
        collected.push({
          id: 'whatsapp-disconnected',
          type: 'warning',
          title: 'WhatsApp Desconectado',
          body: 'Clique para reconectar sua assistente.',
        });
      }

      // New leads (calculado antes das mensagens para deduplicar)
      const leadThreadIds = new Set<string>();
      if (leadsRes.status === 'fulfilled') {
        if (leadsRes.value.error) {
          console.warn('[NotificationBell] Falha ao buscar novos leads:', leadsRes.value.error.message);
        }
        for (const t of leadsRes.value.data || []) {
          leadThreadIds.add(t.id);
          collected.push({
            id: `lead-${t.id}`,
            type: 'lead',
            title: 'Novo Lead',
            body: t.contact_name || t.display_phone || 'Desconhecido',
            time: t.first_inbound_at,
          });
        }
      }

      // Unread messages — pula quem já aparece como "Novo Lead" (mesma thread)
      if (threadsRes.status === 'fulfilled' && threadsRes.value.data) {
        for (const t of threadsRes.value.data) {
          if (leadThreadIds.has(t.id)) continue;
          collected.push({
            id: `thread-${t.id}`,
            type: 'message',
            title: t.contact_name || 'Lead',
            body: t.last_message || 'Nova mensagem',
            time: t.updated_at,
          });
        }
      }

      // Today's appointments
      if (apptRes.status === 'fulfilled' && apptRes.value.data) {
        for (const a of apptRes.value.data) {
          collected.push({
            id: `appt-${a.id}`,
            type: 'appointment',
            title: 'Agendamento Hoje',
            body: `${a.summary || 'Consulta'} com ${a.client_name}${a.time ? ` às ${a.time.slice(0, 5)}` : ''}`,
          });
        }
      }
    } catch {}

    setNotifications(collected);
    setLoading(false);
  }, [user?.id]);

  // Fetch on mount and whenever unreadTotal changes (real-time messages)
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, unreadTotal]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const markAllRead = () => {
    const newSet = new Set([...Array.from(readIds), ...notifications.map(n => n.id)]);
    setReadIds(newSet);
    persistRead(newSet);
  };

  const markOneRead = (id: string) => {
    const newSet = new Set(readIds);
    newSet.add(id);
    setReadIds(newSet);
    persistRead(newSet);
  };

  const handleAction = (n: AppNotification) => {
    markOneRead(n.id);
    setIsOpen(false);
    if (n.type === 'message') onTabChange('inbox');
    else if (n.type === 'lead') onTabChange('inbox');
    else if (n.type === 'appointment') onTabChange('schedules');
    else if (n.type === 'warning') onTabChange('dashboard');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setIsOpen(v => !v); if (!isOpen) fetchNotifications(); }}
        className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[200]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">Notificações</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    <Check size={11} /> Marcar tudo
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[360px] overflow-y-auto">
              {loading ? (
                <div className="py-10 flex justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-medium">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map(n => {
                  const isRead = readIds.has(n.id);
                  const styles = TYPE_STYLES[n.type];
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleAction(n)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${isRead ? 'opacity-60' : ''}`}
                    >
                      <div className={`mt-0.5 w-7 h-7 rounded-full ${styles.bg} flex items-center justify-center shrink-0`}>
                        {styles.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold text-gray-900 truncate ${!isRead ? 'font-bold' : ''}`}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{n.body}</p>
                        {n.time && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            {formatDistanceToNow(new Date(n.time), { addSuffix: true, locale: ptBR })}
                          </p>
                        )}
                      </div>
                      {!isRead && (
                        <div className={`mt-1.5 w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
