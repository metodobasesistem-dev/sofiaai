
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

    if (Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      const notification = new Notification(title, {
        body,
        icon: icon || '/sofiamini.png',
        badge: '/sofiamini.png',
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

  private updateTitle(newTitle: string) {
    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    
    document.title = `🔔 ${newTitle}`;
    
    this.notificationTimeout = setTimeout(() => {
      document.title = this.originalTitle;
    }, 5000);
  }
}

export const notificationService = NotificationService.getInstance();
