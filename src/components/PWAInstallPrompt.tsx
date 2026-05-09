import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, Share, PlusSquare, Smartphone, Check } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect platform
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    
    if (isIos) setPlatform('ios');
    else if (isAndroid) setPlatform('android');

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a short delay
      if (!localStorage.getItem('pwa_prompt_dismissed')) {
        setTimeout(() => setIsVisible(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show prompt manually if not dismissed
    if (isIos && !localStorage.getItem('pwa_prompt_dismissed')) {
      setTimeout(() => setIsVisible(true), 3000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  const dismissPrompt = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (isInstalled || !isVisible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-x-4 bottom-6 z-[200] flex justify-center pointer-events-none md:hidden">
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-6 pointer-events-auto overflow-hidden relative"
        >
          {/* Decorative Background */}
          <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
            <Smartphone size={120} className="-mr-10 -mt-10 rotate-12" />
          </div>

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary-600 p-0.5 shadow-lg shadow-primary-200 overflow-hidden">
                  <img src="/sofiamini.png" alt="Sofia" className="w-full h-full object-cover rounded-[14px]" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg tracking-tight">Chat Sofia</h3>
                  <p className="text-xs text-slate-500 font-medium">Instale para acesso rápido</p>
                </div>
              </div>
              <button 
                onClick={dismissPrompt}
                className="p-2 text-slate-300 hover:text-slate-500 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {platform === 'ios' ? (
              <div className="space-y-4">
                <p className="text-[13px] text-slate-600 leading-relaxed">
                  Para instalar no seu iPhone:
                </p>
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                  <div className="flex items-center gap-3 text-sm text-slate-700 font-bold">
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100">
                      <Share size={14} className="text-primary-500" />
                    </div>
                    <span>1. Toque em "Compartilhar"</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-700 font-bold">
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100">
                      <PlusSquare size={14} className="text-primary-500" />
                    </div>
                    <span>2. "Adicionar à Tela de Início"</span>
                  </div>
                </div>
                <button 
                  onClick={dismissPrompt}
                  className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all"
                >
                  Entendi
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[13px] text-slate-600 leading-relaxed">
                  Adicione o **Chat Sofia** à sua tela inicial para uma experiência de aplicativo completa e mais rápida.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={dismissPrompt}
                    className="flex-1 py-3.5 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all border border-slate-100"
                  >
                    Agora não
                  </button>
                  <button 
                    onClick={handleInstall}
                    className="flex-[2] py-3.5 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-200"
                  >
                    <Download size={16} />
                    Instalar Agora
                  </button>
                </div>
              </div>
            )}
            
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] opacity-60">
              <Check size={12} strokeWidth={3} /> App Seguro e Leve
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
