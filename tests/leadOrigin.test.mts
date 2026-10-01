/**
 * Testes de classifyLeadOrigin().
 *
 * Dois casos aqui são regressões de defeitos reais, registrados no documento
 * de rastreio, e não devem voltar:
 *   - lead de frase de Site caindo em "Anúncio (Meta Ads)";
 *   - o valor padrão 'whatsapp' sendo tratado como canal de captação.
 *
 * Execute: npx tsx --test tests/leadOrigin.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLeadOrigin, classifyOriginConfidence } from '../src/lib/leadOrigin.js';

describe('precedência 1 — escolha manual', () => {
  it('origin_locked vence o clique em anúncio', () => {
    const r = classifyLeadOrigin(
      'indicacao',
      { source_id: '120210000000000000', ctwa_clid: 'ARxyz' },
      { originLocked: true }
    );
    assert.equal(r.category, 'indicacao');
    assert.equal(r.confidence, 'alta');
  });

  it('source manual/balcao/atendente cai em cadastro manual', () => {
    for (const s of ['manual', 'balcao', 'atendente']) {
      assert.equal(classifyLeadOrigin(s, null).category, 'manual');
    }
  });

  it('travado como meta_ads é Anúncio, não Cadastro manual', () => {
    const r = classifyLeadOrigin('meta_ads', null, { originLocked: true });
    assert.equal(r.category, 'ad');
  });
});

describe('precedência 2 — clique em anúncio', () => {
  it('reconhece pelo source_id', () => {
    const r = classifyLeadOrigin('meta_ads', { source_id: '12021', headline: 'Setembro' });
    assert.equal(r.category, 'ad');
    assert.equal(r.confidence, 'alta');
  });

  it('reconhece pelo ctwa_clid e pelos utm', () => {
    assert.equal(classifyLeadOrigin('meta_ads', { ctwa_clid: 'ARx' }).category, 'ad');
    assert.equal(classifyLeadOrigin('meta_ads', { utm_campaign: 'Black' }).category, 'ad');
    assert.equal(classifyLeadOrigin('meta_ads', { utm_content: 'video1' }).category, 'ad');
  });

  it('usa o nome do anúncio quando existe, e o ID quando não', () => {
    assert.equal(classifyLeadOrigin('meta_ads', { source_id: '12021', ad_name: 'Criativo A' }).campaign, 'Criativo A');
    assert.equal(classifyLeadOrigin('meta_ads', { source_id: '12021' }).campaign, '12021');
  });

  it('impulsionamento é categoria própria, não Anúncio nem Instagram', () => {
    const r = classifyLeadOrigin('meta_ads', { ctwa_clid: 'ARx', tipo_de_anuncio: 'impulsionamento' });
    assert.equal(r.category, 'impulsionamento');
  });
});

describe('precedência 3 — frase cadastrada (REGRESSÃO)', () => {
  it('frase de Site NÃO pode virar Anúncio', () => {
    // O defeito: a condição de "é anúncio" era `t.source || t.headline`, e o
    // detector por frase preenche os dois para qualquer padrão cadastrado.
    // Resultado: leads do site apareciam como vindos de anúncio.
    const r = classifyLeadOrigin('site', {
      source: 'Site',
      type: 'ad_pattern',
      headline: 'Site',
      body: 'Olá, lead via site',
    });
    assert.equal(r.category, 'site', 'frase de Site jamais deve cair em Anúncio');
    assert.notEqual(r.category, 'ad');
    assert.equal(r.confidence, 'media');
  });

  it('frase de Indicação também não vira Anúncio', () => {
    const r = classifyLeadOrigin('indicacao', { source: 'Indicação', type: 'ad_pattern', headline: 'Indicação' });
    assert.equal(r.category, 'indicacao');
  });

  it('frase de Instagram vira Instagram, com confiança média', () => {
    const r = classifyLeadOrigin('instagram', { source: 'Instagram', type: 'ad_pattern', headline: 'Bio do perfil' });
    assert.equal(r.category, 'instagram');
    assert.equal(r.campaign, 'Bio do perfil');
    assert.equal(r.confidence, 'media');
  });
});

describe('precedência 4 — link rastreável', () => {
  it('reconhece pelo type e pelo slug', () => {
    assert.equal(classifyLeadOrigin('site', { type: 'tracking_link' }).category, 'site');
    assert.equal(classifyLeadOrigin('site', { tracking_link_slug: 'promo' }).confidence, 'media');
  });
});

describe('precedência 5 — origem desconhecida (REGRESSÃO)', () => {
  it("'whatsapp' é origem DESCONHECIDA, não um canal", () => {
    // Chamá-lo de "WhatsApp IA" fazia 343 de 389 contatos de uma clínica real
    // aparecerem como captação, distorcendo todo percentual.
    const r = classifyLeadOrigin('whatsapp', null);
    assert.equal(r.category, 'whatsapp');
    assert.equal(r.label, 'Origem desconhecida');
    assert.equal(r.confidence, 'nenhuma');
  });

  it('source vazio ou nulo também é desconhecida', () => {
    assert.equal(classifyLeadOrigin(null, null).category, 'whatsapp');
    assert.equal(classifyLeadOrigin('', null).category, 'whatsapp');
  });

  it('slug sem rastro que o sustente tem confiança baixa', () => {
    const r = classifyLeadOrigin('google', null);
    assert.equal(r.category, 'google');
    assert.equal(r.confidence, 'baixa');
  });

  it('slug desconhecido cai em Outros', () => {
    assert.equal(classifyLeadOrigin('feira-de-saude', null).category, 'outros');
  });
});

describe('origens próprias da clínica', () => {
  // Elas não têm categoria: caem em 'outros'. O nome foi gravado em
  // ad_tracking.source na captura, e é ele que a tela deve mostrar — senão
  // "Convênio Unimed" aparece como "Outros" e a origem perde a graça.
  it('agrupa em Outros, mas mostra o nome que a clínica deu', () => {
    const r = classifyLeadOrigin('convenio_unimed', {
      source: 'Convênio Unimed',
      type: 'ad_pattern',
      headline: 'Convênio',
    });
    assert.equal(r.category, 'outros', 'o agrupamento do relatório é Outros');
    assert.equal(r.label, 'Convênio Unimed', 'a tela mostra o nome dado');
  });

  it('duas origens próprias diferentes mantêm cada uma o seu nome', () => {
    const a = classifyLeadOrigin('convenio_unimed', { source: 'Convênio Unimed', type: 'ad_pattern' });
    const b = classifyLeadOrigin('panfleto', { source: 'Panfleto', type: 'ad_pattern' });
    assert.equal(a.category, b.category);
    assert.notEqual(a.label, b.label);
  });

  it('o nome gravado NÃO sobrescreve o rótulo de uma origem nativa', () => {
    // Renomear "Telefone" no código precisa chegar em todas as telas; se o
    // valor gravado no contato ganhasse, cada lead carregaria o nome da época.
    const r = classifyLeadOrigin('telefone', { source: 'Nome antigo', type: 'ad_pattern' });
    assert.equal(r.category, 'telefone');
    assert.equal(r.label, 'Telefone');
  });

  it('sem nome gravado, cai em Outros', () => {
    const r = classifyLeadOrigin('origem_sem_nome', { type: 'ad_pattern' });
    assert.equal(r.label, 'Outros');
  });
});

describe('classifyOriginConfidence', () => {
  it('acompanha a classificação', () => {
    assert.equal(classifyOriginConfidence('meta_ads', { source_id: '1' }), 'alta');
    assert.equal(classifyOriginConfidence('site', { type: 'ad_pattern' }), 'media');
    assert.equal(classifyOriginConfidence('whatsapp', null), 'nenhuma');
  });
});
