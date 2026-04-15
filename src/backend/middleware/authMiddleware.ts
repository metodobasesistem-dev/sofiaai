/**
 * Auth Middleware
 * Validates Supabase JWT from Authorization header.
 * Attaches userId to req for downstream handlers.
 */
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Force load env to avoid race conditions in ESM imports
if (!process.env.SUPABASE_URL) {
  if (fs.existsSync('.env.local')) {
    dotenv.config({ path: '.env.local' });
  } else {
    dotenv.config();
  }
}

// Lazy-initialized auth client to ensure environment variables are ready
let authClient: any = null;

function getAuthClient() {
  if (authClient) return authClient;
  
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[AuthMiddleware] WARNING: Missing Supabase credentials for token validation.');
  }

  authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return authClient;
}

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
  const client = getAuthClient();
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      console.error(`[AuthMiddleware] Validation failed: ${error?.message || 'User not found'}`);
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Internal Exception:', err.message);
    res.status(500).json({ error: 'Auth verification failed' });
  }
}

/**
 * Middleware: ensure the authenticated user has the 'admin' role.
 * MUST be used AFTER requireAuth.
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const { supabase } = await import('../lib/supabaseClient.js');
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || profile?.role !== 'admin') {
      console.warn(`[AuthMiddleware] 🚫 Access denied for user ${userId} (Role: ${profile?.role})`);
      res.status(403).json({ error: 'Access denied: Admin role required' });
      return;
    }

    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Admin check error:', err.message);
    res.status(500).json({ error: 'Internal server error while checking role' });
  }
}
