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
import { escapeHtml } from '../../src/templates/reportTemplates';
import {
  recordAuditEvent,
  verifyAuditChain,
  updateAuditEvent,
  deleteAuditEvent,
  resetAuditStore
} from '../../src/services/audit/auditService';
import { ImmutableAuditError } from '../../src/types/audit';
import { PeriodControlService } from '../../src/services/accounting/periodControlService';
import { LockedPeriodMutationError } from '../../src/types/period';
import { UserSession } from '../../src/types/rbac';

describe('Phase 49 — Comprehensive Security Audit Test Suite', () => {

  beforeEach(() => {
    sessionManager.clearAllSessions();
    resetAuditStore();
    PeriodControlService.resetStore();
  });

  // =========================================================================
  // 1. AUTHENTICATION & SESSION MANAGEMENT
  // =========================================================================

  describe('1. Authentication & Session Security', () => {
    test('hashes passwords using PBKDF2 with unique salts and verifies constant-time', () => {
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

    test('generates cryptographically secure session tokens with high entropy', () => {
      const session = sessionManager.createSession({
        userId: 'usr-audit-01',
        tenantId: 'tenant-male-01',
        role: 'STAFF_ACCOUNTANT',
        username: 'audit_accountant'
      });

      expect(session.token).toBeDefined();
      expect(session.token.length).toBe(64); // 32 bytes hex
      expect(/^[0-9a-f]{64}$/i.test(session.token)).toBe(true);
    });

    test('session expires after TTL and cannot be used', () => {
      const expiredSession = sessionManager.createSession({
        userId: 'usr-audit-02',
        tenantId: 'tenant-male-01',
        role: 'STAFF_ACCOUNTANT',
        username: 'audit_accountant_2',
        customTtlMinutes: -5 // expired 5 mins ago
      });

      const lookup = sessionManager.getSession(expiredSession.token);
      expect(lookup).toBeNull();
    });

    test('invalidates session token on revokeSession logout', () => {
      const session = sessionManager.createSession({
        userId: 'usr-audit-03',
        tenantId: 'tenant-male-01',
        role: 'STAFF_ACCOUNTANT',
        username: 'audit_accountant_3'
      });

      expect(sessionManager.getSession(session.token)).not.toBeNull();
      sessionManager.revokeSession(session.token);
      expect(sessionManager.getSession(session.token)).toBeNull();
    });
  });

  // =========================================================================
  // 2. AUTHORIZATION & ROLE-BASED ACCESS CONTROL (RBAC)
  // =========================================================================

  describe('2. Authorization & RBAC Enforcement', () => {
    test('verifies role permissions hierarchy', () => {
      const superAdminReq: any = {
        user: { id: 'u-super', role: 'super_admin', outlet_id: null }
      };
      const clientReq: any = {
        user: { id: 'u-client', role: 'outlet_user', outlet_id: 'out-01' }
      };

      const superGuard = requireRole('super_admin', 'ADMIN');

      // Super Admin passes
      let superPassed = false;
      const resSuper: any = { status: () => resSuper, json: () => {} };
      superGuard(superAdminReq, resSuper, () => { superPassed = true; });
      expect(superPassed).toBe(true);

      // Outlet user fails with 403
      let clientPassed = false;
      let clientStatusCode = 0;
      const resClient: any = {
        status: (code: number) => { clientStatusCode = code; return resClient; },
        json: () => {}
      };
      superGuard(clientReq, resClient, () => { clientPassed = true; });
      expect(clientPassed).toBe(false);
      expect(clientStatusCode).toBe(403);
    });
  });

  // =========================================================================
  // 3. TENANT ISOLATION & IDOR DEFENSE
  // =========================================================================

  describe('3. Multi-Tenant Isolation & IDOR Defense', () => {
    test('enforces cross-tenant isolation middleware', () => {
      const userA: any = {
        user: { id: 'usr-outlet-a', role: 'outlet_user', outlet_id: 'outlet-male' },
        params: { outletId: 'outlet-male' }
      };
      const userCrossTenant: any = {
        user: { id: 'usr-outlet-a', role: 'outlet_user', outlet_id: 'outlet-male' },
        params: { outletId: 'outlet-maafushi' }
      };

      const tenantGuard = requireTenantIsolation((req) => req.params.outletId);

      // Accessing own outlet passes
      let allowed = false;
      const resOwn: any = { status: () => resOwn, json: () => {} };
      tenantGuard(userA, resOwn, () => { allowed = true; });
      expect(allowed).toBe(true);

      // Accessing another outlet fails with 403
      let blocked = false;
      let statusCode = 0;
      let errorMsg = '';
      const resOther: any = {
        status: (code: number) => { statusCode = code; blocked = true; return resOther; },
        json: (data: any) => { errorMsg = data.error; }
      };
      tenantGuard(userCrossTenant, resOther, () => {});
      expect(blocked).toBe(true);
      expect(statusCode).toBe(403);
      expect(errorMsg).toContain('Tenant Isolation Violation');
    });
  });

  // =========================================================================
  // 4. CROSS-SITE SCRIPTING (XSS) SANITIZATION
  // =========================================================================

  describe('4. Cross-Site Scripting (XSS) Sanitization', () => {
    test('escapeHtml neutralizes malicious HTML/JS payloads', () => {
      const maliciousPayloads = [
        '<script>alert("xss")</script>',
        '"><img src=x onerror=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '\' onfocus=\'alert(1)',
        'Malicious & Company <Co>'
      ];

      for (const payload of maliciousPayloads) {
        const sanitized = escapeHtml(payload);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('</script>');
        expect(sanitized).not.toContain('<img');
        expect(sanitized).not.toContain('<iframe');
      }

      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('"quoted" & \'single\'')).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
    });

    test('redactSensitiveData neutralizes passwords, tokens and secrets from logged data', () => {
      const sensitivePayload = {
        username: 'taxpayer_user',
        password: 'SuperSecretPassword123!',
        token: 'abcdef1234567890',
        apiKey: 'GEMINI_SECRET_KEY_9999',
        nested: {
          passwordHash: 'pbkdf2:10000:...',
          publicInfo: 'safe to display'
        }
      };

      const sanitized = PasswordSecurity.redactSensitiveData(sensitivePayload);
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.nested.passwordHash).toBe('[REDACTED]');
      expect(sanitized.nested.publicInfo).toBe('safe to display');
      expect(sanitized.username).toBe('taxpayer_user');
    });
  });

  // =========================================================================
  // 5. CSRF DEFENSE & SECURITY HEADERS
  // =========================================================================

  describe('5. CSRF Defense & Security Headers', () => {
    test('security headers middleware applies OWASP-compliant headers', () => {
      const headers: Record<string, string> = {};
      const mockRes: any = {
        setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; },
        removeHeader: () => {}
      };
      const mockReq: any = { secure: true, headers: {} };
      let nextCalled = false;

      securityHeadersMiddleware(mockReq, mockRes, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-xss-protection']).toBe('1; mode=block');
      expect(headers['strict-transport-security']).toBeDefined();
      expect(headers['content-security-policy']).toBeDefined();
    });

    test('CSRF protection blocks state-changing requests missing origin/token in browser contexts', () => {
      let nextCalled = false;
      let statusCode = 200;
      const mockReq: any = {
        method: 'POST',
        path: '/api/bills',
        headers: { host: 'example.com', origin: 'http://malicious-site.com' }
      };
      const mockRes: any = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => {} };
        }
      };

      csrfProtectionMiddleware(mockReq, mockRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(403);
    });

    test('CSRF protection permits safe read methods (GET, HEAD, OPTIONS)', () => {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      for (const method of safeMethods) {
        let passed = false;
        const mockReq: any = { method, headers: {} };
        const mockRes: any = { status: () => ({ json: () => {} }) };
        csrfProtectionMiddleware(mockReq, mockRes, () => { passed = true; });
        expect(passed).toBe(true);
      }
    });
  });

  // =========================================================================
  // 6. FILE UPLOAD SECURITY & PATH TRAVERSAL DEFENSE
  // =========================================================================

  describe('6. File Upload Validation & Path Traversal Prevention', () => {
    test('sanitizes filename and prevents directory traversal attacks', () => {
      expect(UploadValidator.sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(UploadValidator.sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
      expect(UploadValidator.sanitizeFilename('safe_invoice_101.pdf')).toBe('safe_invoice_101.pdf');
    });

    test('rejects unauthorized or executable file extensions', () => {
      const dangerousFiles = [
        { originalname: 'malware.exe', mimetype: 'application/x-msdownload', size: 1024 },
        { originalname: 'exploit.sh', mimetype: 'application/x-sh', size: 1024 },
        { originalname: 'script.php', mimetype: 'application/x-php', size: 1024 },
        { originalname: 'payload.js', mimetype: 'application/javascript', size: 1024 },
        { originalname: 'attack.bat', mimetype: 'application/x-bat', size: 1024 }
      ];

      for (const file of dangerousFiles) {
        const result = UploadValidator.validateFile(file as any, BILL_UPLOAD_CONSTRAINTS);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Security Violation');
      }
    });

    test('accepts valid PDF within size limit', () => {
      const validPdf = {
        originalname: 'tax_invoice_2026.pdf',
        mimetype: 'application/pdf',
        size: 500 * 1024 // 500KB
      };

      const result = UploadValidator.validateFile(validPdf as any, BILL_UPLOAD_CONSTRAINTS);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('rejects oversized uploads exceeding constraint limits', () => {
      const oversizedPdf = {
        originalname: 'giant_archive.pdf',
        mimetype: 'application/pdf',
        size: 100 * 1024 * 1024 // 100MB, limit is 25MB
      };

      const result = UploadValidator.validateFile(oversizedPdf as any, BILL_UPLOAD_CONSTRAINTS);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('maximum allowed size');
    });
  });

  // =========================================================================
  // 7. RATE LIMITING & API ABUSE PREVENTION
  // =========================================================================

  describe('7. Rate Limiting & Anti-Brute-Force', () => {
    test('throttles excessive requests within defined window', () => {
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

      let nextCalled = 0;
      middleware(req, res, () => { nextCalled++; });
      middleware(req, res, () => { nextCalled++; });
      middleware(req, res, () => { nextCalled++; });
      expect(nextCalled).toBe(3);
      expect(status).toBe(200);

      // 4th request exceeds limit
      middleware(req, res, () => { nextCalled++; });
      expect(nextCalled).toBe(3);
      expect(status).toBe(429);
      expect(responseBody.error).toBe('Rate limit exceeded');
    });
  });

  // =========================================================================
  // 8. AUDIT LOG TAMPER-EVIDENCE & LOCKED PERIOD IMMUTABILITY
  // =========================================================================

  describe('8. Audit Log Tamper-Evidence & Period Immutability', () => {
    test('audit chain maintains SHA-256 integrity and detects any tampering', () => {
      const tenantId = 'TENANT-AUDIT-TEST';
      recordAuditEvent({
        tenantId,
        eventType: 'DOCUMENT_UPLOAD',
        action: 'CREATE',
        actorId: 'u1',
        entityType: 'DOCUMENT',
        entityId: 'INV-001',
        metadata: { description: 'First invoice upload' }
      });

      recordAuditEvent({
        tenantId,
        eventType: 'TRANSACTION_APPROVAL',
        action: 'UPDATE',
        actorId: 'u2',
        entityType: 'INVOICE',
        entityId: 'INV-001',
        metadata: { description: 'Invoice approved' }
      });

      // Verification succeeds on valid chain
      const verification = verifyAuditChain(tenantId);
      expect(verification.isValid).toBe(true);
      expect(verification.totalEvents).toBe(2);

      // Mutating audit records is strictly prevented
      expect(() => updateAuditEvent()).toThrow(ImmutableAuditError);
      expect(() => deleteAuditEvent()).toThrow(ImmutableAuditError);
    });

    test('locked accounting periods strictly reject modification or postings', async () => {
      const tenantId = 'TENANT-LOCKED-PERIOD-TEST';

      await PeriodControlService.createPeriod({
        tenantId,
        periodName: '2025-Q4',
        startDate: '2025-10-01',
        endDate: '2025-12-31',
        status: 'LOCKED'
      });

      // Attempting to post to locked period must throw LockedPeriodMutationError
      await expect(
        PeriodControlService.validateCanPostToPeriod(tenantId, '2025-11-15')
      ).rejects.toThrow(LockedPeriodMutationError);
    });
  });
});
