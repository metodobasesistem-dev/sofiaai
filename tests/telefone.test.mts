/**
 * Telefone brasileiro: normalização e as duas formas do mesmo celular
 * (com e sem o 9º dígito).
 *
 * Rodar: npm run test:telefone
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePhone, variantesDoTelefone, isSamePhone } from '../src/backend/lib/phoneHelper.js';

describe('normalizePhone', () => {
  it('põe o 55 em número local de 10 ou 11 dígitos', () => {
    assert.equal(normalizePhone('32988996173'), '5532988996173');
    assert.equal(normalizePhone('3288996173'), '553288996173');
  });

  it('não duplica o 55 e tira máscara e sufixo do JID', () => {
    assert.equal(normalizePhone('+55 (32) 98899-6173'), '5532988996173');
    assert.equal(normalizePhone('5532988996173@s.whatsapp.net'), '5532988996173');
  });

  it('DDD 55 (RS) recebe o país: "55999999999" não é "já tem 55"', () => {
    assert.equal(normalizePhone('55999999999'), '5555999999999');
  });

  it('vazio continua vazio', () => {
    assert.equal(normalizePhone(''), '');
  });
});

describe('variantesDoTelefone', () => {
  it('com 9 devolve o número e a forma sem o 9', () => {
    assert.deepEqual(variantesDoTelefone('5532988996173'), ['5532988996173', '553288996173']);
  });

  it('sem 9 devolve o número e a forma com o 9', () => {
    assert.deepEqual(variantesDoTelefone('553288996173'), ['553288996173', '5532988996173']);
  });

  it('a primeira posição é sempre o número que entrou, normalizado', () => {
    assert.equal(variantesDoTelefone('(32) 88996173')[0], '553288996173');
  });

  it('fixo não ganha 9 (8 dígitos começando em 2 a 5)', () => {
    assert.deepEqual(variantesDoTelefone('553233334444'), ['553233334444']);
    assert.deepEqual(variantesDoTelefone('551155556666'), ['551155556666']);
  });

  it('13 dígitos que não começam com 9 depois do DDD ficam como estão', () => {
    assert.deepEqual(variantesDoTelefone('5532888996173'), ['5532888996173']);
  });

  it('número de fora do Brasil não é mexido', () => {
    assert.deepEqual(variantesDoTelefone('14155550123'.padStart(13, '1')), ['1114155550123']);
  });

  it('nunca junta DDDs diferentes', () => {
    const [, outra] = variantesDoTelefone('5532988996173');
    assert.ok(outra.startsWith('5532'));
    assert.notEqual(outra, '553188996173');
  });

  it('vazio não tem variantes', () => {
    assert.deepEqual(variantesDoTelefone(''), []);
  });

  it('é coerente com isSamePhone: toda variante é o mesmo número', () => {
    for (const n of ['5532988996173', '553288996173', '5511987654321', '551187654321']) {
      for (const v of variantesDoTelefone(n)) assert.ok(isSamePhone(n, v), `${n} ~ ${v}`);
    }
  });
});
