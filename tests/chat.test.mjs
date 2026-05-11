/**
 * ============================================================
 * CHAT SYSTEM — TEST SUITE (Node.js native test runner)
 * ============================================================
 * Execute com:  node --experimental-vm-modules tests/chat.test.mjs
 * ou:           npm run test:chat
 *
 * Testa os contratos e fluxos críticos do sistema de chat
 * SEM depender de banco de dados real (mocks puros).
 * ============================================================
 */

import { test, describe, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── MOCKS ────────────────────────────────────────────────────────────────────

/**
 * Mock do Supabase Client — simula todas as operações de banco.
 * Cada método pode ser substituído no teste específico.
 */
function createSupabaseMock(overrides = {}) {
  const defaults = {
    upsertResult: { data: [{ id: 'mock-thread' }], error: null },
    insertResult: { data: [{ id: 'mock-msg' }], error: null },
    selectResult: { data: null, error: null },
    updateResult: { data: null, error: null },
    deleteResult: { data: null, error: null },
    ...overrides
  };

  const chainable = (result) => ({
    eq: () => chainable(result),
    neq: () => chainable(result),
    ilike: () => chainable(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    select: () => chainable(result),
    order: () => chainable(result),
    gt: () => chainable(result),
    limit: () => chainable(result),
    then: (resolve) => Promise.resolve(result).then(resolve),
    [Symbol.toStringTag]: 'MockQuery'
  });

  return {
    from: (table) => ({
      upsert: () => chainable(defaults.upsertResult),
      insert: () => chainable(defaults.insertResult),
      select: () => chainable(defaults.selectResult),
      update: () => chainable(defaults.updateResult),
      delete: () => chainable(defaults.deleteResult),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'mock-token' } } })
    },
    storage: {
      from: () => ({ remove: () => Promise.resolve({ error: null }) })
    }
  };
}

// ─── HELPERS PUROS (sem dependência de DB) ──────────────────────────────────

/**
 * Replica a lógica de normalizePhone para testar isoladamente
 */
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) {
    const area = digits.slice(0, 2);
    const number = digits.slice(2);
    return `55${area}9${number}`;
  }
  return digits;
}

/**
 * Replica a lógica de formatação de mensagem do Inbox.tsx
 */
function formatMessage(dbRow) {
  return {
    id: dbRow.id,
    text: dbRow.text || '',
    sender: dbRow.id?.startsWith('private-') 
      ? 'private' 
      : (dbRow.direction === 'inbound' || dbRow.direction === 'received' 
        ? 'lead' 
        : (dbRow.whatsapp_id?.startsWith('ai-') ? 'ia' : 'outbound')),
    time: dbRow.created_at 
      ? new Date(dbRow.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
      : '',
    status: dbRow.status,
    message_type: dbRow.message_type || 'text',
  };
}

/**
 * Replica a lógica de deduplicação de mensagens do Inbox
 */
function deduplicateMessages(prev, newMsg) {
  if (prev.some(m => m.id === newMsg.id)) return prev;

  const isTemp = String(newMsg.id).startsWith('sending-');
  const newTime = new Date(newMsg.timestamp || newMsg.created_at || 0).getTime();

  if (!isTemp) {
    const tempIdx = prev.findIndex(m =>
      String(m.id).startsWith('sending-') &&
      (Math.abs(new Date(m.timestamp || 0).getTime() - newTime) < 2000 || m.text === newMsg.text)
    );
    if (tempIdx !== -1) {
      const updated = [...prev];
      updated[tempIdx] = newMsg;
      return updated;
    }
  } else {
    const hasDefinitive = prev.some(m =>
      !String(m.id).startsWith('sending-') &&
      (Math.abs(new Date(m.timestamp || 0).getTime() - newTime) < 2000 || m.text === newMsg.text)
    );
    if (hasDefinitive) return prev;
  }

  return [...prev, newMsg];
}

/**
 * Replica o mapeamento de status do MESSAGES_UPDATE handler
 */
function mapWhatsAppStatus(rawStatus) {
  const statusMap = {
    'PENDING':       'pending',
    'SERVER_ACK':    'sent',
    'DELIVERY_ACK':  'delivered',
    'READ':          'read',
    'PLAYED':        'read'
  };
  return statusMap[(rawStatus || '').toUpperCase()] || null;
}

// ─── TESTES ───────────────────────────────────────────────────────────────────

describe('📱 Phone Normalization', () => {

  test('adds 55 country code to 11-digit number', () => {
    assert.equal(normalizePhone('11987654321'), '5511987654321');
  });

  test('adds 55 country code to 10-digit number (adds 9th digit)', () => {
    assert.equal(normalizePhone('1187654321'), '5511987654321');
  });

  test('preserves already normalized number', () => {
    assert.equal(normalizePhone('5511987654321'), '5511987654321');
  });

  test('strips non-numeric characters', () => {
    assert.equal(normalizePhone('+55 (11) 9 8765-4321'), '5511987654321');
  });

  test('returns empty string for null/empty input', () => {
    assert.equal(normalizePhone(''), '');
    assert.equal(normalizePhone(null), '');
  });

  test('JID format (strips @s.whatsapp.net) is correctly handled', () => {
    const jid = '5511987654321@s.whatsapp.net';
    const phone = jid.split('@')[0];
    assert.equal(normalizePhone(phone), '5511987654321');
  });
});

describe('💬 Message Formatting', () => {

  test('inbound message maps to lead sender', () => {
    const msg = formatMessage({ id: 'abc', text: 'Oi', direction: 'inbound', created_at: new Date().toISOString() });
    assert.equal(msg.sender, 'lead');
  });

  test('outbound message maps to outbound sender', () => {
    const msg = formatMessage({ id: 'xyz', text: 'Olá', direction: 'outbound', created_at: new Date().toISOString() });
    assert.equal(msg.sender, 'outbound');
  });

  test('AI message (ai- prefix) maps to ia sender', () => {
    const msg = formatMessage({ id: 'ai-123', text: 'Posso ajudar?', direction: 'outbound', whatsapp_id: 'ai-123', created_at: new Date().toISOString() });
    assert.equal(msg.sender, 'ia');
  });

  test('private note maps to private sender', () => {
    const msg = formatMessage({ id: 'private-abc', text: 'Nota interna', direction: 'outbound', created_at: new Date().toISOString() });
    assert.equal(msg.sender, 'private');
  });

  test('message_type defaults to text when absent', () => {
    const msg = formatMessage({ id: 'abc', direction: 'inbound', created_at: new Date().toISOString() });
    assert.equal(msg.message_type, 'text');
  });

  test('received direction maps to lead sender', () => {
    const msg = formatMessage({ id: 'abc', direction: 'received', created_at: new Date().toISOString() });
    assert.equal(msg.sender, 'lead');
  });
});

describe('🔄 Message Deduplication (Realtime)', () => {

  test('does not add duplicate message (same id)', () => {
    const prev = [{ id: 'msg1', text: 'Oi', timestamp: Date.now() }];
    const newMsg = { id: 'msg1', text: 'Oi', timestamp: Date.now() };
    const result = deduplicateMessages(prev, newMsg);
    assert.equal(result.length, 1);
  });

  test('replaces temporary (sending-) message with real one by text match', () => {
    const now = Date.now();
    const prev = [{ id: 'sending-123', text: 'Olá cliente', timestamp: now }];
    const newMsg = { id: 'real-wamid-abc', text: 'Olá cliente', timestamp: now + 100 };
    const result = deduplicateMessages(prev, newMsg);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'real-wamid-abc');
  });

  test('replaces temporary message with real one by time proximity (< 2s)', () => {
    const now = Date.now();
    const prev = [{ id: 'sending-456', text: 'Texto A', timestamp: now }];
    const newMsg = { id: 'real-wamid-xyz', text: 'Texto A editado', timestamp: now + 1000 };
    const result = deduplicateMessages(prev, newMsg);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'real-wamid-xyz');
  });

  test('ignores incoming temp (sending-) when real message already exists', () => {
    const now = Date.now();
    const prev = [{ id: 'real-wamid-111', text: 'Confirmado', timestamp: now }];
    const tempMsg = { id: 'sending-999', text: 'Confirmado', timestamp: now + 50 };
    const result = deduplicateMessages(prev, tempMsg);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'real-wamid-111');
  });

  test('adds new distinct messages to the list', () => {
    const prev = [{ id: 'msg1', text: 'Primeira', timestamp: Date.now() - 5000 }];
    const newMsg = { id: 'msg2', text: 'Segunda', timestamp: Date.now() };
    const result = deduplicateMessages(prev, newMsg);
    assert.equal(result.length, 2);
  });
});

describe('📬 WhatsApp Status Mapping (MESSAGES_UPDATE)', () => {

  test('PENDING maps to pending', () => {
    assert.equal(mapWhatsAppStatus('PENDING'), 'pending');
  });

  test('SERVER_ACK maps to sent', () => {
    assert.equal(mapWhatsAppStatus('SERVER_ACK'), 'sent');
  });

  test('DELIVERY_ACK maps to delivered', () => {
    assert.equal(mapWhatsAppStatus('DELIVERY_ACK'), 'delivered');
  });

  test('READ maps to read', () => {
    assert.equal(mapWhatsAppStatus('READ'), 'read');
  });

  test('PLAYED (audio) maps to read', () => {
    assert.equal(mapWhatsAppStatus('PLAYED'), 'read');
  });

  test('lowercase input is handled correctly', () => {
    assert.equal(mapWhatsAppStatus('delivery_ack'), 'delivered');
  });

  test('unknown status returns null (safe fallback)', () => {
    assert.equal(mapWhatsAppStatus('UNKNOWN_STATUS'), null);
    assert.equal(mapWhatsAppStatus(''), null);
    assert.equal(mapWhatsAppStatus(null), null);
  });
});

describe('🗑️ Thread & Message Deletion Logic', () => {

  test('thread ID is correctly derived from userId and phone', () => {
    const userId = 'user-uuid-123';
    const cleanPhone = '5511987654321';
    const threadId = `${userId}_${cleanPhone}`;
    assert.equal(threadId, 'user-uuid-123_5511987654321');
  });

  test('contact name priority: CRM > existing thread > pushName > phone', () => {
    const resolveContactName = (crmName, existingThreadName, pushName, phone) => {
      return crmName || existingThreadName || pushName || phone;
    };
    assert.equal(resolveContactName('João CRM', 'João Thread', 'João WA', '5511999'), 'João CRM');
    assert.equal(resolveContactName(null, 'João Thread', 'João WA', '5511999'), 'João Thread');
    assert.equal(resolveContactName(null, null, 'João WA', '5511999'), 'João WA');
    assert.equal(resolveContactName(null, null, null, '5511999'), '5511999');
  });

  test('JID format for deletion uses @s.whatsapp.net', () => {
    const threadId = 'user-uuid_5511987654321';
    const remoteJid = threadId.includes('_')
      ? threadId.split('_')[1] + '@s.whatsapp.net'
      : threadId;
    assert.equal(remoteJid, '5511987654321@s.whatsapp.net');
  });
});

describe('📸 Profile Picture Cache Logic', () => {

  test('photo is considered stale after 24 hours', () => {
    const isPhotoStale = (updatedAt) => {
      if (!updatedAt) return true;
      const ageHours = (Date.now() - new Date(updatedAt).getTime()) / 3600000;
      return ageHours >= 24;
    };
    
    const fresh = new Date(Date.now() - 1 * 3600000).toISOString(); // 1h atrás
    const stale = new Date(Date.now() - 25 * 3600000).toISOString(); // 25h atrás
    const noDate = null;
    
    assert.equal(isPhotoStale(fresh), false);
    assert.equal(isPhotoStale(stale), true);
    assert.equal(isPhotoStale(noDate), true);
  });

  test('batch fetch skips threads with fresh photos', () => {
    const now = Date.now();
    const threads = [
      { id: 't1', profilePictureUrl: 'https://...', profilePictureUpdatedAt: new Date(now - 1 * 3600000).toISOString() },  // fresh
      { id: 't2', profilePictureUrl: null, profilePictureUpdatedAt: null },  // no photo
      { id: 't3', profilePictureUrl: 'https://...', profilePictureUpdatedAt: new Date(now - 25 * 3600000).toISOString() }, // stale
    ];

    const stale = threads.filter(t => {
      if (!t.profilePictureUrl) return true;
      if (!t.profilePictureUpdatedAt) return true;
      const ageHours = (now - new Date(t.profilePictureUpdatedAt).getTime()) / 3600000;
      return ageHours >= 24;
    });

    assert.equal(stale.length, 2);
    assert.ok(stale.find(t => t.id === 't2'));
    assert.ok(stale.find(t => t.id === 't3'));
    assert.ok(!stale.find(t => t.id === 't1'));
  });
});

describe('🔁 Exponential Backoff (withRetry)', () => {

  test('succeeds on first try without retrying', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      return 'success';
    });
    assert.equal(result, 'success');
    assert.equal(attempts, 1);
  });

  test('retries on failure and succeeds on second attempt', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient error');
      return 'recovered';
    }, 3, 1); // delay mínimo para o teste ser rápido
    assert.equal(result, 'recovered');
    assert.equal(attempts, 2);
  });

  test('does not retry on constraint violation (23505)', async () => {
    let attempts = 0;
    await assert.rejects(async () => {
      await withRetry(async () => {
        attempts++;
        const err = new Error('duplicate key');
        err.code = '23505';
        throw err;
      }, 3, 1);
    });
    assert.equal(attempts, 1); // Não tentou mais de uma vez
  });

  test('throws after max attempts exhausted', async () => {
    let attempts = 0;
    await assert.rejects(async () => {
      await withRetry(async () => {
        attempts++;
        throw new Error('persistent error');
      }, 3, 1);
    }, { message: 'persistent error' });
    assert.equal(attempts, 3);
  });
});

// Helper para testes do withRetry (duplicada aqui para ser autossuficiente)
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 300) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err?.code === '23505' || err?.code === '23503') throw err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError;
}

console.log('✅ Chat test suite loaded. Running...\n');
