import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse } from './aiService.js';
import { QualificationResult } from '../../types/leo.js';

export const leoQualificationService = {
  async qualifyLead(leadId: string): Promise<QualificationResult> {
    // 1. Buscar lead e interações
    const { data: lead } = await supabase.from('leo_leads').select('*').eq('id', leadId).single();
    const { data: interacoes } = await supabase
      .from('leo_instagram_interacoes')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    // 2. Buscar config da empresa
    const { data: config } = await supabase.from('leo_config').select('*').eq('company_id', lead.company_id).single();

    // 3. Montar histórico para o Gemini
    const historico = interacoes?.map(i => `${i.tipo === 'dm_recebida' ? 'Lead' : 'Leo'}: ${i.conteudo}`).join('\n');
    
    const systemPrompt = `Você é o Leo, um agente de qualificação de leads. Seu objetivo é analisar a conversa abaixo e determinar o score de qualificação do lead (0-100).
    Perguntas de qualificação definidas: ${JSON.stringify(config.perguntas_qualificacao)}
    Score mínimo exigido: ${config.score_minimo}

    Regras:
    - Analise o interesse e o orçamento.
    - O orçamento deve ser compatível com um cliente ideal.
    - Retorne APENAS um JSON no formato:
    {
      "score": number,
      "interesse": "string resumindo o interesse",
      "orcamento": "string resumindo o orçamento",
      "proximo_passo": "o que o Leo deve fazer agora",
      "deve_passar_sofia": boolean
    }`;

    const response = await generateAIResponse(systemPrompt, [{ role: 'user', content: `Histórico da conversa:\n${historico}` }], [], 'none', lead.company_id);
    
    const result: QualificationResult = JSON.parse(response.text || '{}');

    // 4. Atualizar lead
    const updateData: any = {
      score: result.score,
      interesse: result.interesse,
      orcamento: result.orcamento,
      updated_at: new Date().toISOString()
    };

    if (result.deve_passar_sofia && result.score >= config.score_minimo) {
      updateData.status = 'qualificado';
      // Passar para Sofia (WppAi contacts)
      await this.passToSofia(lead, result);
      updateData.status = 'passado_sofia';
      updateData.passado_sofia_em = new Date().toISOString();
    }

    await supabase.from('leo_leads').update(updateData).eq('id', leadId);

    return result;
  },

  async passToSofia(lead: any, result: QualificationResult) {
    // Inserir na tabela contacts do WppAi
    const { error } = await supabase.from('contacts').upsert({
      user_id: lead.company_id, // No WppAi, user_id é o tenant
      nome: lead.nome || 'Lead Instagram',
      telefone: lead.telefone || lead.instagram_uid,
      status_funil: 'Qualificado',
      source: 'leo_instagram',
      ultima_mensagem: result.interesse,
      data_criacao: new Date().toISOString()
    });

    if (error) console.error('[LeoQualificationService] Error passing to Sofia:', error);
  },

  async sendInitialDM(leadId: string, instagramUid: string, companyId: string): Promise<void> {
    const { data: config } = await supabase.from('leo_config').select('mensagem_inicial, instagram_account_id, instagram_access_token').eq('company_id', companyId).single();
    
    if (!config?.instagram_access_token) return;

    // TODO: Implementar chamada real ao Instagram Graph API via POST /{instagram-account-id}/messages
    // Como é um mock/planejamento, vamos apenas registrar a interação
    
    await supabase.from('leo_instagram_interacoes').insert({
      lead_id: leadId,
      tipo: 'dm_enviada',
      conteudo: config.mensagem_inicial
    });
  }
};
