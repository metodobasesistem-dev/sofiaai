import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Plus, Trash2, Loader2, FlaskConical, AlertTriangle, Megaphone, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  listLeadOriginPatterns,
  createLeadOriginPattern,
  deleteLeadOriginPattern,
  getUserProfile,
  updateUserProfile,
  type LeadOriginPattern,
} from '../services/supabaseService';
import { classifyLeadOrigin, CANAIS_DE_ORIGEM, origemParaExibicao } from '../lib/leadOrigin';
import { escolherPadrao, normalizarTexto } from '../lib/leadOriginPattern';

/**
 * Canais e origens dos leads.
 *
 * Duas coisas moram aqui: as origens que o sistema conhece, e as frases que
 * marcam o lead automaticamente. A tela existe porque o detector por frase é
 * inerte sem frases, e porque a regra de desempate — o padrão MAIS LONGO
 * vence — é invisível: sem ver a ordem, quem cadastra não tem como prever
 * qual frase vai ganhar numa mensagem que casa duas.
 */

/**
 * Canais que fazem sentido para uma frase cadastrada.
 *
 * Anúncio e Impulsionamento ficam de fora: quem responde por eles é o clique
 * (CTWA), que traz o ID do anúncio — uma frase não teria como saber disso.
 * 'facebook' não é categoria própria (cai em Instagram), por isso entra à mão.
 */
const CANAIS_DE_FRASE = [
  ...CANAIS_DE_ORIGEM.filter(c => c !== 'ad' && c !== 'impulsionamento' && c !== 'manual'),
  'facebook',
];

const rotuloDoCanal = (slug: string) =>
  classifyLeadOrigin(slug, { type: 'ad_pattern', headline: '' }).label;

/** Selo da categoria no card do padrão. */
function SeloDeCanal({ slug }: { slug: string }) {
  const { category } = classifyLeadOrigin(slug, { type: 'ad_pattern', headline: '' });
  const { label, emoji } = origemParaExibicao(category);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 text-[10px] font-black uppercase tracking-wider">
      <span aria-hidden>{emoji}</span>
      {label}
    </span>
  );
}

const campoClasse =
  'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const rotuloClasse = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2';

/** Modal do "+ Novo padrão". */
function NovoPadraoModal({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (p: LeadOriginPattern) => void;
}) {
  const [pattern, setPattern] = useState('');
  const [source, setSource] = useState('site');
  const [campaignName, setCampaignName] = useState('');
  const [description, setDescription] = useState('');
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
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

    setSalvando(true);
    try {
      const nova = await createLeadOriginPattern({
        pattern: frase,
        source,
        campaign_name: campaignName.trim(),
        description: description.trim() || undefined,
      });
      onCriado(nova);
      toast.success('Padrão cadastrado.');
      onFechar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar o padrão');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Novo padrão</h3>
            <p className="text-[12px] text-gray-500">
              Uma frase que, aparecendo na mensagem, marca a origem do lead.
            </p>
          </div>
          <button onClick={onFechar} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={enviar} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className={rotuloClasse}>Mensagem a detectar (contém)</label>
            <input
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder="Vim pelo Instagram e desejo agendar uma consulta"
              className={`${campoClasse} font-mono text-[13px]`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={rotuloClasse}>Canal</label>
              <select value={source} onChange={e => setSource(e.target.value)} className={`${campoClasse} bg-white`}>
                {CANAIS_DE_FRASE.map(c => (
                  <option key={c} value={c}>{rotuloDoCanal(c)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotuloClasse}>Nome no relatório</label>
              <input
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="Instagram (link da bio)"
                className={campoClasse}
              />
            </div>
          </div>

          <div>
            <label className={rotuloClasse}>
              Observação <span className="normal-case font-medium text-gray-300">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Por que este padrão existe — para quem mexer nisso depois entender."
              className={`${campoClasse} resize-none`}
            />
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-[13px] font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Adicionar padrão
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LeadOriginSettings() {
  const [patterns, setPatterns] = useState<LeadOriginPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

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

  useEffect(() => { carregar(); }, []);

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

  /**
   * Os cards são exibidos na MESMA ordem que o detector aplica: do padrão mais
   * longo para o mais curto. É essa ordem que decide quem vence quando dois
   * casam a mesma mensagem — por isso cada card carrega a própria posição.
   * Numa grade a ordem se lê pior que numa lista, e sem o número ela sumiria.
   *
   * O tamanho é medido sobre o texto NORMALIZADO, como o detector mede: uma
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

  const remover = async (p: LeadOriginPattern) => {
    setRemovendo(p.id);
    try {
      await deleteLeadOriginPattern(p.id);
      setPatterns(prev => prev.filter(x => x.id !== p.id));
      toast.success('Padrão removido.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover o padrão');
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
      {/* ── Origens da Clínica ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <Globe size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Origens da Clínica</h3>
              <p className="text-sm text-gray-500">As origens que o sistema reconhece hoje</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-4">
          {/* Os chips saem do próprio classificador: uma lista escrita à mão
              aqui prometeria um canal que o relatório não conhece. */}
          <div className="flex flex-wrap gap-2">
            {CANAIS_DE_ORIGEM.map(c => {
              const { label, emoji } = origemParaExibicao(c);
              return (
                <span
                  key={c}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-[12px] font-semibold text-gray-700"
                >
                  <span aria-hidden>{emoji}</span>
                  {label}
                </span>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed max-w-3xl">
            Um lead sem nenhum sinal de origem fica como <strong>Origem desconhecida</strong> — que
            não é canal de captação e por isso não aparece acima.
          </p>
        </div>
      </div>

      {/* ── Configuração de Origens de Lead ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
              <FlaskConical size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">Configuração de Origens de Lead</h3>
              <p className="text-sm text-gray-500">
                Cadastre frases-chave para classificar de onde o lead veio automaticamente.
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalAberto(true)}
            className="shrink-0 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-[12px] font-black uppercase tracking-wider hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> Novo padrão
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* A regra de desempate é a parte que surpreende: sem dizê-la, quem
              cadastra uma frase curta de segurança não entende por que ela
              venceu de uma específica. */}
          <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed space-y-1">
              <p>
                <strong>Quando duas frases casam a mesma mensagem, vence a mais longa.</strong>{' '}
                Os cards estão nessa ordem, e cada um mostra a própria posição. Por isso uma frase
                curta serve de rede de segurança sem atrapalhar as específicas.
              </p>
              <p>
                Cadastrar um padrão <strong>não reclassifica quem já chegou</strong> — vale para as
                mensagens daqui em diante.
              </p>
            </div>
          </div>

          {ordenados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum padrão cadastrado. Sem eles, só os cliques em anúncio são identificados.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {ordenados.map((p, i) => (
                <div key={p.id} className="border border-gray-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <SeloDeCanal slug={p.source} />
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className="text-[10px] font-black text-gray-300 tabular-nums"
                        title="Posição na ordem de prioridade"
                      >
                        #{i + 1}
                      </span>
                      <button
                        onClick={() => remover(p)}
                        disabled={removendo === p.id}
                        className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        aria-label={`Remover o padrão ${p.campaign_name}`}
                      >
                        {removendo === p.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[15px] font-bold text-gray-900">{p.campaign_name}</p>
                    {p.description && (
                      <p className="text-[12px] text-gray-500 leading-relaxed mt-1">{p.description}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                      Mensagem a detectar (contém)
                    </p>
                    <div className="px-3.5 py-2.5 bg-gray-50 border border-gray-100 rounded-xl">
                      <code className="text-[12px] font-mono text-gray-700 break-words">{p.pattern}</code>
                    </div>
                    <p className="text-[10px] text-gray-300 mt-1.5">
                      {normalizarTexto(p.pattern).length} caracteres
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Como você anuncia ──────────────────────────────────────────── */}
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
            Um post impulsionado roda numa conta de anúncios implícita, fora do Gerenciador, e o
            nome da campanha dele <strong>nunca</strong> vai existir. Marcando esta opção, os leads
            de anúncio aparecem no relatório como <strong>Impulsionamento</strong>, em vez de
            virarem "Anúncio" com um identificador que você procuraria para sempre no Gerenciador.
            Só marque se for verdade: se você também usa o Gerenciador, isso esconderia o nome de
            campanhas que existem.
          </p>
        </div>
      </div>

      {/* ── Testador ───────────────────────────────────────────────────── */}
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
              className={`${campoClasse} resize-none`}
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

      {modalAberto && (
        <NovoPadraoModal
          onFechar={() => setModalAberto(false)}
          onCriado={nova => setPatterns(prev => [nova, ...prev])}
        />
      )}
    </div>
  );
}
