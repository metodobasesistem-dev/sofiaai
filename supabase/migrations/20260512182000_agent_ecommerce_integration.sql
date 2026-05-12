-- Migração para adicionar suporte a Integração de E-commerce / APIs Externas
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS ecommerce_api_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ecommerce_api_type TEXT DEFAULT 'custom', -- 'custom', 'shopify', 'woocommerce'
ADD COLUMN IF NOT EXISTS ecommerce_api_use_nlp BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN agents.ecommerce_api_url IS 'URL base para consulta de produtos/catálogo do cliente.';
COMMENT ON COLUMN agents.ecommerce_api_type IS 'Plataforma de e-commerce utilizada pelo cliente.';
COMMENT ON COLUMN agents.ecommerce_api_use_nlp IS 'Se verdadeiro, tenta utilizar o endpoint /busca-ia se disponível.';
