import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface ContactAvatarProps {
  url?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Quando fornecido, ao falhar o carregamento da foto o componente invalida
   *  o cache no backend. O Supabase Realtime notifica o pai com a URL nova
   *  (ou null, mostrando as iniciais). */
  threadId?: string;
}

const getAvatarColor = (name: string) => {
  const colors = [
    '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
    '#16a34a', '#0891b2', '#4f46e5', '#9333ea', '#c026d3'
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const ContactAvatar: React.FC<ContactAvatarProps> = ({
  url,
  name,
  size = 'md',
  className = '',
  threadId
}) => {
  const [error, setError] = useState(false);

  // Reseta o estado de erro quando a URL muda (ex: Supabase Realtime entregou
  // uma URL nova após o refresh, ou limpou a URL expirada para null).
  useEffect(() => {
    setError(false);
  }, [url]);

  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-[12px]',
    lg: 'w-12 h-12 text-[14px]',
    xl: 'w-28 h-28 text-[32px]'
  };

  const showInitials = !url || error;

  // Chamado quando a tag <img> falha em carregar a URL.
  // Mostra as iniciais imediatamente e, se tiver threadId, invalida o cache
  // no backend em background para que o Realtime entregue uma URL nova.
  const handleError = useCallback(async () => {
    setError(true);

    if (!threadId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Fire-and-forget: não bloqueia a UI
      fetch('/api/whatsapp/threads/refresh-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ threadId })
      }).catch(() => {
        // Silencioso — foto é opcional, UI já mostra as iniciais
      });
    } catch {
      // Silencioso — getSession pode falhar se sessão expirou
    }
  }, [threadId]);

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white border border-slate-200/50 overflow-hidden shrink-0 shadow-sm transition-all ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: showInitials ? getAvatarColor(name) : 'transparent' }}
    >
      {!showInitials ? (
        <img
          src={url!}
          alt={name}
          onError={handleError}
          loading="lazy"
          className="w-full h-full object-cover animate-in fade-in duration-300"
        />
      ) : (
        <span className="font-bold tracking-tighter">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
};
