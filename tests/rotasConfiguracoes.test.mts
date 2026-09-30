/**
 * Testes das rotas de Configurações e da regra de acesso.
 *
 * O teste de ida e volta existe por um defeito real: 'lead_origin' foi criado
 * como seção mas não registrado em VALID_SUB_TABS. O sintoma não era erro
 * nenhum — buildPath devolvia '/settings', parsePath lia o default e a tela
 * voltava sozinha para a primeira seção ao clicar. Toda seção nova precisa
 * sobreviver a este teste.
 *
 * Execute: npx tsx --test tests/rotasConfiguracoes.test.mts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPath, parsePath, VALID_SUB_TABS, MOVIDAS_PARA_CONFIGURACOES } from '../src/routes.js';
import { podeVer } from '../src/lib/acesso.js';

describe('rotas de Configurações — ida e volta', () => {
  it('toda seção registrada sobrevive a buildPath → parsePath', () => {
    for (const secao of VALID_SUB_TABS.settings) {
      const caminho = buildPath('settings', secao);
      const lido = parsePath(caminho);

      assert.equal(caminho, `/settings/${secao}`, `'${secao}' não virou caminho próprio`);
      assert.equal(lido.subTab, secao, `'${secao}' não voltou igual — a tela cairia no default`);
    }
  });

  it('uma seção NÃO registrada cai no default (o defeito que motivou o teste)', () => {
    assert.equal(buildPath('settings', 'inexistente'), '/settings');
    assert.equal(parsePath('/settings/inexistente').subTab, 'account');
  });

  it('as seções que o rail mostra estão todas registradas', () => {
    // Espelha SECOES em components/Settings.tsx. Uma seção nova no rail sem
    // rota correspondente quebra o clique, sem erro nenhum aparecer.
    const noRail = [
      'account', 'professionals', 'agents', 'quick_replies', 'lead_origin',
      'client_fields', 'loss_reasons', 'availability', 'integrations',
      'ai_config', 'subscription',
    ];
    for (const secao of noRail) {
      assert.ok(
        VALID_SUB_TABS.settings.includes(secao),
        `'${secao}' está no rail mas não em VALID_SUB_TABS.settings`
      );
    }
  });
});

describe('URLs antigas das telas que mudaram de lugar', () => {
  it('cada uma tem destino válido dentro de Configurações', () => {
    for (const [antiga, secao] of Object.entries(MOVIDAS_PARA_CONFIGURACOES)) {
      const destino = buildPath('settings', secao);
      const lido = parsePath(destino);
      assert.equal(lido.tab, 'settings', `/${antiga} não aponta para Configurações`);
      assert.equal(lido.subTab, secao, `/${antiga} não chega em '${secao}'`);
    }
  });

  it('inclui /integrations, que o retorno do OAuth do Google usa', () => {
    assert.equal(MOVIDAS_PARA_CONFIGURACOES.integrations, 'integrations');
  });
});

describe('podeVer — quem enxerga cada item', () => {
  const cliente = (plano: string, flags = {}) => ({ role: 'client', plano, flags });

  it('esconde o que o plano não cobre', () => {
    assert.equal(podeVer({ minPlan: 'Pro' }, cliente('Starter')), false);
    assert.equal(podeVer({ minPlan: 'Pro' }, cliente('Pro')), true);
    assert.equal(podeVer({ minPlan: 'Pro' }, cliente('Elite')), true);
  });

  it('admin ignora o plano mínimo, para dar suporte a qualquer inquilino', () => {
    assert.equal(podeVer({ minPlan: 'Elite' }, { role: 'admin', plano: 'Trial', flags: {} }), true);
  });

  it('a flag desligada vale para todo mundo, inclusive admin', () => {
    // A flag desliga a funcionalidade, não o acesso a ela.
    assert.equal(podeVer({ flag: 'crm' }, { role: 'admin', plano: 'Elite', flags: { crm: false } }), false);
    assert.equal(podeVer({ flag: 'crm' }, cliente('Elite', { crm: false })), false);
  });

  it('flag ausente no banco não esconde o item', () => {
    // Só `=== false` esconde: uma flag que ninguém cadastrou não pode sumir
    // com a tela.
    assert.equal(podeVer({ flag: 'crm' }, cliente('Elite', {})), true);
  });

  it('item sem restrição aparece para qualquer um', () => {
    assert.equal(podeVer({}, cliente('Trial')), true);
  });
});
