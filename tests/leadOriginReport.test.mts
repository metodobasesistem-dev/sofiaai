/**
 * Testes da agregação do Relatório de Origem dos Leads.
 *
 * A contagem é o que a clínica lê para decidir onde investir, então o que
 * importa aqui é que as fatias somem a base inteira e que "desconhecida"
 * não seja contada como canal.
 *
 * Execute: npx tsx --test tests/leadOriginReport.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { agruparPorOrigem, agruparPorAnuncio } from '../src/components/LeadOriginReport.js';

/** Base pequena com um caso de cada coisa que o sistema sabe produzir. */
const BASE: any[] = [
  // dois cliques no mesmo anúncio
  { source: 'meta_ads', ad_tracking: { source_id: '111', ad_name: 'Criativo A', ctwa_clid: 'a' } },
  { source: 'meta_ads', ad_tracking: { source_id: '111', ad_name: 'Criativo A', ctwa_clid: 'b' } },
  // um clique em outro anúncio, sem nome resolvido
  { source: 'meta_ads', ad_tracking: { source_id: '222', ctwa_clid: 'c' } },
  // frase cadastrada de site
  { source: 'site', ad_tracking: { type: 'ad_pattern', source: 'Site', headline: 'Site' } },
  // origem travada à mão
  { source: 'indicacao', origin_locked: true, ad_tracking: null },
  // três sem sinal nenhum
  { source: 'whatsapp', ad_tracking: null },
  { source: 'whatsapp', ad_tracking: null },
  { source: 'whatsapp', ad_tracking: null },
];

describe('agruparPorOrigem', () => {
  it('as fatias somam a base inteira', () => {
    const soma = agruparPorOrigem(BASE).reduce((acc, f) => acc + f.total, 0);
    assert.equal(soma, BASE.length);
  });

  it('ordena da maior para a menor', () => {
    const fatias = agruparPorOrigem(BASE);
    const totais = fatias.map(f => f.total);
    assert.deepEqual(totais, [...totais].sort((a, b) => b - a));
  });

  it('conta os três anúncios juntos como uma fatia só', () => {
    const ad = agruparPorOrigem(BASE).find(f => f.category === 'ad');
    assert.equal(ad!.total, 3);
  });

  it('desconhecida é fatia própria, não somada a canal nenhum', () => {
    const fatias = agruparPorOrigem(BASE);
    const desconhecida = fatias.find(f => f.category === 'whatsapp');
    assert.equal(desconhecida!.total, 3);
    assert.equal(desconhecida!.label, 'Origem desconhecida');
  });

  it('a frase de site vira Site, não Anúncio', () => {
    const fatias = agruparPorOrigem(BASE);
    assert.equal(fatias.find(f => f.category === 'site')!.total, 1);
    assert.equal(fatias.find(f => f.category === 'ad')!.total, 3);
  });

  it('base vazia devolve lista vazia', () => {
    assert.deepEqual(agruparPorOrigem([]), []);
  });
});

describe('agruparPorAnuncio', () => {
  it('agrupa por ad_id, não por nome', () => {
    const linhas = agruparPorAnuncio(BASE);
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].adId, '111');
    assert.equal(linhas[0].total, 2);
  });

  it('dois anúncios de mesmo nome saem como duas linhas', () => {
    // Conjunto duplicado com o mesmo criativo: correto no dado, confuso na
    // leitura — por isso o ID aparece na tabela.
    const linhas = agruparPorAnuncio([
      { source: 'meta_ads', ad_tracking: { source_id: '111', ad_name: 'Criativo A', ctwa_clid: 'a' } },
      { source: 'meta_ads', ad_tracking: { source_id: '999', ad_name: 'Criativo A', ctwa_clid: 'b' } },
    ] as any);
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].nome, linhas[1].nome);
  });

  it('deixa o nome nulo quando a Graph API não resolveu', () => {
    const semNome = agruparPorAnuncio(BASE).find(l => l.adId === '222');
    assert.equal(semNome!.nome, null);
  });

  it('ignora quem não é anúncio', () => {
    const linhas = agruparPorAnuncio([
      { source: 'site', ad_tracking: { type: 'ad_pattern', headline: 'Site' } },
      { source: 'whatsapp', ad_tracking: null },
    ] as any);
    assert.deepEqual(linhas, []);
  });

  it('ignora clique de anúncio sem ID, que não dá para agrupar', () => {
    const linhas = agruparPorAnuncio([
      { source: 'meta_ads', ad_tracking: { ctwa_clid: 'so-o-clid' } },
    ] as any);
    assert.deepEqual(linhas, []);
  });
});
