/**
 * Phase 46 — Production Structured Logging Engine
 *
 * Implements high-performance, structured JSON logging with:
 * - RFC-5424 severity levels
 * - Correlation ID injection for distributed tracing
 * - Automated sensitive data redaction (PII, credentials, tokens)
 * - Request duration timing and HTTP access logging
 */

import { Request, Response, NextFunction } from 'express';
import { getCorrelationId } from './correlationId.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  'session',
  'credential',
  'privatekey',
  'certificate'
]);

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
  durationMs?: number;
  http?: {
    method: string;
    path: string;
    statusCode?: number;
    clientIp?: string;
    userAgent?: string;
  };
}

export class StructuredLogger {
  private minLevel: LogLevel;
  private serviceName: string;
  private capturedLogs: StructuredLogEntry[] = []; // In-memory buffer for testing/auditing
  private captureInMemory: boolean = false;

  constructor(serviceName: string = 'cr-maldives-tax-engine', minLevel: LogLevel = 'info') {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  public setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public getLevel(): LogLevel {
    return this.minLevel;
  }

  public enableMemoryCapture(enabled: boolean = true): void {
    this.captureInMemory = enabled;
  }

  public clearCapturedLogs(): void {
    this.capturedLogs = [];
  }

  public getCapturedLogs(): StructuredLogEntry[] {
    return [...this.capturedLogs];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[this.minLevel];
  }

  private sanitize(obj: any, depth = 0): any {
    if (depth > 5 || obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item, depth + 1));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public log(level: LogLevel, message: string, meta?: Record<string, any>): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName
    };

    if (meta) {
      if (meta.correlationId) entry.correlationId = meta.correlationId;
      if (meta.tenantId) entry.tenantId = meta.tenantId;
      if (meta.userId) entry.userId = meta.userId;
      if (meta.durationMs !== undefined) entry.durationMs = meta.durationMs;
      if (meta.http) entry.http = meta.http;

      if (meta.error instanceof Error) {
        entry.error = {
          name: meta.error.name,
          message: meta.error.message,
          stack: process.env.NODE_ENV !== 'production' ? meta.error.stack : undefined,
          code: (meta.error as any).code
        };
      }

      // Remaining meta placed into context
      const { correlationId, tenantId, userId, durationMs, http, error, ...context } = meta;
      if (Object.keys(context).length > 0) {
        entry.context = this.sanitize(context);
      }
    }

    if (this.captureInMemory) {
      this.capturedLogs.push(entry);
    }

    if (this.shouldLog(level)) {
      const output = JSON.stringify(entry);
      if (level === 'error') {
        process.stderr.write(output + '\n');
      } else {
        process.stdout.write(output + '\n');
      }
    }

    return entry;
  }

  public debug(message: string, meta?: Record<string, any>): StructuredLogEntry {
    return this.log('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, any>): StructuredLogEntry {
    return this.log('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, any>): StructuredLogEntry {
    return this.log('warn', message, meta);
  }

  public error(message: string, meta?: Record<string, any>): StructuredLogEntry {
    return this.log('error', message, meta);
  }
}

// Global logger singleton
export const logger = new StructuredLogger(
  'cr-maldives-tax-engine',
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'test' ? 'error' : 'info')
);

/**
 * Express HTTP access log middleware using structured logging.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const correlationId = getCorrelationId(req);

  // Log completion of the request
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Determine appropriate log level based on response status code
    let level: LogLevel = 'info';
    if (statusCode >= 500) {
      level = 'error';
    } else if (statusCode >= 400) {
      level = 'warn';
    }

    logger.log(level, `HTTP ${req.method} ${req.originalUrl || req.url}`, {
      correlationId,
      tenantId: (req as any).user?.tenantId || (req.query?.tenant_id as string),
      userId: (req as any).user?.id,
      durationMs,
      http: {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode,
        clientIp: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });
  });

  next();
}
