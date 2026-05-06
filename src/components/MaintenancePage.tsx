import React from 'react';
import { motion } from 'motion/react';
import { Hammer, Bot, ShieldAlert, Sparkles } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute top-0 -left-20 w-[500px] h-[500px] bg-primary-600/10 blur-[120px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-0 -right-20 w-[500px] h-[500px] bg-primary-600/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full text-center relative z-10"
      >
        <div className="mb-10 relative inline-block">
          <div className="w-24 h-24 bg-gradient-to-br from-primary-600 to-primary-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-primary-500/20 relative z-10">
            <Hammer size={48} className="animate-bounce" />
          </div>
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="absolute -inset-4 border-2 border-dashed border-white/10 rounded-full"
          />
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">
          Pausa para <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-400">Evolução</span>
        </h1>
        
        <p className="text-slate-400 text-lg md:text-xl font-medium mb-12 leading-relaxed">
          Estamos aprimorando a Sofia para deixá-la ainda mais potente. Voltamos em alguns instantes com novidades incríveis!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
          {[
            { icon: <Bot size={20} />, title: "Novos Cérebro", color: "text-primary-400" },
            { icon: <ShieldAlert size={20} />, title: "Mais Segurança", color: "text-primary-400" },
            { icon: <Sparkles size={20} />, title: "Novas IAs", color: "text-emerald-400" }
          ].map((item, i) => (
            <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-3">
              <div className={`${item.color}`}>{item.icon}</div>
              <span className="text-xs font-black uppercase tracking-widest text-slate-300">{item.title}</span>
            </div>
          ))}
        </div>

        <div className="p-1 bg-gradient-to-r from-primary-500/20 to-primary-500/20 rounded-full inline-flex items-center gap-3 px-6 py-2 border border-white/5">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Nossa equipe está trabalhando agora</span>
        </div>
      </motion.div>
    </div>
  );
}
