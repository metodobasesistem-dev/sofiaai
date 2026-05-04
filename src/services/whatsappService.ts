import { supabase } from '../lib/supabase';

const API_BASE_URL = '/api/sessions';

export interface WhatsAppStatusResponse {
  status: 'connected' | 'disconnected' | 'connecting' | 'waiting';
  qr?: string;
}

/**
 * Initiate a WhatsApp connection (get QR code).
 */
export const connectWhatsApp = async (): Promise<{ success: boolean; qr?: string }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const response = await fetch(`${API_BASE_URL}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: user.id })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to initiate WhatsApp connection');
  }

  return response.json();
};

/**
 * Listen to WhatsApp session status in real-time.
 * In Supabase, we listen to the profiles table.
 */
export const listenToWhatsAppSession = (userId: string, callback: (data: WhatsAppStatusResponse) => void) => {
  // Listen for changes in the profiles table for this user
  const channel = supabase
    .channel(`profile-changes-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`
      },
      (payload) => {
        const data = payload.new;
        callback({
          status: data.whatsapp_status,
          qr: data.whatsapp_qr // We might need to store QR in profile temporarily or handle differently
        });
      }
    )
    .subscribe();

  // Also fetch initial status
  supabase
    .from('profiles')
    .select('whatsapp_status, whatsapp_qr')
    .eq('id', userId)
    .single()
    .then(({ data }) => {
      if (data) {
        callback({ 
          status: data.whatsapp_status as any,
          qr: data.whatsapp_qr
        });
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Get the current WhatsApp connection status via API.
 */
export const getWhatsAppStatus = async (): Promise<WhatsAppStatusResponse> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const response = await fetch(`${API_BASE_URL}/status/${user.id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch WhatsApp status');
  }

  return response.json();
};

/**
 * Send a WhatsApp message via the backend API.
 */
export const sendMessage = async (to: string, message: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const response = await fetch('/api/messages/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: user.id,
      to,
      message,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to send message');
  }

  return response.json();
};

/**
 * Disconnect/Logout WhatsApp session.
 */
export const disconnectWhatsApp = async (): Promise<{ success: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const response = await fetch(`${API_BASE_URL}/disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: user.id })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to disconnect WhatsApp');
  }

  return response.json();
};

/**
 * Trigger contact synchronization from existing threads.
 */
export const syncContacts = async (): Promise<{ success: boolean; synced: number }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const response = await fetch('/api/v2/contacts/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: user.id })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to sync contacts');
  }

  return response.json();
};
