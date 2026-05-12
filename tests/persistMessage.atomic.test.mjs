/**
 * Testes para a lógica de negócio do persistMessage() refatorado.
 *
 * Não mocka Supabase — testa as funções puras de resolução de nome,
 * contagem de mensagens e montagem de payload que alimentam a RPC.
 *
 * Execute: node --test tests/persistMessage.atomic.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Helpers extraídos do agentService para teste isolado ───────────────────

function isPhoneOnly(s) {
  if (!s) return true;
  return !/[a-zA-Z]/.test(s) && s.replace(/\D/g, '').length >= 8;
}

function resolveContactName({ existingContactNome, existingThreadName, incomingPushName, cleanPhone }) {
  if (existingContactNome && !isPhoneOnly(existingContactNome)) return existingContactNome;
  if (existingThreadName  && !isPhoneOnly(existingThreadName))  return existingThreadName;
  if (incomingPushName    && !isPhoneOnly(incomingPushName))    return incomingPushName;
  return existingContactNome || existingThreadName || incomingPushName || cleanPhone;
}

function buildUnreadCount(direction, existingCount) {
  return direction === 'inbound' ? (existingCount || 0) + 1 : (existingCount || 0);
}

function buildReopenTicket(direction, ticketStatus, funilStatus) {
  return direction === 'inbound' &&
    (ticketStatus === 'resolved' || funilStatus === 'Resolvido');
}

function buildContactPayload({ userId, cleanPhone, resolvedName, existingContact, text, timestamp, direction }) {
  return {
    id:               `${userId}_${cleanPhone}`,
    user_id:          userId,
    telefone:         cleanPhone,
    nome:             resolvedName,
    status_funil:     existingContact?.status_funil || 'Lead',
    source:           'whatsapp',
    ultima_mensagem:  text.substring(0, 500),
    ultima_interacao: new Date(timestamp).toISOString(),
    primeiro_contato: existingContact?.primeiro_contato || new Date(timestamp).toISOString(),
    data_criacao:     existingContact?.data_criacao     || new Date(timestamp).toISOString(),
    total_mensagens:  existingContact?.total_mensagens  || 0,
    increment_count:  direction === 'inbound',
    reopen_ticket:    buildReopenTicket(direction, existingContact?.ticket_status, existingContact?.status_funil)
  };
}

// ─── Suíte: resolução de nome de contato ────────────────────────────────────

describe('resolveContactName', () => {
  it('prioriza nome do CRM quando disponível', () => {
    const name = resolveContactName({
      existingContactNome: 'João Silva',
      existingThreadName:  'João',
      incomingPushName:    '5511999999999',
      cleanPhone:          '5511999999999'
    });
    assert.equal(name, 'João Silva');
  });

  it('usa nome da thread quando CRM está vazio', () => {
    const name = resolveContactName({
      existingContactNome: null,
      existingThreadName:  'Maria Souza',
      incomingPushName:    '5511888888888',
      cleanPhone:          '5511888888888'
    });
    assert.equal(name, 'Maria Souza');
  });

  it('usa pushName do WhatsApp quando CRM e thread estão vazios', () => {
    const name = resolveContactName({
      existingContactNome: null,
      existingThreadName:  null,
      incomingPushName:    'Carlos Andrade',
      cleanPhone:          '5511777777777'
    });
    assert.equal(name, 'Carlos Andrade');
  });

  it('nunca deixa número puro substituir nome real do CRM', () => {
    const name = resolveContactName({
      existingContactNome: 'Ana Paula',
      existingThreadName:  '5511666666666',
      incomingPushName:    '5511666666666',
      cleanPhone:          '5511666666666'
    });
    assert.equal(name, 'Ana Paula');
  });

  it('nunca deixa número da thread substituir nome real do CRM', () => {
    const name = resolveContactName({
      existingContactNome: '5511999999999', // nome no CRM é telefone
      existingThreadName:  'Roberto Lima',  // thread tem nome real
      incomingPushName:    null,
      cleanPhone:          '5511999999999'
    });
    assert.equal(name, 'Roberto Lima');
  });

  it('usa telefone como fallback quando tudo é nulo', () => {
    const name = resolveContactName({
      existingContactNome: null,
      existingThreadName:  null,
      incomingPushName:    null,
      cleanPhone:          '5511555555555'
    });
    assert.equal(name, '5511555555555');
  });
});

// ─── Suíte: contador de mensagens não lidas ──────────────────────────────────

describe('buildUnreadCount', () => {
  it('incrementa ao receber mensagem inbound', () => {
    assert.equal(buildUnreadCount('inbound', 3), 4);
  });

  it('não incrementa para mensagem outbound', () => {
    assert.equal(buildUnreadCount('outbound', 3), 3);
  });

  it('trata existingCount nulo como zero', () => {
    assert.equal(buildUnreadCount('inbound', null), 1);
    assert.equal(buildUnreadCount('outbound', null), 0);
  });
});

// ─── Suíte: lógica de reabertura de ticket ───────────────────────────────────

describe('buildReopenTicket', () => {
  it('reabre quando thread está resolvida e mensagem é inbound', () => {
    assert.equal(buildReopenTicket('inbound', 'resolved', 'Lead'), true);
  });

  it('reabre quando status_funil é Resolvido', () => {
    assert.equal(buildReopenTicket('inbound', 'open', 'Resolvido'), true);
  });

  it('não reabre para mensagem outbound mesmo que esteja resolvida', () => {
    assert.equal(buildReopenTicket('outbound', 'resolved', 'Resolvido'), false);
  });

  it('não reabre quando ticket está aberto e funil está ativo', () => {
    assert.equal(buildReopenTicket('inbound', 'open', 'Lead'), false);
  });
});

// ─── Suíte: montagem do payload de contato ───────────────────────────────────

describe('buildContactPayload', () => {
  const base = {
    userId:       'user-123',
    cleanPhone:   '5511999999999',
    resolvedName: 'Carlos Silva',
    text:         'Olá, preciso de ajuda',
    timestamp:    1700000000000,
    direction:    'inbound'
  };

  it('gera id composto user_phone', () => {
    const p = buildContactPayload({ ...base, existingContact: null });
    assert.equal(p.id, 'user-123_5511999999999');
  });

  it('seta source=whatsapp', () => {
    const p = buildContactPayload({ ...base, existingContact: null });
    assert.equal(p.source, 'whatsapp');
  });

  it('increment_count=true para inbound', () => {
    const p = buildContactPayload({ ...base, existingContact: null });
    assert.equal(p.increment_count, true);
  });

  it('increment_count=false para outbound', () => {
    const p = buildContactPayload({ ...base, existingContact: null, direction: 'outbound' });
    assert.equal(p.increment_count, false);
  });

  it('reopen_ticket=true quando contato estava Resolvido e é inbound', () => {
    const p = buildContactPayload({
      ...base,
      existingContact: { status_funil: 'Resolvido', total_mensagens: 5 }
    });
    assert.equal(p.reopen_ticket, true);
  });

  it('preserva primeiro_contato do contato existente', () => {
    const existingContact = {
      status_funil:    'Lead',
      total_mensagens: 10,
      primeiro_contato:'2024-01-01T00:00:00.000Z',
      data_criacao:    '2024-01-01T00:00:00.000Z'
    };
    const p = buildContactPayload({ ...base, existingContact });
    assert.equal(p.primeiro_contato, '2024-01-01T00:00:00.000Z');
  });

  it('trunca ultima_mensagem em 500 caracteres', () => {
    const longText = 'x'.repeat(600);
    const p = buildContactPayload({ ...base, existingContact: null, text: longText });
    assert.equal(p.ultima_mensagem.length, 500);
  });
});

// ─── Suíte: isPhoneOnly ──────────────────────────────────────────────────────

describe('isPhoneOnly', () => {
  it('detecta número brasileiro como telefone', () => {
    assert.equal(isPhoneOnly('5511999999999'), true);
  });

  it('detecta nome real como não-telefone', () => {
    assert.equal(isPhoneOnly('João Silva'), false);
  });

  it('detecta nome com número mas com letras como não-telefone', () => {
    assert.equal(isPhoneOnly('João2'), false);
  });

  it('retorna true para null/undefined', () => {
    assert.equal(isPhoneOnly(null), true);
    assert.equal(isPhoneOnly(''), true);
  });
});
