/**
 * Testes de extractAdReferral() e buildAdTracking().
 *
 * Cobre as formas do bloco de anúncio nos dois provedores: a API oficial da
 * Meta (message.referral, snake_case) e a Evolution, onde o dado vive no
 * contextInfo, fora de data.message, sob nomes que mudam com a versão.
 *
 * Execute: npx tsx --test tests/adReferral.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractAdReferral, buildAdTracking } from '../src/backend/lib/adReferral.js';

describe('extractAdReferral — API oficial da Meta', () => {
  it('lê message.referral em snake_case', () => {
    const raw = {
      from: '5532999999999',
      type: 'text',
      referral: {
        source_url: 'https://fb.me/abc?utm_source=instagram&utm_campaign=Setembro',
        source_id: '120210000000000000',
        source_type: 'ad',
        headline: 'Consulta em 24h',
        body: 'Agende agora',
        ctwa_clid: 'ARxyz123',
        image_url: 'https://cdn/img.jpg',
      },
    };

    const r = extractAdReferral(raw);
    assert.ok(r);
    assert.equal(r.source_id, '120210000000000000');
    assert.equal(r.source_type, 'ad');
    assert.equal(r.headline, 'Consulta em 24h');
    assert.equal(r.ctwa_clid, 'ARxyz123');
    assert.equal(r.media_url, 'https://cdn/img.jpg');
  });

  it('devolve null para mensagem comum, sem anúncio', () => {
    assert.equal(extractAdReferral({ from: '553299', type: 'text' }), null);
    assert.equal(extractAdReferral(null), null);
  });
});

describe('extractAdReferral — Evolution', () => {
  it('lê contextInfo.externalAdReply FORA de data.message', () => {
    // Forma que o código antigo não enxergava: ele olhava raw.message.referral.
    const raw = {
      key: { remoteJid: '5532999999999@s.whatsapp.net', id: 'ABC' },
      message: { conversation: 'Oi, vi o anúncio' },
      contextInfo: {
        externalAdReply: {
          title: 'Clareamento dental',
          body: 'Avaliação gratuita',
          sourceId: '120210000000000001',
          sourceUrl: 'https://fb.me/xyz?utm_campaign=Clareamento&utm_source=facebook',
          sourceType: 'ad',
          ctwaClid: 'ARabc789',
          thumbnailUrl: 'https://cdn/thumb.jpg',
        },
      },
    };

    const r = extractAdReferral(raw);
    assert.ok(r, 'deveria ter achado o bloco fora de data.message');
    assert.equal(r.source_id, '120210000000000001');
    assert.equal(r.headline, 'Clareamento dental');
    assert.equal(r.ctwa_clid, 'ARabc789');
  });

  it('aceita o bloco sob ctwaContext (outro nome de versão)', () => {
    const raw = {
      message: { conversation: 'oi' },
      contextInfo: {
        ctwaContext: { sourceId: '999', sourceUrl: 'https://fb.me/a', title: 'Campanha X' },
      },
    };
    const r = extractAdReferral(raw);
    assert.ok(r);
    assert.equal(r.source_id, '999');
    assert.equal(r.headline, 'Campanha X');
  });

  it('aceita snake_case (external_ad_reply)', () => {
    const raw = {
      contextInfo: {
        external_ad_reply: { source_id: '777', title: 'Campanha Y' },
      },
    };
    const r = extractAdReferral(raw);
    assert.ok(r);
    assert.equal(r.source_id, '777');
  });

  it('aceita ctwaClid solto no contextInfo, sem bloco', () => {
    const r = extractAdReferral({ contextInfo: { ctwaClid: 'ARsozinho' } });
    assert.ok(r);
    assert.equal(r.ctwa_clid, 'ARsozinho');
  });

  it('NÃO confunde mensagem citada com anúncio', () => {
    const raw = {
      message: {
        extendedTextMessage: {
          text: 'respondendo',
          contextInfo: { stanzaId: 'XYZ', quotedMessage: { conversation: 'antes' } },
        },
      },
    };
    assert.equal(extractAdReferral(raw), null);
  });
});

describe('buildAdTracking', () => {
  it('extrai os UTM da source_url e usa utm_source como source', () => {
    const t = buildAdTracking({
      source_id: '120210000000000000',
      source_url: 'https://fb.me/abc?utm_source=instagram&utm_campaign=Setembro&utm_content=video1&utm_medium=paid',
      headline: 'Consulta em 24h',
    });

    assert.equal(t.utm_source, 'instagram');
    assert.equal(t.utm_campaign, 'Setembro');
    assert.equal(t.utm_content, 'video1');
    assert.equal(t.utm_medium, 'paid');
    assert.equal(t.source, 'instagram');
    assert.equal(t.type, 'ad');
    assert.ok(t.captured_at);
  });

  it('cai em Meta Ads quando não há utm_source', () => {
    const t = buildAdTracking({ source_id: '123' });
    assert.equal(t.source, 'Meta Ads');
  });

  it('usa utm_campaign como headline quando o anúncio não trouxe título', () => {
    const t = buildAdTracking({ source_url: 'https://fb.me/a?utm_campaign=Black%20Friday' });
    assert.equal(t.headline, 'Black Friday');
  });

  it('ignora URL inválida em silêncio, preservando o source_id', () => {
    const t = buildAdTracking({ source_id: '456', source_url: 'nao-e-url' });
    assert.equal(t.source, 'Meta Ads');
    assert.equal(t.source_id, '456');
  });
});
