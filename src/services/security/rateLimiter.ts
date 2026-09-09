import { Request, Response, NextFunction } from 'express';
import { RateLimitOptions } from './types';

interface ClientRecord {
  timestamps: number[];
}

export class RateLimiter {
  private clients: Map<string, ClientRecord> = new Map();
  private options: RateLimitOptions;

  constructor(options: RateLimitOptions) {
    this.options = {
      message: 'Too many requests. Please slow down and try again later.',
      ...options
    };
  }

  private getClientKey(req: Request): string {
    if (this.options.keyGenerator) {
      return this.options.keyGenerator(req);
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.socket.remoteAddress || '127.0.0.1';
    return ip;
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      const key = this.getClientKey(req);
      const windowStart = now - this.options.windowMs;

      let record = this.clients.get(key);
      if (!record) {
        record = { timestamps: [] };
        this.clients.set(key, record);
      }

      // Filter timestamps within current window
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

      const count = record.timestamps.length;
      const remaining = Math.max(0, this.options.maxRequests - count);
      const resetTime = Math.ceil((windowStart + this.options.windowMs) / 1000);

      res.setHeader('X-RateLimit-Limit', this.options.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTime.toString());

      if (count >= this.options.maxRequests) {
        const retryAfterSeconds = Math.ceil(
          (record.timestamps[0] + this.options.windowMs - now) / 1000
        );
        res.setHeader('Retry-After', Math.max(1, retryAfterSeconds).toString());
        return res.status(429).json({
          error: this.options.message,
          retryAfterSeconds: Math.max(1, retryAfterSeconds)
        });
      }

      record.timestamps.push(now);
      next();
    };
  }

  public reset(): void {
    this.clients.clear();
  }
}

// Pre-configured rate limiters for distinct application concerns
export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,           // 20 attempts
  message: 'Too many authentication attempts. Please try again after 15 minutes.'
});

export const apiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,       // 1 minute
  maxRequests: 600,          // 600 requests per minute
  message: 'API rate limit exceeded. Please throttle requests.'
});

export const uploadRateLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  maxRequests: 50,           // 50 uploads per 5 minutes
  message: 'Upload rate limit exceeded. Please wait before uploading more files.'
});
