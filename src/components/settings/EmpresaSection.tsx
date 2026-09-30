import React, { useState } from 'react';
import { User, Zap, Lock, Key, Smartphone, LogOut, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import PWADiagnostic from '../PWADiagnostic';
import { supabase } from '../../lib/supabase';
import type { SecaoDePerfilProps } from './types';

/** Cartão branco com cabeçalho — a moldura de toda seção de Configurações. */
export const Cartao: React.FC<{
  children: React.ReactNode;
  titulo: string;
  descricao: string;
  icon: React.ReactNode;
  tomDoIcone?: string;
}> = ({ children, titulo, descricao, icon, tomDoIcone = 'bg-primary-50 text-primary-600' }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="p-6 border-b border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tomDoIcone}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{titulo}</h3>
          <p className="text-sm text-gray-500">{descricao}</p>
        </div>
      </div>
    </div>
    {children}
  </div>
);

const campo =
  'w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm';
const rotulo = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2';
const botaoSalvar =
  'px-6 py-2.5 bg-primary-500/50 hover:bg-primary-500 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50';

export default function EmpresaSection({
  formData,
  setFormData,
  onSave,
  isSaving,
  onLogout,
}: SecaoDePerfilProps & { onLogout: () => void }) {
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  /** Tamanho mínimo da nova senha. É o que o campo promete ao usuário. */
  const MINIMO_DA_SENHA = 8;

  const trocarSenha = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!formData.email) {
      toast.error('Não foi possível identificar sua conta. Recarregue a página.');
      return;
    }
    if (!currentPassword) {
      toast.error('Informe a senha atual.');
      return;
    }
    if (newPassword.length < MINIMO_DA_SENHA) {
      toast.error(`A nova senha precisa ter ao menos ${MINIMO_DA_SENHA} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('A confirmação não bate com a nova senha.');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('A nova senha é igual à atual.');
      return;
    }

    setTrocandoSenha(true);
    try {
      // O Supabase troca a senha da sessão aberta SEM pedir a senha atual.
      // Conferimos por reautenticação: sem isso, quem passasse por um
      // computador com a sessão esquecida aberta trocaria a senha do dono.
      const { error: erroDeLogin } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: currentPassword,
      });
      if (erroDeLogin) {
        toast.error('Senha atual incorreta.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Senha atualizada.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar a senha');
    } finally {
      setTrocandoSenha(false);
    }
  };

  return (
    <div className="space-y-8">
      <Cartao titulo="Perfil" descricao="Gerencie suas informações pessoais e profissionais" icon={<User size={20} />}>
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={rotulo}>Nome completo</label>
              <input
                type="text"
                value={formData.nome_completo}
                onChange={e => setFormData({ ...formData, nome_completo: e.target.value })}
                placeholder="Seu nome completo"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Email</label>
              <input
                type="email"
                disabled
                value={formData.email}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 outline-none text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className={rotulo}>Nome da Organização</label>
              <input
                type="text"
                value={formData.nome_empresa}
                onChange={e => setFormData({ ...formData, nome_empresa: e.target.value })}
                placeholder="Nome da sua empresa"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>WhatsApp da Organização</label>
              <input
                type="text"
                value={formData.whatsapp_organizacao}
                onChange={e => setFormData({ ...formData, whatsapp_organizacao: e.target.value })}
                placeholder="Ex: 5511999999999"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Telefone para Notificações (WhatsApp)</label>
              <input
                type="text"
                value={formData.notification_phone}
                onChange={e => setFormData({ ...formData, notification_phone: e.target.value })}
                placeholder="Ex: 5511999999999"
                className={campo}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={onSave} disabled={isSaving} className={botaoSalvar}>
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Salvar alterações
            </button>
          </div>
        </div>
      </Cartao>

      <Cartao
        titulo="Perfil da Empresa (Conhecimento da IA)"
        descricao="Forneça detalhes para que a IA atenda seus clientes com precisão"
        icon={<Zap size={20} />}
      >
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className={rotulo}>Descrição da Empresa</label>
              <textarea
                value={formData.descricao_empresa}
                onChange={e => setFormData({ ...formData, descricao_empresa: e.target.value })}
                placeholder="Ex: Somos uma agência de marketing digital focada em tráfego pago para negócios locais..."
                rows={3}
                className={`${campo} resize-none`}
              />
            </div>
            <div>
              <label className={rotulo}>Produtos e Serviços</label>
              <textarea
                value={formData.produtos_servicos}
                onChange={e => setFormData({ ...formData, produtos_servicos: e.target.value })}
                placeholder="Ex: Gestão de Google Ads (R$ 500/mês), Criação de Landing Pages (R$ 800)..."
                rows={3}
                className={`${campo} resize-none`}
              />
            </div>
            <div>
              <label className={rotulo}>FAQ (Perguntas Frequentes)</label>
              <textarea
                value={formData.faq}
                onChange={e => setFormData({ ...formData, faq: e.target.value })}
                placeholder="Ex: P: Qual o horário? R: Seg a Sex das 09h às 18h..."
                rows={4}
                className={`${campo} resize-none`}
              />
            </div>
            <div>
              <label className={rotulo}>Links Importantes</label>
              <input
                type="text"
                value={formData.links_importantes}
                onChange={e => setFormData({ ...formData, links_importantes: e.target.value })}
                placeholder="Ex: Site: www.site.com, Localização: bit.ly/mapa..."
                className={campo}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={onSave} disabled={isSaving} className={botaoSalvar}>
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Salvar Conhecimento
            </button>
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Segurança" descricao="Configure suas opções de segurança e acesso" icon={<Lock size={20} />}>
        <div className="p-8 space-y-6">
          <div className="max-w-md">
            <label className={rotulo}>Senha atual</label>
            <input
              type="password"
              value={passwordData.currentPassword}
              onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              placeholder="Sua senha atual"
              className={campo}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={rotulo}>Nova senha</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Confirmar nova senha</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Repita a nova senha"
                className={campo}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={trocarSenha}
              disabled={trocandoSenha}
              className={`${botaoSalvar} px-6 py-2.5`}
            >
              {trocandoSenha ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />}
              Atualizar senha
            </button>
          </div>
        </div>
      </Cartao>

      <PWADiagnostic />

      <div className="bg-primary-50 rounded-2xl border border-primary-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
            <Smartphone size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary-900">Aplicativo Mobile</h3>
            <p className="text-sm text-primary-600/70">
              Instale a Sofia na sua tela inicial para acesso rápido e notificações melhores.
            </p>
          </div>
        </div>
        <button
          id="install-button"
          onClick={async () => {
            const promptEvent = (window as any).deferredPrompt;
            if (promptEvent) {
              promptEvent.prompt();
              const { outcome } = await promptEvent.userChoice;
              console.log(`[PWA] User response to the install prompt: ${outcome}`);
              (window as any).deferredPrompt = null;
            } else {
              toast.info(
                'Para instalar: Clique nos 3 pontos do navegador e selecione "Instalar Aplicativo" ou "Adicionar à tela de início".'
              );
            }
          }}
          className="px-8 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 flex items-center gap-2"
        >
          <Smartphone size={18} />
          Instalar Aplicativo
        </button>
      </div>

      <div className="bg-red-50 rounded-2xl border border-red-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
            <LogOut size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-900">Encerrar Sessão</h3>
            <p className="text-sm text-red-600/70">Desconecte sua conta com segurança deste dispositivo.</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="px-8 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center gap-2"
        >
          <LogOut size={18} />
          Sair da Conta (Logout)
        </button>
      </div>
    </div>
  );
}
