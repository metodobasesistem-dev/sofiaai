/**
 * Finance API Routes — geração das mensalidades a partir da carteira.
 *
 * A tela de Financeiro lê e escreve lançamentos direto no Supabase (RLS por
 * dono). Aqui mora só o que precisa cruzar clientes × financeiro, que envolve
 * regra de negócio e não caberia no browser.
 */
import { Router, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth as any);

const CATEGORIA_MENSALIDADES = 'Mensalidades';

/** Primeiro dia do mês, que é como a competência é sempre gravada. */
export function inicioDoMes(referencia?: string): string {
  const base = referencia ? new Date(`${referencia}-01T12:00:00`) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1, 12).toISOString().slice(0, 10);
}

/**
 * Um cliente gera cobrança neste mês?
 *  - mensal: todo mês
 *  - anual: só no mês de aniversário da entrada
 *  - único: nunca (não é recorrente)
 */
export function cobraNesteMes(ficha: any, competencia: string): boolean {
  if (!ficha?.mensalidade || Number(ficha.mensalidade) <= 0) return false;
  if (ficha.status_contrato !== 'ativo') return false;

  const inicio = ficha.cliente_desde ? new Date(`${ficha.cliente_desde}T12:00:00`) : null;
  const mes = new Date(`${competencia}T12:00:00`);

  // Não cobra antes de o cliente entrar
  if (inicio && inicio > mes) {
    const mesmoMes =
      inicio.getFullYear() === mes.getFullYear() && inicio.getMonth() === mes.getMonth();
    if (!mesmoMes) return false;
  }

  if (ficha.ciclo === 'unico') return false;
  if (ficha.ciclo === 'anual') {
    return inicio ? inicio.getMonth() === mes.getMonth() : false;
  }
  return true; // mensal
}

// ─── POST /api/v2/finance/gerar-mensalidades ──────────────────────────────
// Cria os lançamentos previstos do mês para os clientes ativos.
// Idempotente: o índice único (contact_id, competencia) para origem
// 'mensalidade' garante que clicar duas vezes não duplique.
router.post('/gerar-mensalidades', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const competencia = inicioDoMes(req.body?.competencia);

  try {
    // 1. Clientes da carteira
    const { data: clientes, error: cErr } = await supabase
      .from('contacts')
      .select('id, nome')
      .eq('user_id', userId)
      .eq('is_client', true);
    if (cErr) throw cErr;

    if (!clientes?.length) {
      return res.json({ success: true, criados: 0, pulados: 0, competencia, mensagem: 'Nenhum cliente na carteira.' });
    }

    const { data: fichas, error: fErr } = await supabase
      .from('client_profiles')
      .select('*')
      .eq('user_id', userId)
      .in('contact_id', clientes.map(c => c.id));
    if (fErr) throw fErr;

    const porContato = new Map((fichas || []).map(f => [f.contact_id, f]));

    // 2. Categoria "Mensalidades" (criada na primeira geração)
    let categoriaId: string | null = null;
    const { data: cat } = await supabase
      .from('financial_categories')
      .select('id')
      .eq('user_id', userId)
      .eq('nome', CATEGORIA_MENSALIDADES)
      .maybeSingle();

    if (cat) {
      categoriaId = cat.id;
    } else {
      const { data: nova, error: catErr } = await supabase
        .from('financial_categories')
        .insert({ user_id: userId, nome: CATEGORIA_MENSALIDADES, tipo: 'receita' })
        .select('id')
        .single();
      if (catErr) throw catErr;
      categoriaId = nova.id;
    }

    // 3. Um lançamento pendente por cliente que cobra neste mês
    const [ano, mes] = competencia.split('-');
    const rotulo = `${mes}/${ano}`;
    let criados = 0;
    let pulados = 0;
    const erros: string[] = [];

    for (const cliente of clientes) {
      const ficha = porContato.get(cliente.id);
      if (!cobraNesteMes(ficha, competencia)) { pulados++; continue; }

      const { error } = await supabase.from('financial_transactions').insert({
        user_id: userId,
        descricao: `Mensalidade ${rotulo} — ${cliente.nome}`,
        valor: Number(ficha.mensalidade),
        tipo: 'entrada',
        status: 'pendente',
        data_pagamento: competencia,
        categoria_id: categoriaId,
        contact_id: cliente.id,
        origem: 'mensalidade',
        competencia,
      });

      if (error) {
        // 23505 = já existe lançamento deste cliente nesta competência, que é
        // exatamente o que o índice único deve impedir. Não é falha.
        if (error.code === '23505') { pulados++; continue; }
        erros.push(`${cliente.nome}: ${error.message}`);
        continue;
      }
      criados++;
    }

    console.log(`[FinanceAPI] mensalidades ${rotulo}: ${criados} criadas, ${pulados} puladas${erros.length ? `, ${erros.length} com erro` : ''}`);
    res.json({ success: erros.length === 0, criados, pulados, competencia, erros });
  } catch (err: any) {
    console.error('[FinanceAPI] gerar-mensalidades:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
