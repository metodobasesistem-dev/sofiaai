import { rateLimit } from 'express-rate-limit';

/**
 * SEC-05: Rate Limiting Strategy
 * 
 * Protege contra abusos sem interferir no uso legítimo.
 */

// 1. Limite para Webhooks (Evolution, Instagram, etc)
// Alta tolerância para evitar perda de mensagens em conversas rápidas.
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 500, 
  message: { error: 'Excesso de tráfego de mensagens. Por favor, aguarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Ignora erros de rate limit nos logs para não poluir
  skipSuccessfulRequests: false,
});

// 2. Limite para Autenticação (Login)
// Proteção contra ataques de força bruta.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. Limite para API de IA (Sofia / Agentes)
// Evita gastos excessivos com tokens e processamento.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  message: { error: 'Limite de requisições atingido. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. Limite para Painel Administrativo (Inquilinos, Stats, etc)
// Maior capacidade para suportar o carregamento de múltiplos dashboards simultâneos.
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500,
  message: { error: 'Limite do painel administrativo atingido. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 5. Limite Global (Segurança geral)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
