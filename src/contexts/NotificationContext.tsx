import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { notificationService } from '../services/notificationService';
import { User } from '@supabase/supabase-js';

interface NotificationContextType {
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  unreadTotal: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ user: User | null, children: React.ReactNode }> = ({ user, children }) => {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const activeThreadIdRef = useRef<string | null>(null);
  const prevUnreadCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!user) return;

    // 1. Initial fetch to populate unread counts
    const fetchInitialUnread = async () => {
      const { data } = await supabase
        .from('threads')
        .select('id, unread_count')
        .eq('user_id', user.id);
      
      if (data) {
        const counts: Record<string, number> = {};
        let total = 0;
        data.forEach(t => {
          counts[t.id] = t.unread_count || 0;
          total += (t.unread_count || 0);
        });
        prevUnreadCounts.current = counts;
        setUnreadTotal(total);
      }
    };
    fetchInitialUnread();

    // 2. Global Realtime Listener for Threads
    const channel = supabase
      .channel(`global-threads-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'threads', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const threadId = payload.new.id;
            const newCount = payload.new.unread_count || 0;
            const prevCount = prevUnreadCounts.current[threadId] || 0;
            
            const isIncoming = newCount > prevCount;
            const isCurrentThread = threadId === activeThreadIdRef.current;
            const isWindowHidden = document.visibilityState !== 'visible';

            if (isIncoming) {
              // Notification Logic
              if (!isCurrentThread || isWindowHidden) {
                // Determine name (ideally we'd resolve this, but for now we use contact_name)
                const name = payload.new.contact_name || 'Lead WhatsApp';
                notificationService.showNotification(
                  name,
                  payload.new.last_message || 'Nova mensagem',
                  payload.new.profile_picture_url || '/sofiamini.png'
                );
              } else {
                // Just play sound if looking at the chat
                notificationService.playSound();
              }
            }

            // Update local tracking
            prevUnreadCounts.current[threadId] = newCount;
            
            // Recalculate total unread
            const allCounts = Object.values(prevUnreadCounts.current);
            setUnreadTotal(allCounts.reduce((a, b) => a + b, 0));
          } else if (payload.eventType === 'DELETE') {
            delete prevUnreadCounts.current[payload.old.id];
            const allCounts = Object.values(prevUnreadCounts.current);
            setUnreadTotal(allCounts.reduce((a, b) => a + b, 0));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <NotificationContext.Provider value={{ activeThreadId, setActiveThreadId, unreadTotal }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
