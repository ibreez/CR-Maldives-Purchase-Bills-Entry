import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SecureSession, SessionConfig } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  ttlMinutes: 24 * 60,            // 24 hours
  inactivityTimeoutMinutes: 4 * 60, // 4 hours
  cookieName: 'cr_session',
  secureCookie: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  httpOnly: true
};

class SessionManager {
  private sessions: Map<string, SecureSession> = new Map();
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.loadSessionsFromDisk();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private loadSessionsFromDisk(): void {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (err) {
        console.error('Failed to create data directory:', err);
      }
    }

    if (fs.existsSync(SESSIONS_FILE)) {
      try {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          const now = Date.now();
          data.forEach((item: any) => {
            if (item && item.token) {
              const createdAt = item.createdAt || new Date(now).toISOString();
              const expiresAt =
                item.expiresAt ||
                new Date(now + this.config.ttlMinutes * 60 * 1000).toISOString();
              const lastActiveAt =
                item.lastActiveAt || item.createdAt || new Date(now).toISOString();

              const session: SecureSession = {
                token: item.token,
                tokenHash: item.tokenHash || this.hashToken(item.token),
                userId: item.userId,
                tenantId: item.tenantId || item.outlet_id || 'DEFAULT-TENANT',
                role: item.role || 'DATA_ENTRY',
                username: item.username || item.userId,
                createdAt,
                expiresAt,
                lastActiveAt,
                ipAddress: item.ipAddress,
                userAgent: item.userAgent
              };

              // Only load if not already expired
              if (!this.isSessionExpired(session)) {
                this.sessions.set(session.token, session);
              }
            }
          });
        }
      } catch (err) {
        console.error('Error loading sessions from disk:', err);
      }
    }
  }

  public saveSessionsToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const activeSessions = Array.from(this.sessions.values()).filter(
        (s) => !this.isSessionExpired(s)
      );
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(activeSessions, null, 2));
    } catch (err) {
      console.error('Error saving sessions to disk:', err);
    }
  }

  /**
   * Generates a cryptographically secure random session token (32 bytes / 64 hex characters).
   */
  public generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Creates a new cryptographically secure session.
   */
  public createSession(params: {
    userId: string;
    tenantId: string;
    role: string;
    username: string;
    ipAddress?: string;
    userAgent?: string;
    customTtlMinutes?: number;
  }): SecureSession {
    const token = this.generateSecureToken();
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const ttl = params.customTtlMinutes || this.config.ttlMinutes;
    const expiresAt = new Date(now.getTime() + ttl * 60 * 1000).toISOString();

    const session: SecureSession = {
      token,
      tokenHash,
      userId: params.userId,
      tenantId: params.tenantId,
      role: params.role,
      username: params.username,
      createdAt: now.toISOString(),
      expiresAt,
      lastActiveAt: now.toISOString(),
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    };

    this.sessions.set(token, session);
    this.saveSessionsToDisk();
    return session;
  }

  /**
   * Validates and retrieves a session by its raw token.
   * Returns null if token is missing, not found, or expired.
   */
  public getSession(token: string | undefined | null): SecureSession | null {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    if (this.isSessionExpired(session)) {
      this.revokeSession(token);
      return null;
    }

    return session;
  }

  /**
   * Checks if a session has expired based on absolute TTL or inactivity timeout.
   */
  public isSessionExpired(session: SecureSession): boolean {
    const now = Date.now();
    const expiresAtTime = new Date(session.expiresAt).getTime();
    if (now >= expiresAtTime) {
      return true;
    }

    const lastActiveTime = new Date(session.lastActiveAt).getTime();
    const inactivityLimit = this.config.inactivityTimeoutMinutes * 60 * 1000;
    if (now - lastActiveTime > inactivityLimit) {
      return true;
    }

    return false;
  }

  /**
   * Updates lastActiveAt for sliding session activity window.
   */
  public touchSession(token: string): boolean {
    const session = this.sessions.get(token);
    if (!session || this.isSessionExpired(session)) {
      return false;
    }

    session.lastActiveAt = new Date().toISOString();
    return true;
  }

  /**
   * Revokes / destroys a single session token.
   */
  public revokeSession(token: string): boolean {
    const deleted = this.sessions.delete(token);
    if (deleted) {
      this.saveSessionsToDisk();
    }
    return deleted;
  }

  /**
   * Revokes all sessions belonging to a specific user (e.g. on password change or admin deactivation).
   */
  public revokeAllUserSessions(userId: string): number {
    let count = 0;
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(token);
        count++;
      }
    }
    if (count > 0) {
      this.saveSessionsToDisk();
    }
    return count;
  }

  /**
   * Purges all expired sessions from memory and disk.
   */
  public cleanExpiredSessions(): number {
    let count = 0;
    for (const [token, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        this.sessions.delete(token);
        count++;
      }
    }
    if (count > 0) {
      this.saveSessionsToDisk();
    }
    return count;
  }

  /**
   * Clear all sessions (primarily for test resets).
   */
  public clearAllSessions(): void {
    this.sessions.clear();
    this.saveSessionsToDisk();
  }

  public getConfig(): SessionConfig {
    return { ...this.config };
  }
}

export const sessionManager = new SessionManager();
