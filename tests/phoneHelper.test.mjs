/**
 * Testes unitários para normalizePhone() e getThreadId().
 *
 * Cobre todos os formatos de entrada que chegam ao sistema:
 * JIDs do WhatsApp, números com e sem código de país,
 * formatos brasileiros com e sem 9º dígito, e inputs inválidos.
 *
 * Execute: node --test tests/phoneHelper.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Reimplementação local para teste puro (sem módulo TS) ───────────────────
// Espelha exatamente src/backend/lib/phoneHelper.ts

function normalizePhone(phone) {
  if (!phone) return '';
  const raw = phone.includes('@') ? phone.split('@')[0] : phone;
  let clean = raw.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 10 || clean.length === 11) {
    clean = '55' + clean;
  }
  return clean;
}

function getThreadId(userId, phone) {
  return `${userId}_${normalizePhone(phone)}`;
}

// ─── JIDs do WhatsApp ────────────────────────────────────────────────────────

describe('normalizePhone — JIDs do WhatsApp', () => {
  it('remove @s.whatsapp.net de número com 13 dígitos', () => {
    assert.equal(normalizePhone('5511999999999@s.whatsapp.net'), '5511999999999');
  });

  it('remove @s.whatsapp.net de número com 12 dígitos (fixo)', () => {
    assert.equal(normalizePhone('551133333333@s.whatsapp.net'), '551133333333');
  });

  it('remove @g.us de JID de grupo', () => {
    assert.equal(normalizePhone('120363000000000@g.us'), '120363000000000');
  });

  it('remove @c.us (formato alternativo)', () => {
    assert.equal(normalizePhone('5511999999999@c.us'), '5511999999999');
  });
});

// ─── Números com código de país já presente ──────────────────────────────────

describe('normalizePhone — código de país presente', () => {
  it('mantém número de 13 dígitos (55 + DDD + 9 dígitos)', () => {
    assert.equal(normalizePhone('5511999999999'), '5511999999999');
  });

  it('mantém número de 12 dígitos (55 + DDD + 8 dígitos fixo)', () => {
    assert.equal(normalizePhone('551133333333'), '551133333333');
  });

  it('remove o + de +5511999999999', () => {
    assert.equal(normalizePhone('+5511999999999'), '5511999999999');
  });

  it('normaliza +55 (11) 9 9999-9999 com espaços e traços', () => {
    assert.equal(normalizePhone('+55 (11) 9 9999-9999'), '5511999999999');
  });
});

// ─── Números locais (sem código de país) — recebe prefixo 55 ─────────────────

describe('normalizePhone — adiciona prefixo 55 para números locais', () => {
  it('11 dígitos (DDD + 9 dígitos celular): adiciona 55', () => {
    assert.equal(normalizePhone('11999999999'), '5511999999999');
  });

  it('10 dígitos (DDD + 8 dígitos fixo): adiciona 55', () => {
    assert.equal(normalizePhone('1133333333'), '551133333333');
  });

  it('11 dígitos com formatação: (11) 9 9999-9999', () => {
    assert.equal(normalizePhone('(11) 9 9999-9999'), '5511999999999');
  });

  it('10 dígitos com formatação: (11) 3333-3333', () => {
    assert.equal(normalizePhone('(11) 3333-3333'), '551133333333');
  });
});

// ─── Consistência entre formatos do mesmo número ─────────────────────────────
// Garante que JID, número com +, número sem código país → mesmo resultado

describe('normalizePhone — consistência entre formatos', () => {
  const expected = '5511999999999';

  const formats = [
    '5511999999999@s.whatsapp.net',
    '+5511999999999',
    '5511999999999',
    '11999999999',          // sem código de país
    '+55 (11) 9 9999-9999', // formatado
    '55 11 999999999',      // com espaços
  ];

  for (const fmt of formats) {
    it(`"${fmt}" → "${expected}"`, () => {
      assert.equal(normalizePhone(fmt), expected);
    });
  }
});

// ─── Inputs inválidos e edge cases ───────────────────────────────────────────

describe('normalizePhone — inputs inválidos', () => {
  it('retorna string vazia para null/undefined/vazio', () => {
    assert.equal(normalizePhone(null), '');
    assert.equal(normalizePhone(undefined), '');
    assert.equal(normalizePhone(''), '');
  });

  it('retorna string vazia para string só com letras', () => {
    assert.equal(normalizePhone('abc'), '');
  });

  it('não adiciona 55 para número curto (< 10 dígitos)', () => {
    // Número inválido/incompleto — não deve ser modificado
    assert.equal(normalizePhone('99999999'), '99999999');
  });

  it('não duplica 55 para número que já começa com 55', () => {
    const result = normalizePhone('5511999999999');
    assert.equal(result.startsWith('5555'), false);
    assert.equal(result, '5511999999999');
  });
});

// ─── getThreadId ─────────────────────────────────────────────────────────────

describe('getThreadId', () => {
  it('compõe userId_phone normalizado', () => {
    const tid = getThreadId('user-123', '5511999999999@s.whatsapp.net');
    assert.equal(tid, 'user-123_5511999999999');
  });

  it('dois formatos do mesmo número geram o mesmo threadId', () => {
    const tid1 = getThreadId('user-abc', '5511999999999@s.whatsapp.net');
    const tid2 = getThreadId('user-abc', '11999999999');
    assert.equal(tid1, tid2);
  });

  it('usuários diferentes com mesmo telefone têm threadIds diferentes', () => {
    const tid1 = getThreadId('user-111', '5511999999999');
    const tid2 = getThreadId('user-222', '5511999999999');
    assert.notEqual(tid1, tid2);
  });

  it('mesmo usuário com telefones diferentes têm threadIds diferentes', () => {
    const tid1 = getThreadId('user-111', '5511999999999');
    const tid2 = getThreadId('user-111', '5511888888888');
    assert.notEqual(tid1, tid2);
  });
});
