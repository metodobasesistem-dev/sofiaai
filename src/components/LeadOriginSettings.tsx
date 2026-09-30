import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Plus, Trash2, Loader2, FlaskConical, AlertTriangle, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  listLeadOriginPatterns,
  createLeadOriginPattern,
  deleteLeadOriginPattern,
  getUserProfile,
  updateUserProfile,
  type LeadOriginPattern,
} from '../services/supabaseService';
import { classifyLeadOrigin } from '../lib/leadOrigin';
import { escolherPadrao, normalizarTexto } from '../lib/leadOriginPattern';

/**
 * Cadastro das frases que identificam a origem do lead.
 *
 * A tela existe porque o detector por frase é inerte sem frases, e porque a
 * regra de desempate — o padrão MAIS LONGO vence — é invisível: sem ver a
 * ordem, quem cadastra não tem como prever qual frase vai ganhar numa
 * mensagem que casa duas.
 */

/**
 * Canais que fazem sentido para uma frase cadastrada. Anúncio fica de fora:
 * quem responde por ele é o clique (CTWA), que traz o ID do anúncio.
 *
 * O rótulo vem do próprio classificador, com o mesmo ad_tracking que o
 * detector grava — assim o que a tela promete é exatamente o que o
 * relatório vai mostrar, sem uma segunda lista para divergir.
 */
const CANAIS = ['site', 'instagram', 'google', 'facebook', 'indicacao', 'telefone', 'organico'];

const rotuloDoCanal = (slug: string) =>
  classifyLeadOrigin(slug, { type: 'ad_pattern', headline: '' }).label;

export default function LeadOriginSettings() {
  const [patterns, setPatterns] = useState<LeadOriginPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const [pattern, setPattern] = useState('');
  const [source, setSource] = useState('site');
  const [campaignName, setCampaignName] = useState('');

  const [mensagemTeste, setMensagemTeste] = useState('');

  const [soImpulsiona, setSoImpulsiona] = useState(false);
  const [salvandoFlag, setSalvandoFlag] = useState(false);

  const carregar = async () => {
    try {
      const [frases, perfil] = await Promise.all([listLeadOriginPatterns(), getUserProfile()]);
      setPatterns(frases);
      setSoImpulsiona(Boolean(perfil?.anuncios_sao_impulsionamento));
    } catch (err: any) {
      console.error('Failed to load origin patterns:', err);
      toast.error(err.message || 'Erro ao carregar as frases');
    } finally {
      setIsLoading(false);
    }
  };

  const alternarImpulsionamento = async (valor: boolean) => {
    setSalvandoFlag(true);
    // Otimista: o checkbox responde na hora e volta atrás se o salvamento
    // falhar — é um toggle, não um formulário.
    setSoImpulsiona(valor);
    try {
      await updateUserProfile({ anuncios_sao_impulsionamento: valor });
      toast.success(valor ? 'Anúncios marcados como impulsionamento.' : 'Configuração removida.');
    } catch (err: any) {
      setSoImpulsiona(!valor);
      toast.error(err.message || 'Erro ao salvar a configuração');
    } finally {
      setSalvandoFlag(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  /**
   * A lista é exibida na MESMA ordem que o detector aplica: do padrão mais
   * longo para o mais curto. É essa ordem que decide quem vence quando dois
   * casam a mesma mensagem, então ela precisa estar à vista.
   *
   * O tamanho é medido sobre o texto NORMALIZADO, como o detector mede — uma
   * frase com acento ou espaço duplo tem tamanho diferente do texto cru, e a
   * tela mostraria uma ordem que não é a real.
   */
  const ordenados = useMemo(
    () => [...patterns].sort(
      (a, b) => normalizarTexto(b.pattern).length - normalizarTexto(a.pattern).length
    ),
    [patterns]
  );

  const vencedor = useMemo(
    () => (mensagemTeste.trim() ? escolherPadrao(mensagemTeste, ordenados) : null),
    [mensagemTeste, ordenados]
  );

  const cadastrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const frase = pattern.trim();
    if (frase.length < 4) {
      toast.error('A frase precisa ter ao menos 4 caracteres.');
      return;
    }
    if (!campaignName.trim()) {
      toast.error('Informe o nome que vai aparecer no relatório.');
      return;
    }

    setIsSaving(true);
    try {
      const nova = await createLeadOriginPattern({
        pattern: frase,
        source,
        campaign_name: campaignName.trim(),
      });
      setPatterns(prev => [nova, ...prev]);
      setPattern('');
      setCampaignName('');
      toast.success('Frase cadastrada.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar a frase');
    } finally {
      setIsSaving(false);
    }
  };

  const remover = async (p: LeadOriginPattern) => {
    setRemovendo(p.id);
    try {
      await deleteLeadOriginPattern(p.id);
      setPatterns(prev => prev.filter(x => x.id !== p.id));
      toast.success('Frase removida.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover a frase');
    } finally {
      setRemovendo(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <Globe size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Origem dos Leads</h3>
              <p className="text-sm text-gray-500">
                Frases que identificam por onde o paciente chegou
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            Quando o link do seu site ou da sua bio já manda o paciente com uma frase pronta
            ("Olá! Quero agendar — lead via site"), cadastre essa frase aqui. Toda mensagem
            recebida é comparada com as frases cadastradas, e o lead é marcado com o canal
            correspondente. Quem vem de clique em anúncio já é identificado sozinho, sem frase.
          </p>

          <form onSubmit={cadastrar} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Frase na mensagem
              </label>
              <input
                type="text"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                placeholder="lead via site"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Canal
              </label>
              <select
                value={source}
                onChange={e => setSource(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CANAIS.map(c => (
                  <option key={c} value={c}>{rotuloDoCanal(c)}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Nome no relatório
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="Site"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="md:col-span-1">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full h-[42px] flex items-center justify-center bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              </button>
            </div>
          </form>

          {/* A regra de desempate é a parte que surpreende: sem dizê-la, quem
              cadastra uma frase curta de segurança não entende por que ela
              venceu de uma específica. */}
          <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed space-y-1">
              <p>
                <strong>Quando duas frases casam a mesma mensagem, vence a mais longa.</strong>{' '}
                A lista abaixo está nessa ordem. Por isso uma frase curta serve de rede de
                segurança sem atrapalhar as específicas.
              </p>
              <p>
                Cadastrar uma frase <strong>não reclassifica quem já chegou</strong> — vale
                para as mensagens daqui em diante.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Impulsionamento */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-500 flex items-center justify-center">
              <Megaphone size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Como você anuncia</h3>
              <p className="text-xs text-gray-500">Separa impulsionamento de anúncio no relatório</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={soImpulsiona}
              disabled={salvandoFlag}
              onChange={e => alternarImpulsionamento(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-primary-600 cursor-pointer disabled:opacity-50"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              <strong className="font-bold text-gray-900">
                Só anuncio pelo botão "Impulsionar" do Instagram
              </strong>
              <br />
              Não uso o Gerenciador de Anúncios da Meta.
            </span>
          </label>

          <p className="text-xs text-gray-500 leading-relaxed max-w-3xl">
            Um post impulsionado roda numa conta de anúncios implícita, fora do Gerenciador, e
            o nome da campanha dele <strong>nunca</strong> vai existir. Marcando esta opção, os
            leads de anúncio aparecem no relatório como <strong>Impulsionamento</strong>, em vez
            de virarem "Anúncio" com um identificador que você procuraria para sempre no
            Gerenciador. Só marque se for verdade: se você também usa o Gerenciador, isso
            esconderia o nome de campanhas que existem.
          </p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            Frases cadastradas <span className="text-gray-400 font-medium">({patterns.length})</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Na ordem de prioridade: da mais longa para a mais curta</p>
        </div>

        {ordenados.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">
            Nenhuma frase cadastrada. Sem frases, só os cliques em anúncio são identificados.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {ordenados.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-4">
                <span className="w-6 text-xs font-black text-gray-300 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">"{p.pattern}"</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rotuloDoCanal(p.source)} · aparece como "{p.campaign_name}" ·{' '}
                    {normalizarTexto(p.pattern).length} caracteres
                  </p>
                </div>
                <button
                  onClick={() => remover(p)}
                  disabled={removendo === p.id}
                  className="p-2 text-gray-300 hover:text-red-500 rounded-lg transition-all disabled:opacity-50"
                  aria-label={`Remover a frase ${p.pattern}`}
                >
                  {removendo === p.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Testador */}
      {patterns.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-500 flex items-center justify-center">
                <FlaskConical size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Testar uma mensagem</h3>
                <p className="text-xs text-gray-500">
                  Cole uma mensagem e veja com qual canal ela seria marcada
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-4">
            <textarea
              value={mensagemTeste}
              onChange={e => setMensagemTeste(e.target.value)}
              rows={3}
              placeholder="Olá! Quero agendar uma avaliação — lead via site"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            />

            {mensagemTeste.trim() && (
              vencedor ? (
                <div className="p-4 rounded-xl bg-primary-50 border border-primary-100">
                  <p className="text-sm text-primary-900">
                    Marcado como <strong>{rotuloDoCanal(vencedor.source)}</strong>, pela frase{' '}
                    <strong>"{vencedor.pattern}"</strong>.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-sm text-gray-600">
                    Nenhuma frase casa essa mensagem. O lead ficaria como{' '}
                    <strong>origem desconhecida</strong>, a não ser que venha de clique em anúncio.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
