import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Middleware to protect against Cross-Site Request Forgery (CSRF).
 * Ensures that state-changing requests (POST, PUT, DELETE, PATCH) originated from legitimate client contexts.
 */
export function csrfProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Allow safe idempotent HTTP methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Allow login endpoint (since user doesn't have session yet)
  if (req.path === '/api/auth/login' || req.path === '/api/health') {
    return next();
  }

  // If request uses Bearer token in Authorization header or x-auth-token header,
  // it is intrinsically immune to standard browser cross-origin form post CSRF.
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers['x-auth-token'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }
  if (tokenHeader && typeof tokenHeader === 'string' && tokenHeader.length > 0) {
    return next();
  }

  // If cookie-based auth is present, check for custom header verification
  const csrfHeader =
    req.headers['x-csrf-token'] ||
    req.headers['x-requested-with'] ||
    req.headers['x-client-request'];

  if (csrfHeader) {
    return next();
  }

  // If content-type is application/json or multipart/form-data with custom origin matching host
  const origin = req.headers['origin'] as string;
  const host = req.headers['host'] as string;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        return next();
      }
    } catch {
      // Invalid URL in origin
    }
  }

  // If none of the security checks pass, reject
  res.status(403).json({
    error:
      'CSRF verification failed: Missing required anti-forgery headers for state-changing request.'
  });
}
