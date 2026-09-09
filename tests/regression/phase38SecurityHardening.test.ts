import { describe, test, expect, beforeEach } from 'vitest';
import {
  sessionManager,
  PasswordSecurity,
  RateLimiter,
  securityHeadersMiddleware,
  csrfProtectionMiddleware,
  UploadValidator,
  BILL_UPLOAD_CONSTRAINTS,
  TEMPLATE_UPLOAD_CONSTRAINTS,
  authenticate,
  requireRole,
  requirePermission,
  requireTenantIsolation,
  setUserProvider
} from '../../src/services/security';
import { Role } from '../../src/types/rbac';
import fs from 'fs';
import path from 'path';

describe('Phase 38 — Security Hardening Tests', () => {

  beforeEach(() => {
    sessionManager.clearAllSessions();
  });

  // =========================================================================
  // 1. SESSION MANAGEMENT & CRYPTOGRAPHIC TOKENS
  // =========================================================================

  describe('Session Manager & Expiration', () => {
    test('generates cryptographically secure session IDs with sufficient entropy', () => {
      const session1 = sessionManager.createSession({
        userId: 'user-001',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'acct_user'
      });

      const session2 = sessionManager.createSession({
        userId: 'user-002',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'acct_user_2'
      });

      expect(session1.token).toBeDefined();
      expect(session1.token.length).toBe(64); // 32 bytes hex = 64 characters
      expect(session2.token.length).toBe(64);
      expect(session1.token).not.toBe(session2.token);
      expect(session1.tokenHash).toBeDefined();
    });

    test('validates active session and rejects non-existent or expired tokens', () => {
      const session = sessionManager.createSession({
        userId: 'user-001',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'acct_user',
        customTtlMinutes: 60
      });

      // Valid session lookup
      const retrieved = sessionManager.getSession(session.token);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe('user-001');

      // Invalid token lookup
      expect(sessionManager.getSession('invalid-non-existent-token')).toBeNull();
      expect(sessionManager.getSession('')).toBeNull();
    });

    test('rejects expired session after TTL expires', () => {
      const expiredSession = sessionManager.createSession({
        userId: 'user-001',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'acct_user',
        customTtlMinutes: -10 // expired 10 minutes ago
      });

      expect(sessionManager.isSessionExpired(expiredSession)).toBe(true);
      expect(sessionManager.getSession(expiredSession.token)).toBeNull();
    });

    test('revokes a single session on logout and all user sessions on password reset', () => {
      const sessionA1 = sessionManager.createSession({
        userId: 'user-reset-01',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'user_reset'
      });
      const sessionA2 = sessionManager.createSession({
        userId: 'user-reset-01',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'user_reset'
      });
      const sessionB = sessionManager.createSession({
        userId: 'user-other-02',
        tenantId: 'tenant-male',
        role: 'STAFF_ACCOUNTANT',
        username: 'user_other'
      });

      // Revoke single session
      sessionManager.revokeSession(sessionA1.token);
      expect(sessionManager.getSession(sessionA1.token)).toBeNull();
      expect(sessionManager.getSession(sessionA2.token)).not.toBeNull();

      // Revoke all sessions for user-reset-01
      const count = sessionManager.revokeAllUserSessions('user-reset-01');
      expect(count).toBe(1);
      expect(sessionManager.getSession(sessionA2.token)).toBeNull();
      expect(sessionManager.getSession(sessionB.token)).not.toBeNull();
    });
  });

  // =========================================================================
  // 2. PASSWORD SECURITY & SENSITIVE DATA REDACTION
  // =========================================================================

  describe('Password Security & Redaction', () => {
    test('hashes password using PBKDF2 with unique salts and verifies correctly', () => {
      const plain = 'StrongSecretPass@2026';
      const hash1 = PasswordSecurity.hashPassword(plain);
      const hash2 = PasswordSecurity.hashPassword(plain);

      expect(hash1.startsWith('pbkdf2:10000:')).toBe(true);
      expect(hash2.startsWith('pbkdf2:10000:')).toBe(true);
      // Different salts produce different hashes
      expect(hash1).not.toBe(hash2);

      // Verify passwords
      expect(PasswordSecurity.verifyPassword(plain, hash1)).toBe(true);
      expect(PasswordSecurity.verifyPassword(plain, hash2)).toBe(true);
      expect(PasswordSecurity.verifyPassword('WrongPassword', hash1)).toBe(false);
    });

    test('sanitizes user records by stripping passwords, hashes, and salts', () => {
      const user = {
        id: 'usr-123',
        name: 'Accountant Name',
        email: 'acct@crmaldives.com',
        username: 'acct1',
        role: 'STAFF_ACCOUNTANT',
        outlet_id: 'outlet-male',
        outlet_name: "Male' Branch",
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        password: 'plain_password',
        passwordHash: 'pbkdf2:10000:salt:hash',
        salt: 'secret_salt',
        token: 'secret_session_token'
      };

      const sanitized = PasswordSecurity.sanitizeUser(user);
      expect((sanitized as any).password).toBeUndefined();
      expect((sanitized as any).passwordHash).toBeUndefined();
      expect((sanitized as any).salt).toBeUndefined();
      expect((sanitized as any).token).toBeUndefined();
      expect(sanitized.id).toBe('usr-123');
      expect(sanitized.username).toBe('acct1');
    });

    test('recursively redacts sensitive API keys, secrets, and authorization headers from logs', () => {
      const payload = {
        transactionId: 'TX-909',
        amount: 5000,
        metadata: {
          apiKey: 'AIzaSySecretApiKey123',
          gemini_api_key: 'AIzaSySecretGeminiKey456',
          Authorization: 'Bearer secret_token_value',
          clientInfo: {
            username: 'admin',
            password: 'SuperSecretAdminPassword!'
          }
        }
      };

      const redacted = PasswordSecurity.redactSensitiveData(payload);
      expect(redacted.transactionId).toBe('TX-909');
      expect(redacted.amount).toBe(5000);
      expect(redacted.metadata.apiKey).toBe('[REDACTED]');
      expect(redacted.metadata.gemini_api_key).toBe('[REDACTED]');
      expect(redacted.metadata.Authorization).toBe('[REDACTED]');
      expect(redacted.metadata.clientInfo.username).toBe('admin');
      expect(redacted.metadata.clientInfo.password).toBe('[REDACTED]');
    });
  });

  // =========================================================================
  // 3. RATE LIMITING MIDDLEWARE
  // =========================================================================

  describe('Rate Limiter', () => {
    test('enforces request limit and returns 429 Too Many Requests when threshold exceeded', () => {
      const limiter = new RateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 3,
        message: 'Rate limit exceeded'
      });

      const req: any = {
        headers: {},
        socket: { remoteAddress: '192.168.1.100' }
      };

      let status = 200;
      let responseBody: any = null;
      const res: any = {
        setHeader: () => {},
        status: (code: number) => {
          status = code;
          return {
            json: (body: any) => {
              responseBody = body;
            }
          };
        }
      };

      const middleware = limiter.middleware();

      // Requests 1, 2, 3 should succeed
      let nextCalled = 0;
      middleware(req, res, () => { nextCalled++; });
      middleware(req, res, () => { nextCalled++; });
      middleware(req, res, () => { nextCalled++; });
      expect(nextCalled).toBe(3);
      expect(status).toBe(200);

      // Request 4 should be rate-limited (HTTP 429)
      middleware(req, res, () => { nextCalled++; });
      expect(nextCalled).toBe(3); // next not called
      expect(status).toBe(429);
      expect(responseBody.error).toBe('Rate limit exceeded');
    });
  });

  // =========================================================================
  // 4. SECURITY HEADERS & CSRF PROTECTION
  // =========================================================================

  describe('Security Headers & CSRF', () => {
    test('sets standard protective HTTP headers and removes X-Powered-By', () => {
      const headers: Record<string, string> = {};
      const req: any = { secure: true, headers: {} };
      const res: any = {
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
        removeHeader: (name: string) => {
          delete headers[name.toLowerCase()];
        }
      };

      let nextCalled = false;
      securityHeadersMiddleware(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-xss-protection']).toBe('1; mode=block');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['content-security-policy']).toBeDefined();
      expect(headers['strict-transport-security']).toContain('max-age=31536000');
    });

    test('CSRF protection allows safe GET methods and requests with Bearer token', () => {
      let getNext = false;
      const reqGet: any = { method: 'GET', path: '/api/bills', headers: {} };
      const res: any = { status: () => ({ json: () => {} }) };
      csrfProtectionMiddleware(reqGet, res, () => { getNext = true; });
      expect(getNext).toBe(true);

      let postBearerNext = false;
      const reqPostBearer: any = {
        method: 'POST',
        path: '/api/bills',
        headers: { authorization: 'Bearer some_token' }
      };
      csrfProtectionMiddleware(reqPostBearer, res, () => { postBearerNext = true; });
      expect(postBearerNext).toBe(true);
    });

    test('CSRF protection blocks state-changing requests lacking auth or custom headers', () => {
      let nextCalled = false;
      let statusCode = 200;
      const reqPostUnsafe: any = {
        method: 'POST',
        path: '/api/bills',
        headers: { host: 'example.com', origin: 'http://malicious-site.com' }
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => {} };
        }
      };

      csrfProtectionMiddleware(reqPostUnsafe, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
    });
  });

  // =========================================================================
  // 5. SECURE FILE UPLOAD VALIDATION & PATH TRAVERSAL DEFENSE
  // =========================================================================

  describe('Secure File Upload Validation', () => {
    test('sanitizes filename and prevents directory traversal attacks', () => {
      expect(UploadValidator.sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(UploadValidator.sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
      expect(UploadValidator.sanitizeFilename('safe_invoice_101.pdf')).toBe('safe_invoice_101.pdf');
    });

    test('rejects banned executable and script extensions', () => {
      const maliciousFiles = [
        { originalname: 'exploit.exe', mimetype: 'application/x-msdownload', size: 1024 },
        { originalname: 'script.sh', mimetype: 'application/x-sh', size: 1024 },
        { originalname: 'backdoor.php', mimetype: 'application/x-php', size: 1024 },
        { originalname: 'payload.js', mimetype: 'text/javascript', size: 1024 }
      ];

      for (const badFile of maliciousFiles) {
        const result = UploadValidator.validateFile(badFile as any, BILL_UPLOAD_CONSTRAINTS);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Security Violation');
      }
    });

    test('rejects files exceeding maximum size limit', () => {
      const largeFile = {
        originalname: 'huge_invoice.pdf',
        mimetype: 'application/pdf',
        size: 30 * 1024 * 1024 // 30 MB (exceeds 25 MB limit)
      };

      const result = UploadValidator.validateFile(largeFile as any, BILL_UPLOAD_CONSTRAINTS);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    test('accepts valid PDF and image uploads within limits', () => {
      const validPdf = {
        originalname: 'clean_invoice.pdf',
        mimetype: 'application/pdf',
        size: 2 * 1024 * 1024
      };

      const validJpg = {
        originalname: 'receipt_photo.jpg',
        mimetype: 'image/jpeg',
        size: 1 * 1024 * 1024
      };

      expect(UploadValidator.validateFile(validPdf as any, BILL_UPLOAD_CONSTRAINTS).isValid).toBe(true);
      expect(UploadValidator.validateFile(validJpg as any, BILL_UPLOAD_CONSTRAINTS).isValid).toBe(true);
    });
  });

  // =========================================================================
  // 6. RBAC & TENANT ISOLATION MIDDLEWARE
  // =========================================================================

  describe('RBAC & Tenant Isolation', () => {
    const mockUsers = [
      {
        id: 'usr-admin',
        name: 'Super Admin',
        email: 'admin@crmaldives.com',
        username: 'admin',
        role: 'super_admin',
        outlet_id: null,
        outlet_name: 'All Outlets',
        status: 'active'
      },
      {
        id: 'usr-outlet-a',
        name: 'Male Cashier',
        email: 'male@crmaldives.com',
        username: 'male_user',
        role: 'outlet_user',
        outlet_id: 'outlet-male',
        outlet_name: "Male' Branch",
        status: 'active'
      },
      {
        id: 'usr-outlet-b',
        name: 'Maafushi Cashier',
        email: 'maafushi@crmaldives.com',
        username: 'maafushi_user',
        role: 'outlet_user',
        outlet_id: 'outlet-maafushi',
        outlet_name: 'Maafushi Branch',
        status: 'active'
      }
    ];

    beforeEach(() => {
      setUserProvider(() => mockUsers);
    });

    test('authenticate middleware rejects unauthenticated requests with 401', () => {
      const req: any = { headers: {} };
      let statusCode = 200;
      let body: any = null;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return { json: (data: any) => { body = data; } };
        }
      };

      let nextCalled = false;
      authenticate(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(401);
      expect(body.error).toContain('Authentication required');
    });

    test('authenticate middleware accepts valid session token and attaches sanitized user', () => {
      const session = sessionManager.createSession({
        userId: 'usr-outlet-a',
        tenantId: 'outlet-male',
        role: 'outlet_user',
        username: 'male_user'
      });

      const req: any = {
        headers: { authorization: `Bearer ${session.token}` }
      };
      const res: any = { status: () => ({ json: () => {} }) };

      let nextCalled = false;
      authenticate(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('usr-outlet-a');
      expect(req.user.outlet_id).toBe('outlet-male');
    });

    test('requireRole rejects users lacking required role clearance with 403', () => {
      const outletUserReq: any = {
        user: { id: 'usr-outlet-a', role: 'outlet_user', outlet_id: 'outlet-male' }
      };

      let statusCode = 200;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => {} };
        }
      };

      const superAdminOnly = requireRole('super_admin', 'ADMIN');

      let nextCalled = false;
      superAdminOnly(outletUserReq, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
    });

    test('requireTenantIsolation blocks cross-tenant access between distinct outlets', () => {
      const outletUserA: any = {
        user: { id: 'usr-outlet-a', role: 'outlet_user', outlet_id: 'outlet-male' },
        params: { outletId: 'outlet-maafushi' }
      };

      let statusCode = 200;
      let errorMsg = '';
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => { errorMsg = data.error; }
          };
        }
      };

      const tenantGuard = requireTenantIsolation((req) => req.params.outletId);

      let nextCalled = false;
      tenantGuard(outletUserA, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
      expect(errorMsg).toContain('Tenant Isolation Violation');
    });

    test('requireTenantIsolation allows Super Admin to access any tenant', () => {
      const superAdminReq: any = {
        user: { id: 'usr-admin', role: 'super_admin', outlet_id: null },
        params: { outletId: 'outlet-maafushi' }
      };

      const res: any = { status: () => ({ json: () => {} }) };
      const tenantGuard = requireTenantIsolation((req) => req.params.outletId);

      let nextCalled = false;
      tenantGuard(superAdminReq, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });
  });
});
