import React from 'react';
import { Zap, ShieldCheck, Check, X, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import type { UserProfile } from '../../services/supabaseService';

interface PlanCardProps {
  name: string;
  price: string;
  /**
   * Prefixos: '[-]' risca o item (não incluso no plano) e '[H]' destaca como
   * diferencial. Faltava no tipo, o que fazia os quatro usos abaixo darem
   * erro de compilação.
   */
  benefits: string[];
  buttonText: string;
  popular?: boolean;
  billingCycle: 'monthly' | 'yearly';
  priceId: string;
  onSubscribe: (priceId: string) => void;
  isLoading?: boolean;
}

const PlanCard = ({
  name, price, benefits, buttonText, popular, billingCycle, priceId, onSubscribe, isLoading,
}: PlanCardProps) => (
  <div
    className={`relative bg-white p-8 rounded-2xl border-2 transition-all flex flex-col h-full
    ${popular ? 'border-primary-600 shadow-xl shadow-primary-100 scale-105 z-10' : 'border-gray-100 shadow-sm hover:border-gray-200'}`}
  >
    {popular && (
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">
        Mais Popular
      </div>
    )}

    <div className="mb-6">
      <h3 className="text-xl font-bold text-gray-900">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-black text-gray-900">{price}</span>
        <span className="text-gray-500 text-sm">{billingCycle === 'monthly' ? '/mês' : '/ano'}</span>
      </div>
    </div>

    <ul className="space-y-4 mb-8 flex-1">
      {benefits.map((benefit, index) => {
        const isNegative = benefit.startsWith('[-]');
        const isHighlighted = benefit.startsWith('[H]');
        const text = benefit.replace('[-]', '').replace('[H]', '');

        return (
          <li
            key={index}
            className={`flex items-start gap-3 text-sm transition-all
              ${isNegative ? 'text-gray-400 line-through opacity-50' : 'text-gray-600 font-medium'}
              ${isHighlighted ? 'bg-primary-50/50 p-3 rounded-xl border border-primary-100/50 shadow-sm' : ''}
            `}
          >
            <div
              className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0
              ${isNegative ? 'bg-gray-100 text-gray-400' : isHighlighted ? 'bg-primary-600 text-white' : popular ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}
            >
              {isNegative ? <X size={12} /> : isHighlighted ? <Sparkles size={12} /> : <Check size={12} />}
            </div>
            <div className="flex flex-col">
              <span className={isHighlighted ? 'text-primary-900 font-bold' : ''}>{text}</span>
              {isHighlighted && (
                <span className="text-[9px] text-primary-500 font-black uppercase tracking-widest mt-0.5">
                  Diferencial Único
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>

    <button
      onClick={() => onSubscribe(priceId)}
      disabled={isLoading}
      className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2
      ${popular
        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md shadow-primary-200'
        : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50'}
      disabled:opacity-50
    `}
    >
      {isLoading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <>
          {buttonText}
          <ArrowRight size={16} />
        </>
      )}
    </button>
  </div>
);

export default function AssinaturaSection({
  profile,
  billingCycle,
  setBillingCycle,
  onSubscribe,
  isSubscribing,
}: {
  profile: UserProfile | null;
  billingCycle: 'monthly' | 'yearly';
  setBillingCycle: (c: 'monthly' | 'yearly') => void;
  onSubscribe: (priceId: string) => void;
  isSubscribing: string | null;
}) {
  const mensal = billingCycle === 'monthly';

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-8 text-white shadow-xl shadow-primary-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
            <Zap size={32} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-primary-100 text-xs font-bold uppercase tracking-widest">Plano Atual</span>
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                {profile?.plano || 'Starter'}
              </span>
            </div>
            <h2 className="text-2xl font-bold">Você está no plano {profile?.plano || 'Starter'}</h2>
            <p className="text-primary-100 text-sm opacity-80 mt-1">
              {profile?.subscription_ends_at
                ? (() => {
                    const date = new Date(profile.subscription_ends_at);
                    const diff = date.getTime() - Date.now();
                    const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
                    const formattedDate = new Intl.DateTimeFormat('pt-BR', {
                      day: 'numeric',
                      month: 'long',
                    }).format(date);
                    return `Vence em ${formattedDate} (${days} ${days === 1 ? 'dia restante' : 'dias restantes'})`;
                  })()
                : 'Sua assinatura está ativa.'}
            </p>
          </div>
        </div>
        <button className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-xl text-sm font-bold transition-all">
          Cancelar Assinatura
        </button>
      </div>

      <div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Fazer Upgrade</h3>
              <p className="text-sm text-gray-500">Escolha o plano ideal para escalar seu atendimento.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-gray-100 p-1.5 rounded-2xl w-fit self-center">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mensal ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative ${!mensal ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Anual
              <span className="absolute -top-3 -right-3 bg-emerald-500 text-white text-[8px] px-2 py-1 rounded-full animate-bounce shadow-lg shadow-emerald-500/20">
                2 MESES GRÁTIS
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
          <PlanCard
            name="Starter"
            price={mensal ? 'R$ 37,90' : 'R$ 379'}
            billingCycle={billingCycle}
            priceId={mensal ? 'price_1TVBlpJ7F68id5vWe22alNFf' : 'price_1TVBlpJ7F68id5vWZ9h12z8C'}
            onSubscribe={onSubscribe}
            isLoading={isSubscribing === (mensal ? 'price_1TVBlpJ7F68id5vWe22alNFf' : 'price_1TVBlpJ7F68id5vWZ9h12z8C')}
            benefits={[
              'Inbox (Chat Manual)',
              'Dashboard de Métricas',
              'Gestão de Contatos CRM',
              'Até 1 Canal Conectado',
              'Relatórios de Atendimento',
              '[-] Agentes de IA Autônomos',
              '[-] Agendamentos Inteligentes',
              '[-] IA Sofia (Co-piloto)',
              '[-] Campanhas de Marketing',
            ]}
            buttonText={mensal ? 'Assinar Starter' : 'Assinar Anual'}
          />
          <PlanCard
            name="Pro"
            price={mensal ? 'R$ 167,90' : 'R$ 1.679'}
            popular
            billingCycle={billingCycle}
            priceId={mensal ? 'price_1TVBpWJ7F68id5vW4e6Z7KtO' : 'price_1TVBpWJ7F68id5vW98PWOCmw'}
            onSubscribe={onSubscribe}
            isLoading={isSubscribing === (mensal ? 'price_1TVBpWJ7F68id5vW4e6Z7KtO' : 'price_1TVBpWJ7F68id5vW98PWOCmw')}
            benefits={[
              'Tudo do plano Starter',
              'Até 3 Agentes de IA ativos',
              'Agendamentos e Calendário',
              'Treinamento de IA (Texto)',
              'Suporte via E-mail',
              '[-] IA Sofia (Co-piloto)',
              '[-] Campanhas e Broadcast',
              '[-] Acesso a Modelos o1',
            ]}
            buttonText={mensal ? 'Assinar Pro' : 'Assinar Anual'}
          />
          <PlanCard
            name="Elite"
            price={mensal ? 'R$ 327,90' : 'R$ 3.279'}
            billingCycle={billingCycle}
            priceId={mensal ? 'price_1TVBqEJ7F68id5vWHAbZMa8G' : 'price_1TVBqEJ7F68id5vWiRJPCU8a'}
            onSubscribe={onSubscribe}
            isLoading={isSubscribing === (mensal ? 'price_1TVBqEJ7F68id5vWHAbZMa8G' : 'price_1TVBqEJ7F68id5vWiRJPCU8a')}
            benefits={[
              '[H] IA Sofia (Co-piloto Autônomo)',
              'Campanhas e Broadcast',
              'Agentes de IA Ilimitados',
              'Acesso aos modelos o1',
              'Suporte VIP 24/7',
              'Agendamentos Ilimitados',
              'Multimodal (Imagem/Voz)',
            ]}
            buttonText={mensal ? 'Assinar Elite' : 'Assinar Anual'}
          />
        </div>
      </div>
    </div>
  );
}
