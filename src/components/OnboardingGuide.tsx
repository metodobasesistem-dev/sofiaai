import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ArrowRight, Rocket, Plug, UserCircle, FileText, Bot, Users } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { motion } from 'motion/react';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tab: string;
  cta: string;
}

const STEPS: Step[] = [
  {
    id: 'connect_whatsapp',
    title: 'Conectar WhatsApp',
    description: 'Configure seu número de WhatsApp em Integrações para começar a receber e enviar mensagens.',
    icon: <Plug size={16} />,
    tab: 'integrations',
    cta: 'Ir para Integrações',
  },
  {
    id: 'configure_profile',
    title: 'Configurar seu perfil',
    description: 'Preencha o nome da sua empresa, foto e informações de contato em Configurações.',
    icon: <UserCircle size={16} />,
    tab: 'settings',
    cta: 'Ir para Configurações',
  },
  {
    id: 'add_team',
    title: 'Adicionar sua equipe',
    description: 'Convide colaboradores e defina quem vai atender os leads pelo sistema.',
    icon: <Users size={16} />,
    tab: 'professionals',
    cta: 'Ir para Equipe',
  },
  {
    id: 'create_template',
    title: 'Criar primeiro Template',
    description: 'Crie um template de boas-vindas para envios fora da janela de 24h do WhatsApp.',
    icon: <FileText size={16} />,
    tab: 'agents',
    cta: 'Ir para Agentes de IA',
  },
  {
    id: 'setup_ai',
    title: 'Configurar Agente de IA',
    description: 'Ative e configure o agente de IA para atender seus leads automaticamente.',
    icon: <Bot size={16} />,
    tab: 'agents',
    cta: 'Ir para Agentes de IA',
  },
];

interface Props {
  user: SupabaseUser | null;
  onTabChange: (tab: string) => void;
}

export const ONBOARDING_STORAGE_KEY = (userId: string) => `sofia_onboarding_${userId}`;

export default function OnboardingGuide({ user, onTabChange }: Props) {
  const storageKey = ONBOARDING_STORAGE_KEY(user?.id || 'guest');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCompleted(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  const toggle = (id: string) => {
    setCompleted(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const completedCount = STEPS.filter(s => completed[s.id]).length;
  const allDone = completedCount === STEPS.length;
  const pct = Math.round((completedCount / STEPS.length) * 100);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/30 shrink-0">
            <Rocket size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Primeiros Passos</h1>
            <p className="text-sm text-slate-500">Configure a Sofia para começar a converter leads</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
            <span>{completedCount} de {STEPS.length} concluídos</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${allDone ? 'bg-emerald-500' : 'bg-primary'}`}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, index) => {
          const isDone = completed[step.id];
          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`rounded-2xl border p-4 transition-all ${
                isDone
                  ? 'bg-slate-50 border-slate-100'
                  : 'bg-white border-slate-100 hover:border-primary/20 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggle(step.id)}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    isDone ? 'text-emerald-500' : 'text-slate-300 hover:text-primary'
                  }`}
                  title={isDone ? 'Marcar como pendente' : 'Marcar como concluído'}
                >
                  {isDone ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </button>

                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isDone ? 'text-emerald-400' : 'text-slate-400'}`}>
                    Passo {index + 1}
                  </span>
                  <p className={`font-bold text-sm mt-0.5 ${isDone ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {step.title}
                  </p>
                  {!isDone && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.description}</p>
                  )}
                </div>

                {!isDone && (
                  <button
                    onClick={() => onTabChange(step.tab)}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/8 px-3 py-1.5 rounded-xl hover:bg-primary hover:text-white transition-all whitespace-nowrap"
                  >
                    {step.cta} <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {allDone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-6 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl text-center"
        >
          <p className="text-3xl mb-2">🎉</p>
          <p className="font-black text-emerald-800 text-base">Tudo pronto! Sua Sofia está configurada.</p>
          <p className="text-xs text-emerald-600 mt-1">Agora é só começar a converter leads.</p>
          <button
            onClick={() => onTabChange('dashboard')}
            className="mt-4 text-xs font-bold text-white bg-emerald-500 px-5 py-2.5 rounded-xl hover:bg-emerald-600 transition-colors"
          >
            Ir para o Dashboard
          </button>
        </motion.div>
      )}
    </div>
  );
}
