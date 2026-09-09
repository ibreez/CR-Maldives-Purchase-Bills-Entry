import { Role, Permission, UserSession } from '../../types/rbac';

export interface SecureSession {
  token: string;
  tokenHash: string;
  userId: string;
  tenantId: string;
  role: Role | string;
  username: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionConfig {
  ttlMinutes: number;         // e.g. 1440 mins (24 hours)
  inactivityTimeoutMinutes: number; // e.g. 240 mins (4 hours)
  cookieName: string;         // 'cr_session'
  secureCookie: boolean;      // true in production
  sameSite: 'lax' | 'strict' | 'none';
  httpOnly: boolean;
}

export interface RateLimitOptions {
  windowMs: number;          // time window in milliseconds
  maxRequests: number;       // maximum requests allowed per window
  message?: string;
  keyGenerator?: (req: any) => string;
}

export interface FileUploadConstraint {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  validateMagicBytes?: boolean;
}

export interface UploadValidationResult {
  isValid: boolean;
  sanitizedFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  error?: string;
}

export interface SanitizedUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  outlet_id: string | null;
  outlet_name?: string;
  status: string;
  createdAt: string;
  lastLogin?: string;
}
