import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that sets standard security HTTP headers across all responses.
 */
export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Remove Express fingerprinting header
  res.removeHeader('X-Powered-By');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Cross-site scripting filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (limit unneeded browser sensors)
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=()'
  );

  // Content Security Policy
  // Allows Vite development assets and standard external fonts while enforcing script origins
  const cspDirectives = [
    "default-src 'self' https: http: data: blob: 'unsafe-inline' 'unsafe-eval'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:",
    "style-src 'self' 'unsafe-inline' https: http: https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data: https: http:",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self' ws: wss: https: http:",
    "frame-ancestors *"
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);

  // HSTS (HTTP Strict Transport Security) in production or secure proxy
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  next();
}
