/**
 * Estado compartilhado das seções de Configurações.
 *
 * As seções Empresa e Configuração IA editam campos do MESMO perfil e gravam
 * pelo mesmo PATCH. Por isso o formulário vive no Settings e desce por props:
 * duas cópias divergiriam, e salvar numa seção descartaria o que a outra
 * tinha na tela.
 */
export interface SettingsFormData {
  nome_completo: string;
  email: string;
  nome_empresa: string;
  whatsapp_organizacao: string;
  descricao_empresa: string;
  produtos_servicos: string;
  faq: string;
  links_importantes: string;
  notification_phone: string;
  llm_provider: string;
  openai_api_key: string;
  gemini_api_key: string;
  default_ai_model: string;
  sofia_prompt: string;
  sofia_active: boolean;
}

/** O que toda seção que edita o perfil recebe. */
export interface SecaoDePerfilProps {
  formData: SettingsFormData;
  setFormData: React.Dispatch<React.SetStateAction<SettingsFormData>>;
  onSave: () => void;
  isSaving: boolean;
}
