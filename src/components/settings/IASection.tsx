import React from 'react';
import { Zap, Key, ShieldCheck, Loader2, Save } from 'lucide-react';
import { Cartao } from './EmpresaSection';
import type { SecaoDePerfilProps } from './types';

const campo =
  'w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-sm';
const rotulo = 'block text-xs font-bold text-gray-400 uppercase tracking-wider';

export default function IASection({ formData, setFormData, onSave, isSaving }: SecaoDePerfilProps) {
  const ehOpenAI = formData.llm_provider === 'openai';

  return (
    <div className="space-y-8">
      <Cartao
        titulo="Configuração de Inteligência Artificial"
        descricao="Configure seu próprio provedor de IA e chaves API (BYOK)"
        icon={<Zap size={20} />}
        tomDoIcone="bg-orange-50 text-orange-600"
      >
        <div className="p-8 space-y-8">
          <div className="space-y-4">
            <label className={rotulo}>Escolha seu Provedor de IA</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'openai', letra: 'O', nome: 'OpenAI (ChatGPT)', desc: 'Modelos GPT-4o e GPT-4o-mini' },
                { id: 'gemini', letra: 'G', nome: 'Google Gemini', desc: 'Modelos Gemini 1.5 Pro e Flash' },
              ].map(p => {
                const escolhido = formData.llm_provider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setFormData({ ...formData, llm_provider: p.id })}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left
                      ${escolhido ? 'border-primary-600 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl
                      ${escolhido ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                    >
                      {p.letra}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{p.nome}</p>
                      <p className="text-xs text-gray-500">{p.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className={rotulo}>{ehOpenAI ? 'OpenAI API Key' : 'Gemini API Key'}</label>
              <div className="relative">
                <input
                  type="password"
                  value={ehOpenAI ? formData.openai_api_key : formData.gemini_api_key}
                  onChange={e =>
                    setFormData(
                      ehOpenAI
                        ? { ...formData, openai_api_key: e.target.value }
                        : { ...formData, gemini_api_key: e.target.value }
                    )
                  }
                  placeholder={ehOpenAI ? 'sk-...' : 'AIza...'}
                  className={`${campo} pl-10`}
                />
                <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              <p className="text-[10px] text-gray-400">
                {ehOpenAI
                  ? 'Suas chaves são criptografadas e usadas apenas para suas interações.'
                  : 'Obtenha sua chave no Google AI Studio.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className={rotulo}>Modelo Padrão</label>
              <select
                value={formData.default_ai_model}
                onChange={e => setFormData({ ...formData, default_ai_model: e.target.value })}
                className={`${campo} appearance-none bg-white font-bold`}
              >
                <option value="">Selecione um modelo...</option>
                {ehOpenAI ? (
                  <>
                    <option value="gpt-4o">GPT-4o (Mais inteligente)</option>
                    <option value="gpt-4o-mini">GPT-4o Mini (Mais rápido/econômico)</option>
                    <option value="o1-preview">o1-preview (Raciocínio Avançado)</option>
                    <option value="o1-mini">o1-mini (Raciocínio Rápido)</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                  </>
                ) : (
                  <>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-flash-8b">Gemini 1.5 Flash-8b (Ultra Econômico)</option>
                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
                  </>
                )}
              </select>
              <p className="text-[10px] text-gray-400">
                Escolha o modelo que melhor se adapta ao seu custo/benefício.
              </p>
            </div>
          </div>

          <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary-600 shrink-0 shadow-sm">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Uso da sua própria chave</h4>
                <p className="text-xs text-gray-600 leading-relaxed mt-1">
                  Ao configurar sua própria chave, você terá custo zero de processamento na Sofia. As cobranças
                  da OpenAI/Google virão diretamente para você, e a Sofia não descontará créditos de mensagens do
                  seu plano.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary-100 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Salvar Configuração IA
            </button>
          </div>
        </div>
      </Cartao>
    </div>
  );
}
