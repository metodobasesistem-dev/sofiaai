-- =============================================================================
-- WPPAI — Módulo Financeiro (Fase 1)
-- Execute no Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Categorias Financeiras
CREATE TABLE IF NOT EXISTS financial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('receita', 'despesa')) NOT NULL,
  cor TEXT DEFAULT '#6366f1',
  icone TEXT DEFAULT 'Tag',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Transações
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  tipo TEXT CHECK (tipo IN ('entrada', 'saida')) NOT NULL,
  status TEXT CHECK (status IN ('pago', 'pendente', 'cancelado')) DEFAULT 'pendente',
  data_pagamento DATE DEFAULT CURRENT_DATE,
  categoria_id UUID REFERENCES financial_categories(id) ON DELETE SET NULL,
  metodo_pagamento TEXT, -- 'pix', 'cartao', 'dinheiro', 'boleto'
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habilitar RLS (Segurança)
ALTER TABLE financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

-- Políticas Categorias
CREATE POLICY "Categorias: Dono pode tudo" ON financial_categories
  FOR ALL USING (auth.uid() = user_id);

-- Políticas Transações
CREATE POLICY "Transações: Dono pode tudo" ON financial_transactions
  FOR ALL USING (auth.uid() = user_id);

-- 4. Categorias Padrão (Opcional - Insere para novos usuários via Trigger ou Manual)
-- Você pode rodar isso para popular o seu usuário atual se desejar:
-- INSERT INTO financial_categories (user_id, nome, tipo, cor) VALUES 
-- ('SEU_USER_ID', 'Venda de Serviço', 'receita', '#10b981'),
-- ('SEU_USER_ID', 'Venda de Produto', 'receita', '#3b82f6'),
-- ('SEU_USER_ID', 'Aluguel', 'despesa', '#ef4444'),
-- ('SEU_USER_ID', 'Marketing', 'despesa', '#f59e0b');
