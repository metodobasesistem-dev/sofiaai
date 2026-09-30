/**
 * Testes de escolherPadrao() e normalizarTexto().
 *
 * O ponto central é a regra de desempate: quando mais de um padrão casa a
 * mesma mensagem, o MAIS LONGO vence. Sem ela o vencedor dependia da ordem
 * em que o Postgres devolvia as linhas, que é indefinida sem ORDER BY.
 *
 * Execute: npx tsx --test tests/leadOriginPattern.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escolherPadrao, normalizarTexto } from '../src/lib/leadOriginPattern.js';

/** Os padrões de uma clínica real, do documento de rastreio. */
const PADROES = [
  { pattern: 'anuncio: ig | social', source: 'instagram', campaign_name: 'Instagram' },
  { pattern: 'anuncio: googleads', source: 'google', campaign_name: 'Google' },
  { pattern: 'lead via site', source: 'site', campaign_name: 'Site' },
];

describe('normalizarTexto', () => {
  it('tira acento, baixa a caixa e colapsa espaços', () => {
    assert.equal(normalizarTexto('  ANÚNCIO:   Instagram  '), 'anuncio: instagram');
    assert.equal(normalizarTexto('Indicação'), 'indicacao');
  });
});

describe('escolherPadrao — desempate pelo mais longo', () => {
  it('escolhe o padrão mais longo quando dois casam', () => {
    // Caso real: todo lead pago também carrega a frase do site.
    const msg = 'Olá! anuncio: ig | social — lead via site';
    const r = escolherPadrao(msg, PADROES);
    assert.ok(r);
    assert.equal(r.source, 'instagram', 'o mais longo deveria vencer, não a rede de segurança');
  });

  it('não depende da ordem em que os padrões chegam', () => {
    const msg = 'anuncio: ig | social — lead via site';
    const direta = escolherPadrao(msg, PADROES);
    const invertida = escolherPadrao(msg, [...PADROES].reverse());
    assert.equal(direta!.source, invertida!.source);
    assert.equal(direta!.source, 'instagram');
  });

  it('cai na rede de segurança quando só ela casa', () => {
    const r = escolherPadrao('Quero agendar — lead via site', PADROES);
    assert.equal(r!.source, 'site');
  });
});

describe('escolherPadrao — normalização', () => {
  it('casa ignorando acento e caixa', () => {
    const r = escolherPadrao('ANÚNCIO: GOOGLEADS', PADROES);
    assert.ok(r);
    assert.equal(r.source, 'google');
  });

  it('casa mesmo com espaçamento irregular na mensagem', () => {
    const r = escolherPadrao('oi,   lead   via   site', PADROES);
    assert.equal(r!.source, 'site');
  });
});

describe('escolherPadrao — sem casamento', () => {
  it('devolve null para mensagem comum', () => {
    assert.equal(escolherPadrao('Bom dia, queria marcar uma consulta', PADROES), null);
  });

  it('devolve null para mensagem vazia', () => {
    assert.equal(escolherPadrao('   ', PADROES), null);
  });

  it('devolve null quando a clínica não cadastrou nada', () => {
    assert.equal(escolherPadrao('lead via site', []), null);
  });

  it('ignora padrão em branco, que casaria qualquer coisa', () => {
    const r = escolherPadrao('qualquer mensagem', [{ pattern: '   ', source: 'x', campaign_name: 'X' }]);
    assert.equal(r, null);
  });
});
