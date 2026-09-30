import React, { useMemo } from 'react';
import { Globe, Megaphone, HelpCircle } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { classifyLeadOrigin, type LeadOriginCategory } from '../lib/leadOrigin';
import type { Contact } from '../services/supabaseService';

/**
 * Relatório de Origem dos Leads.
 *
 * Responde a uma pergunta só: de onde vieram os pacientes. Toda a
 * classificação vem de lib/leadOrigin — este componente não decide nada
 * sobre origem, só conta e desenha.
 */

/** Uma linha do gráfico: uma categoria de origem e quantos leads tem. */
interface FatiaDeOrigem {
  category: LeadOriginCategory;
  label: string;
  total: number;
}

/** Um anúncio no detalhamento, agrupado por ad_id. */
interface LinhaDeAnuncio {
  adId: string;
  nome: string | null;
  total: number;
}

// Cor única para os canais: o gráfico tem uma série só (contatos por
// canal) e quem carrega a identidade é o rótulo do eixo — pintar cada
// barra de uma cor seria decoração sem informação.
const COR_CANAL = '#7c3aed';

/** Conta os contatos por categoria de origem, da maior para a menor. */
export function agruparPorOrigem(contatos: Contact[]): FatiaDeOrigem[] {
  const porCategoria = new Map<LeadOriginCategory, FatiaDeOrigem>();

  for (const c of contatos) {
    const origem = classifyLeadOrigin(c.source, c.ad_tracking, { originLocked: c.origin_locked });
    const atual = porCategoria.get(origem.category);
    if (atual) {
      atual.total += 1;
    } else {
      porCategoria.set(origem.category, { category: origem.category, label: origem.label, total: 1 });
    }
  }

  return [...porCategoria.values()].sort((a, b) => b.total - a.total);
}

/**
 * Agrupa os leads de anúncio por ad_id.
 *
 * O agrupamento é pelo ID, não pelo nome: dois conjuntos duplicados com o
 * mesmo criativo saem como duas linhas de mesmo nome. Está correto no dado
 * e confunde na leitura — por isso o ID aparece junto.
 */
export function agruparPorAnuncio(contatos: Contact[]): LinhaDeAnuncio[] {
  const porAnuncio = new Map<string, LinhaDeAnuncio>();

  for (const c of contatos) {
    const origem = classifyLeadOrigin(c.source, c.ad_tracking, { originLocked: c.origin_locked });
    if (origem.category !== 'ad' && origem.category !== 'impulsionamento') continue;

    const t = c.ad_tracking || {};
    const adId = String(t.source_id || t.sourceId || '').trim();
    if (!adId) continue;

    // Sem token com ads_read a Graph API não resolve o nome e sobra o ID.
    const nome = t.ad_name || t.campaign_name || t.headline || null;

    const atual = porAnuncio.get(adId);
    if (atual) {
      atual.total += 1;
      if (!atual.nome && nome) atual.nome = nome;
    } else {
      porAnuncio.set(adId, { adId, nome, total: 1 });
    }
  }

  return [...porAnuncio.values()].sort((a, b) => b.total - a.total);
}

const Cartao: React.FC<{ children: React.ReactNode; title: string; subtitle?: string; icon?: any }> = ({
  children, title, subtitle, icon: Icon,
}) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
    <div className="flex items-center justify-between mb-8">
      <div>
        <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{subtitle}</p>}
      </div>
      {Icon && (
        <div className="p-2.5 bg-slate-50 rounded-xl text-slate-400">
          <Icon size={20} />
        </div>
      )}
    </div>
    {children}
  </div>
);

export default function LeadOriginReport({ contacts }: { contacts: Contact[] }) {
  const fatias = useMemo(() => agruparPorOrigem(contacts), [contacts]);
  const anuncios = useMemo(() => agruparPorAnuncio(contacts), [contacts]);

  const total = contacts.length;
  const desconhecidos = fatias.find(f => f.category === 'whatsapp')?.total || 0;
  const identificados = total - desconhecidos;
  const percentualConhecido = total > 0 ? Math.round((identificados / total) * 100) : 0;

  if (total === 0) {
    return (
      <Cartao title="Origem dos Leads" subtitle="De onde vieram os pacientes" icon={Globe}>
        <p className="text-sm text-slate-400 font-medium py-8 text-center">
          Nenhum contato ainda.
        </p>
      </Cartao>
    );
  }

  // O gráfico é sobre CANAIS. "Origem desconhecida" fica fora dele: com 245
  // contra 41 do maior canal, ela achata todas as barras e a tela deixa de
  // responder à pergunta que motiva o relatório — onde a captação funciona.
  // O número dela não se perde: está no indicador acima, sozinho.
  const canais = fatias.filter(f => f.category !== 'whatsapp');
  const alturaDoGrafico = Math.max(180, canais.length * 46);

  return (
    <div className="space-y-6">
      {/* A pergunta que antecede qualquer leitura do gráfico: de quanto da
          base o sistema realmente sabe a origem. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600 w-fit mb-4">
            <Globe size={20} />
          </div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{percentualConhecido}%</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Origem identificada</p>
          <p className="text-[10px] text-slate-300 font-medium mt-2">{identificados} de {total} contatos</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="p-2.5 rounded-xl bg-slate-50 text-slate-500 w-fit mb-4">
            <HelpCircle size={20} />
          </div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{desconhecidos}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Origem desconhecida</p>
          <p className="text-[10px] text-slate-300 font-medium mt-2">Só mandaram mensagem, sem sinal de por onde chegaram</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600 w-fit mb-4">
            <Megaphone size={20} />
          </div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{anuncios.length}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Anúncios com lead</p>
          <p className="text-[10px] text-slate-300 font-medium mt-2">Agrupados por ID do anúncio</p>
        </div>
      </div>

      {canais.length > 0 && (
        <Cartao
          title="Canais de captação"
          subtitle={`${identificados} contatos com origem identificada`}
          icon={Globe}
        >
          <div style={{ height: alturaDoGrafico }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={canais} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
                {/* Domínio explícito até o maior valor: a maior barra ocupa
                    a largura toda e as demais se leem contra ela. */}
                <XAxis type="number" domain={[0, 'dataMax']} hide />
                <YAxis
                  dataKey="label"
                  type="category"
                  width={150}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const f = payload[0].payload as FatiaDeOrigem;
                    const pct = identificados > 0 ? Math.round((f.total / identificados) * 100) : 0;
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl">
                        {f.label}: {f.total} ({pct}% dos identificados)
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" fill={COR_CANAL} radius={[0, 4, 4, 0]} barSize={22}>
                  {/* O eixo X fica escondido: sem rótulo direto não há como
                      ler valor nenhum. */}
                  <LabelList
                    dataKey="total"
                    position="right"
                    fill="#334155"
                    fontSize={11}
                    fontWeight={800}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
      )}

      {anuncios.length > 0 && (
        <Cartao title="Anúncios" subtitle="Leads por anúncio, agrupados por ID" icon={Megaphone}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Anúncio</th>
                  <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">ID</th>
                  <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Leads</th>
                </tr>
              </thead>
              <tbody>
                {anuncios.map(a => (
                  <tr key={a.adId} className="border-t border-slate-100">
                    <td className="py-3 font-bold text-slate-800">
                      {a.nome || <span className="text-slate-400 font-medium">Nome não disponível</span>}
                    </td>
                    <td className="py-3 text-[11px] font-mono text-slate-400">{a.adId}</td>
                    <td className="py-3 font-black text-slate-900 text-right">{a.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {anuncios.some(a => !a.nome) && (
            <p className="mt-4 text-[11px] text-slate-400 font-medium leading-relaxed">
              O WhatsApp entrega o ID do anúncio, nunca o nome. Sem um token com permissão
              de leitura de anúncios, o relatório mostra o identificador.
            </p>
          )}
        </Cartao>
      )}
    </div>
  );
}
