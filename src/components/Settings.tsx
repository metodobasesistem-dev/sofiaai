import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Building2, CreditCard, Zap, Globe, Loader2, Users, Clock, Plug, MessageSquare, Bot, SlidersHorizontal, XCircle, Clock3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

import { getUserProfile, updateUserProfile, UserProfile } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { podeVer } from '../lib/acesso';
import { useFeatureContext } from '../contexts/FeatureFlagContext';

import SettingsNav, { type SecaoDeConfiguracao } from './settings/SettingsNav';
import EmpresaSection from './settings/EmpresaSection';
import AssinaturaSection from './settings/AssinaturaSection';
import IASection from './settings/IASection';
import LeadOriginSettings from './LeadOriginSettings';
import CamposClienteSection from './settings/CamposClienteSection';
import MotivosPerdaManager from './settings/MotivosPerdaManager';
import ModelosFollowUpSection from './settings/ModelosFollowUpSection';
import type { SettingsFormData } from './settings/types';

// Telas grandes que passaram a morar aqui. Continuam em chunks próprios: se
// virassem import estático, abrir Configurações baixaria Agentes e Integrações
// junto, mesmo para quem só quer trocar o nome da empresa.
const Professionals = lazy(() => import('./Professionals'));
const Agents = lazy(() => import('./Agents'));
const QuickReplies = lazy(() => import('./QuickReplies'));
const Availability = lazy(() => import('./Availability'));
const Integrations = lazy(() => import('./Integrations'));

const CarregandoSecao = () => (
  <div className="h-64 w-full flex items-center justify-center text-primary-500">
    <Loader2 size={32} className="animate-spin" />
  </div>
);

/**
 * Configurações — casca de navegação.
 *
 * Este arquivo só resolve três coisas: qual seção está aberta, o perfil que as
 * seções compartilham, e o desenho do rail. Todo conteúdo mora em
 * components/settings/*. Antes eram 1.100 linhas com as quatro abas inline, o
 * que não sobrevive à lista de seções que ainda vai crescer.
 *
 * Os `id` das seções são os mesmos de antes ('account', 'subscription',
 * 'ai_config', 'lead_origin'): eles estão na URL, e renomeá-los quebraria
 * links salvos. Só os rótulos mudaram.
 */

/**
 * As seções do rail, na ordem em que aparecem.
 *
 * `flag` e `minPlan` seguem a mesma regra do menu lateral, por lib/acesso:
 * mover uma tela para cá não pode fazer um cliente Starter passar a enxergar
 * o que o plano dele não cobre.
 */
const SECOES: (SecaoDeConfiguracao & { flag?: string; minPlan?: string })[] = [
  { id: 'account', label: 'Empresa', descricao: 'Informações gerais da sua empresa', icon: <Building2 size={18} /> },
  { id: 'professionals', label: 'Equipe', descricao: 'Profissionais que atendem na sua clínica', icon: <Users size={18} />, flag: 'crm' },
  { id: 'agents', label: 'Agentes de IA', descricao: 'Quem atende por você no WhatsApp', icon: <Bot size={18} />, minPlan: 'Pro' },
  { id: 'quick_replies', label: 'Respostas Rápidas', descricao: 'Atalhos de mensagem para o atendimento', icon: <MessageSquare size={18} />, minPlan: 'Starter' },
  { id: 'follow_up_templates', label: 'Modelos de Follow-up', descricao: 'Mensagens prontas para envio programado', icon: <Clock3 size={18} />, minPlan: 'Starter' },
  { id: 'lead_origin', label: 'Canais / Origens', descricao: 'De onde vêm os seus leads', icon: <Globe size={18} /> },
  { id: 'client_fields', label: 'Campos da Ficha', descricao: 'O que a ficha do cliente acompanha no seu ramo', icon: <SlidersHorizontal size={18} />, flag: 'crm' },
  { id: 'loss_reasons', label: 'Motivos de Perda', descricao: 'Por que um lead não avançou', icon: <XCircle size={18} /> },
  { id: 'availability', label: 'Disponibilidade', descricao: 'Horários em que a agenda aceita marcação', icon: <Clock size={18} />, flag: 'agendas', minPlan: 'Pro' },
  { id: 'integrations', label: 'Integrações', descricao: 'WhatsApp, Google e demais conexões', icon: <Plug size={18} />, flag: 'official_api' },
  { id: 'ai_config', label: 'Configuração IA', descricao: 'Provedor de IA e chaves de API', icon: <Zap size={18} /> },
  { id: 'subscription', label: 'Assinatura', descricao: 'Seu plano e faturamento', icon: <CreditCard size={18} /> },
];

const FORM_VAZIO: SettingsFormData = {
  nome_completo: '', email: '', nome_empresa: '', whatsapp_organizacao: '',
  descricao_empresa: '', produtos_servicos: '', faq: '', links_importantes: '',
  notification_phone: '', llm_provider: '', openai_api_key: '', gemini_api_key: '',
  default_ai_model: '', sofia_prompt: '', sofia_active: true,
};

export default function Settings({
  initialSubTab = 'account',
  onSubTabChange,
  user,
  role,
  plano,
}: {
  initialSubTab?: string;
  /** Avisa o App para refletir a sub-aba na URL (/settings/ai_config). */
  onSubTabChange?: (subTab: string) => void;
  /** Necessários pelas telas que passaram a morar aqui. */
  user?: any;
  role?: string | null;
  plano?: string | null;
}) {
  const { flags = {} } = useFeatureContext();

  const secoesVisiveis = useMemo(
    () => SECOES.filter(s => podeVer(s, { role, plano, flags })),
    [role, plano, flags]
  );
  const [activeSubTab, setActiveSubTabState] = useState(initialSubTab || 'account');

  // Toda troca de seção passa por aqui para que estado e URL não divirjam.
  const setActiveSubTab = (subTab: string) => {
    setActiveSubTabState(subTab);
    onSubTabChange?.(subTab);
  };

  // Seção vinda da URL (link direto, voltar do navegador). Escreve só no
  // estado: avisar o App aqui devolveria a navegação que acabou de chegar.
  useEffect(() => {
    setActiveSubTabState(initialSubTab);
  }, [initialSubTab]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<SettingsFormData>(FORM_VAZIO);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);

  // Perfil atualizado em tempo real (Stripe, painel admin).
  useEffect(() => {
    let subscription: any;

    const setupProfileListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      subscription = supabase
        .channel('profile_changes')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
          (payload) => {
            const newData = payload.new as UserProfile;

            // Só avisa se o plano REALMENTE mudou.
            setProfile(prev => {
              if (prev && prev.plano !== newData.plano) {
                toast.success(`Plano atualizado: ${newData.plano}`);
              }
              return newData;
            });

            setFormData(prev => ({
              ...prev,
              nome_completo: newData.nome_completo || prev.nome_completo,
              nome_empresa: newData.nome_empresa || prev.nome_empresa,
            }));
          }
        )
        .subscribe();
    };

    setupProfileListener();

    return () => {
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const profileData = await getUserProfile();
        if (profileData) {
          setProfile(profileData);
          setFormData({
            nome_completo: profileData.nome_completo || '',
            email: profileData.email || '',
            nome_empresa: profileData.nome_empresa || '',
            whatsapp_organizacao: profileData.whatsapp_organizacao || '',
            descricao_empresa: profileData.descricao_empresa || '',
            produtos_servicos: profileData.produtos_servicos || '',
            faq: profileData.faq || '',
            links_importantes: profileData.links_importantes || '',
            notification_phone: profileData.notification_phone || '',
            llm_provider: profileData.llm_provider || '',
            openai_api_key: profileData.openai_api_key || '',
            gemini_api_key: profileData.gemini_api_key || '',
            default_ai_model: profileData.default_ai_model || '',
            sofia_prompt: profileData.sofia_prompt || '',
            sofia_active: profileData.sofia_active ?? true,
          });
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
        toast.error('Erro ao carregar perfil');
      }
      setIsLoading(false);
    };

    // Destrava a tela se a busca do perfil pendurar.
    const safetyTimeout = setTimeout(() => {
      console.warn('[Settings] Safety unlock triggered after 5s');
      setIsLoading(false);
    }, 5000);

    fetchData().then(() => clearTimeout(safetyTimeout));
    return () => clearTimeout(safetyTimeout);
  }, []);

  /**
   * Um único salvamento para Empresa e Configuração IA: as duas editam campos
   * do mesmo perfil, e o PATCH manda o formulário inteiro.
   */
  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      await updateUserProfile({
        nome_completo: formData.nome_completo,
        nome_empresa: formData.nome_empresa,
        whatsapp_organizacao: formData.whatsapp_organizacao,
        descricao_empresa: formData.descricao_empresa,
        produtos_servicos: formData.produtos_servicos,
        faq: formData.faq,
        links_importantes: formData.links_importantes,
        notification_phone: formData.notification_phone,
        llm_provider: formData.llm_provider,
        openai_api_key: formData.openai_api_key,
        gemini_api_key: formData.gemini_api_key,
        default_ai_model: formData.default_ai_model,
        sofia_prompt: formData.sofia_prompt,
        sofia_active: formData.sofia_active,
      });
      toast.success('Perfil atualizado com sucesso!');
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Erro ao atualizar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubscribe = async (priceId: string) => {
    try {
      setIsSubscribing(priceId);
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/v2/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Erro ao criar sessão de checkout');
      }
    } catch (error: any) {
      console.error('[Subscribe] Error:', error);
      toast.error(error.message);
    } finally {
      setIsSubscribing(null);
    }
  };

  const handleLogout = async () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase.auth.token') || key.includes('-auth-token')) {
          localStorage.removeItem(key);
        }
      });

      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      }

      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Logout error:', e);
    } finally {
      window.location.replace('/');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  // Uma seção que o plano não cobre não fica só escondida no rail: chegar
  // nela pela URL cai na primeira seção visível, em vez de tela em branco.
  const secaoAtual =
    secoesVisiveis.find(s => s.id === activeSubTab) || secoesVisiveis[0] || SECOES[0];
  const secaoAberta = secaoAtual.id;

  return (
    <div className="flex flex-col md:flex-row md:items-start gap-8">
      {/* Coluna da esquerda: título da página + rail. */}
      <div className="w-full md:w-60 md:shrink-0 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500">Administração da conta</p>
        </div>

        <SettingsNav secoes={secoesVisiveis} ativa={secaoAberta} onSelecionar={setActiveSubTab} />
      </div>

      {/* Painel de conteúdo. */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{secaoAtual.label}</h2>
          <p className="text-sm text-gray-500">{secaoAtual.descricao}</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={secaoAberta}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {secaoAberta === 'account' && (
              <EmpresaSection
                formData={formData}
                setFormData={setFormData}
                onSave={handleSaveProfile}
                isSaving={isSaving}
                onLogout={handleLogout}
              />
            )}

            <Suspense fallback={<CarregandoSecao />}>
              {secaoAberta === 'professionals' && <Professionals />}
              {secaoAberta === 'agents' && <Agents user={user} role={role} />}
              {secaoAberta === 'quick_replies' && <QuickReplies />}
              {secaoAberta === 'availability' && <Availability />}
              {secaoAberta === 'integrations' && <Integrations user={user} role={role} />}
            </Suspense>

            {secaoAberta === 'lead_origin' && <LeadOriginSettings />}

            {secaoAberta === 'client_fields' && <CamposClienteSection />}

            {secaoAberta === 'loss_reasons' && <MotivosPerdaManager />}

            {secaoAberta === 'follow_up_templates' && <ModelosFollowUpSection />}

            {secaoAberta === 'ai_config' && (
              <IASection
                formData={formData}
                setFormData={setFormData}
                onSave={handleSaveProfile}
                isSaving={isSaving}
              />
            )}

            {secaoAberta === 'subscription' && (
              <AssinaturaSection
                profile={profile}
                billingCycle={billingCycle}
                setBillingCycle={setBillingCycle}
                onSubscribe={handleSubscribe}
                isSubscribing={isSubscribing}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
