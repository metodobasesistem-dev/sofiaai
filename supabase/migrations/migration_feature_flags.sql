-- Criar tabela de Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- Habilitar RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: Todos os usuários autenticados podem ler as flags
CREATE POLICY "Enable read access for all users" ON feature_flags
    FOR SELECT USING (auth.role() = 'authenticated');

-- Política de Escrita: Apenas administradores podem alterar flags
CREATE POLICY "Enable all access for admins only" ON feature_flags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Inserir flags iniciais
INSERT INTO feature_flags (key, label, description, enabled) VALUES
('chat_basic', 'Chat de Atendimento', 'Conversas e atendimento via WhatsApp.', true),
('agent_training_text', 'Treinamento por Texto', 'Treinamento do agente via preenchimento de campos.', true),
('agent_training_audio', 'Treinamento por Áudio', 'Gravação de voz e transcrição para treinar o agente.', false),
('ai_followup_questions', 'Perguntas de Follow-up da IA', 'IA faz perguntas após áudio para refinar o treinamento.', false),
('scheduling', 'Agendamentos', 'Sistema de agendamento integrado ao agente.', false),
('crm', 'CRM', 'Gestão de contatos e pipeline.', false),
('analytics', 'Analytics', 'Relatórios e métricas de atendimento.', false),
('multi_agent', 'Múltiplos Agentes', 'Criação de mais de um agente por conta.', false)
ON CONFLICT (key) DO NOTHING;
