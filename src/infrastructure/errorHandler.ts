/**
 * Phase 46 — Centralized Production Error Handling Middleware
 *
 * Provides safe, structured error responses, correlation ID tracing,
 * and prevents information leakage in production environments.
 */

import { Request, Response, NextFunction } from 'express';
import { getCorrelationId } from './correlationId.js';
import { logger } from './logger.js';

export interface AppErrorOptions {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export class AppError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: any;
  public isOperational: boolean;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options.statusCode || 500;
    this.code = options.code;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Express error handling middleware.
 */
export function centralizedErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = getCorrelationId(req);
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  // Log error using structured logger
  logger.error(`Unhandled error during request ${req.method} ${req.originalUrl || req.url}: ${err.message}`, {
    correlationId,
    tenantId: (req as any).user?.tenantId,
    error: err,
    statusCode,
    http: {
      method: req.method,
      path: req.originalUrl || req.url
    }
  });

  if (res.headersSent) {
    return;
  }

  // Sanitize message for client if in production and it's a 500 server error
  let clientMessage: string;
  if (isProduction && statusCode >= 500) {
    clientMessage = 'An unexpected internal error occurred. Please contact support with the correlation ID.';
  } else {
    clientMessage = err.message || 'An unexpected error occurred.';
  }

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    correlationId,
    statusCode,
    code: err.code || undefined,
    ...(isProduction ? {} : { stack: err.stack, details: err.details })
  });
}

/**
 * Fallback 404 handler for API routes.
 */
export function apiNotFoundHandler(req: Request, res: Response): void {
  const correlationId = getCorrelationId(req);
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl || req.url}`,
    correlationId,
    statusCode: 404
  });
}
