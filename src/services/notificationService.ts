
export class NotificationService {
  private static instance: NotificationService;
  private audio: HTMLAudioElement | null = null;
  private originalTitle: string = document.title;
  private notificationTimeout: any = null;

  private constructor() {
    // Initialize audio with a clean notification sound
    this.audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
    this.audio.load();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    
    if (Notification.permission === 'granted') return true;
    
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    
    return false;
  }

  public playSound() {
    try {
      if (this.audio) {
        this.audio.currentTime = 0;
        this.audio.play().catch(e => console.warn('[NotificationService] Audio play failed:', e));
      }
    } catch (e) {
      console.warn('[NotificationService] Audio error:', e);
    }
  }

  public showNotification(title: string, body: string, icon?: string, onClick?: () => void) {
    this.playSound();
    this.updateTitle(title);

    // Na web (Desktop), se estiver aberto, o NotificationContext lida com isso.
    // Mas no celular, queremos garantir que o SW mostre se possível.
    if (Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      const notification = new Notification(title, {
        body,
        icon: icon || './sofia-face.png',
        badge: './sofiamini.png',
        tag: 'sofia-chat-msg',
        renotify: true
      });


      notification.onclick = () => {
        window.focus();
        if (onClick) onClick();
        notification.close();
      };
    }
  }

  public async subscribeToPush(): Promise<boolean> {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[NotificationService] Push not supported');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Chave pública VAPID (Deve ser a mesma do backend)
      const VAPID_PUBLIC_KEY = 'BDOHAFAPvb5cd6oJIFLaVFgQSjdWVZQRXk-XzGfQOSeUOiI-n6jv0aoouxhsrXnjJJqkMd7a4f6DN4mnVABAgjg';
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      console.log('[NotificationService] Push Subscribed:', subscription);

      // Envia para o backend
      const { data: { session } } = await (await import('../lib/supabase')).supabase.auth.getSession();
      
      const response = await fetch('/api/v2/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(subscription)
      });

      return response.ok;
    } catch (err) {
      console.error('[NotificationService] Push Subscription failed:', err);
      return false;
    }
  }

  private urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  private updateTitle(newTitle: string) {
    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    
    document.title = `🔔 ${newTitle}`;
    
    this.notificationTimeout = setTimeout(() => {
      document.title = this.originalTitle;
    }, 5000);
  }
}

export const notificationService = NotificationService.getInstance();
