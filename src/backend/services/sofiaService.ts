import { supabase } from '../lib/supabaseClient.js';
import { generateAIResponse, generateEmbedding } from './aiService.js';

export const sofiaService = {
  /**
   * Main chat function for Sofia
   */
  async chat(userId: string, tenantId: string, message: string) {
    // 1. Save user message
    await supabase.from('sofia_messages').insert({
      tenant_id: tenantId,
      user_id: userId,
      role: 'user',
      content: message
    });

    // 2. Search relevant memory
    const embedding = await generateEmbedding(message, userId);
    let context = '';
    
    if (embedding) {
      const { data: memories } = await supabase.rpc('match_sofia_memory', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 5,
        p_tenant_id: tenantId
      });

      if (memories && memories.length > 0) {
        context = "Informações que você já sabe sobre este cliente/negócio:\n" + 
          memories.map((m: any) => `- ${m.content}`).join('\n');
      }
    }

    // 3. Get recent history
    const { data: history } = await supabase.from('sofia_messages')
      .select('role, content')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10);

    const formattedHistory = (history || []).reverse().map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content
    }));

    // 4. Sofia's Persona
    const systemPrompt = `Você é a Sofia, a inteligência central do sistema Wppai. 
Sua missão é ser uma parceira estratégica para o usuário, ajudando-o a configurar automações, dar conselhos sobre vendas e entender o comportamento dos leads.

TONALIDADE:
- Profissional, mas acolhedora.
- Proativa: se notar algo que pode ser melhorado, sugira.
- Inteligente: use o contexto fornecido sobre o negócio do cliente para dar respostas personalizadas.

CONTEXTO ATUAL:
${context || 'Nenhuma informação específica memorizada ainda.'}

DIRETRIZES:
- Se o usuário passar uma informação nova e importante (ex: "meu preço mudou para R$50"), confirme que você memorizou isso.
- Se o usuário pedir conselhos, use sua base de conhecimento para sugerir estratégias de WhatsApp Marketing.
- Mantenha respostas concisas, mas completas.`;

    // 5. Generate AI Response
    const response = await generateAIResponse(systemPrompt, formattedHistory, [], 'auto', userId);
    const sofiaText = response.text || "Desculpe, tive um pequeno problema ao processar sua mensagem. Poderia repetir?";

    // 6. Save assistant message
    await supabase.from('sofia_messages').insert({
      tenant_id: tenantId,
      user_id: userId,
      role: 'assistant',
      content: sofiaText
    });

    // 7. Background: Memory Extraction
    // Trigger memory extraction only if the message seems informative
    this.extractAndSaveMemory(userId, tenantId, message, sofiaText).catch(err => {
      console.error('[SofiaService] Memory extraction error:', err);
    });

    return sofiaText;
  },

  /**
   * Extracts useful knowledge from the interaction and saves it to sofia_memory
   */
  async extractAndSaveMemory(userId: string, tenantId: string, userMsg: string, assistantMsg: string) {
    const extractionPrompt = `Analise a conversa abaixo e identifique se há alguma informação relevante sobre o negócio, preferências ou regras do cliente que deve ser lembrada permanentemente.
    
USUÁRIO: "${userMsg}"
SOFIA: "${assistantMsg}"

Regras:
- Extraia apenas fatos concretos (ex: horários, preços, metas, nomes de produtos, tom de voz).
- Se não houver nada relevante para memorizar, retorne "NONE".
- Se houver algo, retorne APENAS o fato extraído de forma clara e direta em uma única frase.`;

    const extraction = await generateAIResponse(extractionPrompt, [], [], 'none', userId);
    const fact = extraction.text;

    if (fact && fact !== 'NONE' && fact.length > 5) {
      const embedding = await generateEmbedding(fact, userId);
      if (embedding) {
        await supabase.from('sofia_memory').insert({
          tenant_id: tenantId,
          content: fact,
          embedding: embedding,
          category: 'extracted_from_chat'
        });
        console.log(`[SofiaService] 🧠 Nova memória salva: ${fact}`);
      }
    }
  },

  /**
   * Retrieves chat history for the UI
   */
  async getHistory(tenantId: string) {
    const { data } = await supabase.from('sofia_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(50);
    return data || [];
  }
};
