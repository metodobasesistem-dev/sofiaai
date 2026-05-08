import { supabase } from '../lib/supabaseClient';
import { generateAIResponse, generateEmbedding } from './aiService';
import { format } from 'date-fns';

export const sofiaService = {
  /**
   * Get recent history for history view
   */
  async getHistory(tenantId: string) {
    const { data: history } = await supabase.from('sofia_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    return history || [];
  },

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

    // 2. Fetch System Context (The "Unlimited Access" part)
    const systemStats = await this.getSystemStats(userId, tenantId);

    // 3. Search relevant memory
    const embedding = await generateEmbedding(message, userId);
    let semanticContext = '';
    
    if (embedding) {
      const { data: memories } = await supabase.rpc('match_sofia_memory', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 5,
        p_tenant_id: tenantId
      });

      if (memories && memories.length > 0) {
        semanticContext = "MEMÓRIA SEMÂNTICA (Fatos memorizados anteriormente):\n" + 
          memories.map((m: any) => `- ${m.content}`).join('\n');
      }
    }

    // 4. Get recent history
    const { data: history } = await supabase.from('sofia_messages')
      .select('role, content')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    const formattedHistory = (history || []).reverse().map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content
    }));

    // 5. Sofia's Persona
    const { data: profile } = await supabase.from('profiles')
      .select('sofia_prompt, nome_empresa, nicho')
      .eq('id', userId)
      .single();

    const now = new Date();
    const systemPrompt = `Você é a Sofia, a inteligência central e parceira estratégica do ecossistema Wppai.
Você tem ACESSO TOTAL ao sistema para ajudar o usuário a gerir o negócio.

TONALIDADE:
- Estratégica, inteligente e proativa.
- Você não é apenas uma atendente, você é uma CO-PILOTO do empresário.

DADOS EM TEMPO REAL DO SISTEMA (DASHBOARD):
${systemStats}

${semanticContext || ''}

DIRETRIZES:
- Se o usuário perguntar sobre "uma conversa", "um cliente" ou "um contato" pelo nome:
  1. Use 'search_contacts' para encontrar o telefone dele.
  2. Use o telefone encontrado para chamar 'get_chat_history'.
- Use as estatísticas acima para dar insights (ex: "Vi que você tem X agendamentos hoje").
- Horário Atual: ${format(now, 'HH:mm')} de ${format(now, 'dd/MM/yyyy')}.

PROMPT CUSTOMIZADO:
${profile?.sofia_prompt || 'Aja como uma consultora de alta performance estratégica.'}`;

    // 6. Tools Definition
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_detailed_stats',
          description: 'Obtém estatísticas detalhadas do CRM, contatos e conversões.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_appointments',
          description: 'Lista agendamentos para um período específico.',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Data início YYYY-MM-DD' },
              endDate: { type: 'string', description: 'Data fim YYYY-MM-DD' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'analyze_agents',
          description: 'Lista todos os agentes de IA e seu status de configuração.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_active_conversations',
          description: 'Lista as conversas mais recentes no CRM (threads).',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_chat_history',
          description: 'Recupera o histórico de mensagens de uma conversa específica para análise.',
          parameters: {
            type: 'object',
            properties: {
              contactPhone: { type: 'string', description: 'Telefone do contato (apenas números)' }
            },
            required: ['contactPhone']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_contacts',
          description: 'Busca contatos no CRM por nome ou telefone para obter detalhes.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Nome ou parte do nome do contato' }
            },
            required: ['query']
          }
        }
      }
    ];

    // 7. AI Loop with Tools (Max 5 iterations to prevent infinite loops)
    let currentMessages = [
      ...formattedHistory,
      { role: 'user', content: message }
    ];

    let aiFinalText = "";
    let iterations = 0;
    const MAX_ITERATIONS = 5;
    
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      try {
        const response = await generateAIResponse(systemPrompt, currentMessages, tools, 'auto', userId);
        
        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log(`[SofiaService] 🛠️ AI requested ${response.toolCalls.length} tools:`, response.toolCalls.map(tc => tc.function.name));
          
          // OpenAI requirement: content must be null when tool_calls is present
          currentMessages.push({ 
            role: 'assistant', 
            content: response.text || null as any, 
            tool_calls: response.toolCalls 
          });

          for (const toolCall of response.toolCalls) {
            const name = toolCall.function.name;
            let args: any = {};
            
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch (pErr) {
              console.error(`[SofiaService] JSON Parse Error for tool ${name}:`, toolCall.function.arguments);
            }

            console.log(`[SofiaService] 🚀 Executing tool: ${name}`, args);
            let result;

            try {
              if (name === 'get_detailed_stats') result = await this.getSystemStats(userId, tenantId, true);
              else if (name === 'list_appointments') result = await this.fetchAppointments(userId, args.startDate, args.endDate);
              else if (name === 'analyze_agents') result = await this.fetchAgentsInfo(userId);
              else if (name === 'list_active_conversations') result = await this.fetchActiveThreads(userId);
              else if (name === 'get_chat_history') result = await this.fetchThreadMessages(userId, args.contactPhone);
              else if (name === 'search_contacts') result = await this.searchContacts(userId, args.query);
              else result = { error: 'Tool not found' };
              
              console.log(`[SofiaService] ✅ Tool ${name} result size:`, JSON.stringify(result).length);
            } catch (toolErr: any) {
              console.error(`[SofiaService] ❌ Tool ${name} execution error:`, toolErr);
              result = { error: toolErr.message || 'Internal tool error' };
            }

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: name,
              content: JSON.stringify(result || { success: false })
            });
          }
        } else {
          aiFinalText = response.text || "Estou aqui para ajudar!";
          break;
        }
      } catch (aiErr: any) {
        console.error('[SofiaService] AI Generation Error:', aiErr);
        aiFinalText = "Desculpe, tive um problema ao processar sua resposta agora. Pode tentar novamente?";
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      aiFinalText = "Estou com um pouco de dificuldade para processar tantos dados agora. Pode ser mais específico na sua pergunta?";
    }

    // 8. Save assistant message
    await supabase.from('sofia_messages').insert({
      tenant_id: tenantId,
      user_id: userId,
      role: 'assistant',
      content: aiFinalText
    });

    // 9. Memory Extraction (Background)
    this.extractAndSaveMemory(userId, tenantId, message, aiFinalText).catch(() => {});

    return aiFinalText;
  },

  async getSystemStats(userId: string, tenantId: string, detailed = false) {
    try {
      const [
        { count: totalContacts },
        { count: totalAppointments },
        { count: activeAgents },
        { data: recentLeads }
      ] = await Promise.all([
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'cancelled'),
        supabase.from('agents').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_ativo', true),
        supabase.from('contacts').select('nome, status_funil').eq('user_id', userId).order('data_criacao', { ascending: false }).limit(5)
      ]);

      let stats = `ESTATÍSTICAS GERAIS:
- Total de Contatos no CRM: ${totalContacts || 0}
- Agendamentos Ativos: ${totalAppointments || 0}
- Agentes de IA Online: ${activeAgents || 0}
- Últimos leads interessados: ${(recentLeads || []).map(l => `${l.nome} (${l.status_funil})`).join(', ')}`;

      if (detailed) {
        const { data: funil } = await supabase.from('contacts').select('status_funil');
        const counts: any = {};
        (funil || []).forEach(c => counts[c.status_funil] = (counts[c.status_funil] || 0) + 1);
        stats += `\nDETALHAMENTO FUNIL: ${JSON.stringify(counts)}`;
      }

      return stats;
    } catch (err) {
      return "Erro ao carregar estatísticas do sistema.";
    }
  },

  async fetchAppointments(userId: string, start?: string, end?: string) {
    const query = supabase.from('appointments').select('*').eq('user_id', userId);
    if (start) query.gte('data', start);
    if (end) query.lte('data', end);
    const { data } = await query.limit(20);
    return data;
  },

  async fetchAgentsInfo(userId: string) {
    const { data } = await supabase.from('agents').select('nome, status_ativo, nicho').eq('user_id', userId);
    return data;
  },

  async fetchActiveThreads(userId: string) {
    const { data } = await supabase.from('threads')
      .select('id, contact_name, display_phone, last_message, last_message_time, status')
      .eq('user_id', userId)
      .order('last_message_time', { ascending: false })
      .limit(10);
    return data;
  },

  async fetchThreadMessages(userId: string, phone: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Try multiple ID patterns
    const patterns = [
      `${userId}_${cleanPhone}`,
      cleanPhone,
      `${cleanPhone}@s.whatsapp.net`
    ];

    let messages: any[] = [];
    
    for (const tid of patterns) {
      const { data } = await supabase.from('messages')
        .select('direction, text, timestamp, message_type')
        .eq('thread_id', tid)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(30);
      
      if (data && data.length > 0) {
        messages = data;
        break;
      }
    }
    
    return messages.reverse();
  },

  async searchContacts(userId: string, query: string) {
    const { data } = await supabase.from('contacts')
      .select('id, nome, telefone, status_funil')
      .eq('user_id', userId)
      .or(`nome.ilike.%${query}%,telefone.ilike.%${query}%`)
      .limit(5);
    return data;
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
