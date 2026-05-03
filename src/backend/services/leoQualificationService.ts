import { supabase } from '../lib/supabaseClient.js';

export const leoQualificationService = {
  async qualifyLead(leadId: string, conversationContext: any) {
    console.log('[LeoQualificationService] Qualifying lead:', leadId);
    // Chamada ao Gemini para calcular score
    const score = 75; // Exemplo
    
    if (score >= 70) {
      await this.passToSofia(leadId);
    }
    
    return score;
  },

  async passToSofia(leadId: string) {
    console.log('[LeoQualificationService] Passing lead to Sofia:', leadId);
    // Inserir na tabela de contatos/conversas do WppAi
  }
};
