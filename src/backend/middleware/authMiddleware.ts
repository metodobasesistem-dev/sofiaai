/**
 * Auth Middleware
 * Validates Supabase JWT from Authorization header.
 * Attaches userId to req for downstream handlers.
 */
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// Use anon key for JWT verification (validates user tokens)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Middleware: require a valid Supabase JWT.
 * Sets req.userId and req.userEmail on success.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const { data: { user }, error } = await authClient.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Error:', err.message);
    res.status(500).json({ error: 'Auth verification failed' });
  }
}
