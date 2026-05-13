import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Check } from 'lucide-react';

interface MetaSetupHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  webhookUrl?: string;
}

/**
 * Step-by-step guide shown when admin clicks "Como configurar?" inside the
 * AdminPanel Meta provider section. Walks through the Meta Developers panel
 * pre-requisites needed before pasting credentials into our admin UI.
 */
export default function MetaSetupHelpModal({ isOpen, onClose, webhookUrl }: MetaSetupHelpModalProps) {
  const finalWebhookUrl = webhookUrl || `${window.location.origin}/api/whatsapp/meta/webhook`;

  const steps: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: '1. Criar/Selecionar app no Meta Developers',
      body: (
        <>
          Em <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-primary-600 underline inline-flex items-center gap-1">developers.facebook.com/apps <ExternalLink size={11} /></a>, crie uma app do tipo
          {' '}<strong>Empresa</strong> e adicione o produto <strong>WhatsApp</strong>.
        </>
      ),
    },
    {
      title: '2. Registrar o número de WhatsApp Business',
      body: (
        <>
          Na app, vá em <strong>WhatsApp → Configuração da API</strong>. Adicione um número de teste OU registre o número de produção do cliente no Business Manager (precisa estar verificado).
        </>
      ),
    },
    {
      title: '3. Gerar um Access Token permanente',
      body: (
        <>
          Tokens temporários expiram em 24h. Para produção, crie um <strong>System User</strong> no Business Manager e gere um token com permissões
          <code className="ml-1 px-2 py-0.5 bg-slate-100 rounded text-[10px]">whatsapp_business_messaging</code> +
          <code className="ml-1 px-2 py-0.5 bg-slate-100 rounded text-[10px]">whatsapp_business_management</code>.
          Token começa com <code className="px-1 bg-slate-100 rounded">EAA…</code>
        </>
      ),
    },
    {
      title: '4. Anotar Phone Number ID e WABA ID',
      body: (
        <>
          Em <strong>Configuração da API</strong>, copie:
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>Phone Number ID</strong> — identifica o número (15+ dígitos)</li>
            <li><strong>WhatsApp Business Account ID (WABA ID)</strong> — necessário para listar templates</li>
          </ul>
        </>
      ),
    },
    {
      title: '5. Configurar o Webhook na app Meta',
      body: (
        <>
          Em <strong>WhatsApp → Configuração</strong>, na seção <em>Webhook</em>:
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            <li>
              URL de callback:
              <code className="ml-2 px-2 py-0.5 bg-slate-100 rounded break-all text-[11px]">{finalWebhookUrl}</code>
            </li>
            <li>
              Verificar token: o mesmo valor de <code>META_VERIFY_TOKEN</code> configurado no servidor.
            </li>
            <li>Clicar em <strong>Verificar e Salvar</strong>.</li>
            <li>Assinar o campo <strong>messages</strong> (essencial — recebe mensagens, statuses, reactions).</li>
          </ol>
        </>
      ),
    },
    {
      title: '6. Copiar a "Chave Secreta do App"',
      body: (
        <>
          Em <strong>Configurações → Básico</strong>, copie o <strong>App Secret</strong> (32 caracteres hex).
          Salve no servidor como <code className="px-1 bg-slate-100 rounded">WHATSAPP_APP_SECRET</code> e dê restart.
          Sem isso o webhook rejeita todas as mensagens (HMAC inválido).
        </>
      ),
    },
    {
      title: '7. (Opcional) Criar templates aprovados',
      body: (
        <>
          Para enviar mensagens livres a clientes que não interagiram nas últimas 24h, crie templates em
          <strong> Mensagens → Modelos de mensagem</strong> no Business Manager. Aprovação leva de minutos a horas.
        </>
      ),
    },
    {
      title: '8. Voltar aqui e colar os dados',
      body: (
        <>
          Com tudo acima feito, cole <strong>Phone Number ID</strong>, <strong>WABA ID</strong> e <strong>Access Token</strong> nos campos ao lado, clique em
          <strong> Testar Conexão</strong> e depois em <strong>Salvar</strong>. O cliente já estará operando via Meta Cloud API.
        </>
      ),
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">Como conectar a API Oficial da Meta</h2>
                <p className="text-[11px] text-slate-500 font-medium">
                  Pré-requisitos no painel Meta Developers antes de configurar o cliente
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/30">
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0">
                    <Check size={14} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-black text-slate-900 text-sm">{s.title}</div>
                    <div className="text-xs text-slate-600 leading-relaxed">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all"
              >
                Entendi
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
