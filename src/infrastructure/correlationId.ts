/**
 * Phase 46 — Production Request Correlation ID Middleware
 *
 * Provides end-to-end request tracing and correlation across microservices,
 * background workers, and structured logs.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request declaration
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export const CORRELATION_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Express middleware to propagate or initialize a unique request correlation ID.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Check for incoming correlation ID or request ID headers
  const incomingId =
    (req.headers[CORRELATION_HEADER] as string) ||
    (req.headers[REQUEST_ID_HEADER] as string) ||
    (req.headers[CORRELATION_HEADER.toLowerCase()] as string);

  // 2. Use existing or generate new RFC 4122 v4 UUID with prefix
  const correlationId = incomingId && incomingId.trim().length > 0
    ? incomingId.trim()
    : `req-${crypto.randomUUID()}`;

  // 3. Attach to request object
  req.correlationId = correlationId;

  // 4. Set on outgoing response headers
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', correlationId);

  next();
}

/**
 * Helper to safely extract correlation ID from an Express request or fallback to generating one.
 */
export function getCorrelationId(req?: Request): string {
  if (req?.correlationId) {
    return req.correlationId;
  }
  if (req?.headers) {
    const fromHeader =
      (req.headers[CORRELATION_HEADER] as string) ||
      (req.headers[REQUEST_ID_HEADER] as string);
    if (fromHeader) return fromHeader;
  }
  return `req-${crypto.randomUUID()}`;
}
