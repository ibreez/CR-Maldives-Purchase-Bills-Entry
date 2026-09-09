/**
 * Phase 51 — Production Certification Test Suite
 * 
 * Verifies that the application passes the complete production-readiness audit
 * across all 11 mandatory domains:
 * 1. REGULATORY
 * 2. ACCOUNTING
 * 3. GST
 * 4. NWT
 * 5. INCOME_TAX
 * 6. MIRA
 * 7. AUDIT
 * 8. SECURITY
 * 9. AI
 * 10. OPERATIONS
 * 11. TESTING
 * 
 * Enforces the Golden Rule:
 * "The application must not be declared production-ready if any critical
 * regulatory, accounting, security, audit, or data-integrity item is FAIL."
 */

import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ProductionCertificationService,
  CertificationDomain,
  CertificationStatus
} from '../../src/services/certification/productionCertificationService';
import { runProductionCertification } from '../../scripts/run_production_certification';

describe('Phase 51 — Production Certification Audit Suite', () => {
  let auditResult: ReturnType<typeof ProductionCertificationService.runProductionAudit>;

  beforeAll(() => {
    auditResult = ProductionCertificationService.runProductionAudit();
    runProductionCertification();
  });

  describe('1. Global Production Readiness Verdict & Golden Rule', () => {
    test('application is declared production ready with zero failures', () => {
      expect(auditResult.isProductionReady).toBe(true);
      expect(auditResult.readinessVerdict).toBe('CERTIFIED_FOR_PRODUCTION');
      expect(auditResult.failCount).toBe(0);
      expect(auditResult.criticalFailCount).toBe(0);
    });

    test('all critical items pass without exception', () => {
      expect(auditResult.criticalPassCount).toBeGreaterThan(0);
      expect(auditResult.criticalFailCount).toBe(0);

      const criticalItems = auditResult.items.filter((i) => i.isCritical);
      for (const item of criticalItems) {
        expect(item.status, `Critical check ${item.id} (${item.name}) failed!`).toBe('PASS');
      }
    });

    test('every audited item has valid classification (PASS, FAIL, WARNING, NOT_APPLICABLE)', () => {
      const validStatuses: CertificationStatus[] = ['PASS', 'FAIL', 'WARNING', 'NOT_APPLICABLE'];
      for (const item of auditResult.items) {
        expect(validStatuses).toContain(item.status);
        expect(item.evidenceLocation.length).toBeGreaterThan(0);
        expect(item.notes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('2. Comprehensive 11-Domain Coverage', () => {
    const requiredDomains: CertificationDomain[] = [
      'REGULATORY',
      'ACCOUNTING',
      'GST',
      'NWT',
      'INCOME_TAX',
      'MIRA',
      'AUDIT',
      'SECURITY',
      'AI',
      'OPERATIONS',
      'TESTING'
    ];

    test('every mandated domain is audited and has positive passing checks', () => {
      for (const domain of requiredDomains) {
        const summary = auditResult.domainBreakdown[domain];
        expect(summary, `Domain ${domain} summary is missing`).toBeDefined();
        expect(summary.total, `Domain ${domain} has no audit checks`).toBeGreaterThan(0);
        expect(summary.pass, `Domain ${domain} has no passing checks`).toBeGreaterThan(0);
        expect(summary.fail, `Domain ${domain} contains failed checks`).toBe(0);
      }
    });
  });

  describe('3. Domain 1: Regulatory Verification', () => {
    test('verifies current MIRA rules, effective dates, sources, and historical preservation', () => {
      const regItems = auditResult.items.filter((i) => i.domain === 'REGULATORY');
      expect(regItems.length).toBeGreaterThanOrEqual(4);

      const checkIds = regItems.map((i) => i.id);
      expect(checkIds).toContain('REG-001'); // Current rules documented
      expect(checkIds).toContain('REG-002'); // Effective dates implemented
      expect(checkIds).toContain('REG-003'); // Sources documented
      expect(checkIds).toContain('REG-004'); // Historical rules preserved

      expect(fs.existsSync(path.join(process.cwd(), 'REGULATORY_SOURCES.md'))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), 'REGULATORY_CHANGE_PROTOCOL.md'))).toBe(true);
    });
  });

  describe('4. Domain 2: Accounting Verification', () => {
    test('verifies double-entry integrity, immutable posted journals, trial balance, and period controls', () => {
      const accItems = auditResult.items.filter((i) => i.domain === 'ACCOUNTING');
      expect(accItems.length).toBeGreaterThanOrEqual(4);

      const checkIds = accItems.map((i) => i.id);
      expect(checkIds).toContain('ACC-001'); // Double-entry integrity
      expect(checkIds).toContain('ACC-002'); // Immutable posted journals
      expect(checkIds).toContain('ACC-003'); // Trial balance verification
      expect(checkIds).toContain('ACC-004'); // Accounting period controls
    });
  });

  describe('5. Domain 3: GST Verification', () => {
    test('verifies MIRA 205, MIRA 206, current rates, historical rates, and GST reconciliation', () => {
      const gstItems = auditResult.items.filter((i) => i.domain === 'GST');
      expect(gstItems.length).toBeGreaterThanOrEqual(5);

      const checkIds = gstItems.map((i) => i.id);
      expect(checkIds).toContain('GST-001'); // MIRA 205
      expect(checkIds).toContain('GST-002'); // MIRA 206
      expect(checkIds).toContain('GST-003'); // Current rates (8%, 17%)
      expect(checkIds).toContain('GST-004'); // Historical rates (6%, 16%)
      expect(checkIds).toContain('GST-005'); // GST reconciliation
    });
  });

  describe('6. Domain 4: NWT Verification', () => {
    test('verifies MIRA 602, Section 55 categories (10% and 5% contractor), payment date rule, and reconciliation', () => {
      const nwtItems = auditResult.items.filter((i) => i.domain === 'NWT');
      expect(nwtItems.length).toBeGreaterThanOrEqual(5);

      const checkIds = nwtItems.map((i) => i.id);
      expect(checkIds).toContain('NWT-001'); // MIRA 602
      expect(checkIds).toContain('NWT-002'); // 10% categories
      expect(checkIds).toContain('NWT-003'); // 5% contractor
      expect(checkIds).toContain('NWT-004'); // Earlier payment/payable date
      expect(checkIds).toContain('NWT-005'); // Reconciliation
    });
  });

  describe('7. Domain 5: Income Tax Verification', () => {
    test('verifies company rates, individual brackets, tax losses, tax adjustments, and capital allowances', () => {
      const itItems = auditResult.items.filter((i) => i.domain === 'INCOME_TAX');
      expect(itItems.length).toBeGreaterThanOrEqual(5);

      const checkIds = itItems.map((i) => i.id);
      expect(checkIds).toContain('IT-001'); // Company rates & threshold
      expect(checkIds).toContain('IT-002'); // Individual progressive brackets
      expect(checkIds).toContain('IT-003'); // Tax losses (Section 26)
      expect(checkIds).toContain('IT-004'); // Tax adjustments (Section 18)
      expect(checkIds).toContain('IT-005'); // Capital allowances (Section 19 & Sched 2)
    });
  });

  describe('8. Domain 6: MIRA Forms & Traceability Verification', () => {
    test('verifies MIRA 604 v25.1, schedules, form versions, and source traceability', () => {
      const miraItems = auditResult.items.filter((i) => i.domain === 'MIRA');
      expect(miraItems.length).toBeGreaterThanOrEqual(4);

      const checkIds = miraItems.map((i) => i.id);
      expect(checkIds).toContain('MIRA-001'); // MIRA 604 v25.1
      expect(checkIds).toContain('MIRA-002'); // Schedules 1, 2, 4, 5
      expect(checkIds).toContain('MIRA-003'); // Form versions
      expect(checkIds).toContain('MIRA-004'); // Source traceability
    });
  });

  describe('9. Domain 7: Audit Verification', () => {
    test('verifies immutable events, approvals, reversals, and period locking', () => {
      const auditItems = auditResult.items.filter((i) => i.domain === 'AUDIT');
      expect(auditItems.length).toBeGreaterThanOrEqual(4);

      const checkIds = auditItems.map((i) => i.id);
      expect(checkIds).toContain('AUD-001'); // Immutable hash-chained audit ledger
      expect(checkIds).toContain('AUD-002'); // Multi-tier approval workflow
      expect(checkIds).toContain('AUD-003'); // Reversal audit trail
      expect(checkIds).toContain('AUD-004'); // Period locking governance
    });
  });

  describe('10. Domain 8: Security Verification', () => {
    test('verifies authentication, authorization, tenant isolation, secrets, and file security', () => {
      const secItems = auditResult.items.filter((i) => i.domain === 'SECURITY');
      expect(secItems.length).toBeGreaterThanOrEqual(5);

      const checkIds = secItems.map((i) => i.id);
      expect(checkIds).toContain('SEC-001'); // PBKDF2 authentication
      expect(checkIds).toContain('SEC-002'); // RBAC middleware
      expect(checkIds).toContain('SEC-003'); // Tenant isolation
      expect(checkIds).toContain('SEC-004'); // Zero secret exposure
      expect(checkIds).toContain('SEC-005'); // Secure file upload
    });
  });

  describe('11. Domain 9: AI Governance Verification', () => {
    test('verifies no AI direct tax authority, review gates, and model version audit', () => {
      const aiItems = auditResult.items.filter((i) => i.domain === 'AI');
      expect(aiItems.length).toBeGreaterThanOrEqual(3);

      const checkIds = aiItems.map((i) => i.id);
      expect(checkIds).toContain('AI-001'); // No AI tax authority
      expect(checkIds).toContain('AI-002'); // Review gates
      expect(checkIds).toContain('AI-003'); // Model/version audit
    });
  });

  describe('12. Domain 10: Operations Verification', () => {
    test('verifies backups, restore, migrations, monitoring, and structured logging', () => {
      const opsItems = auditResult.items.filter((i) => i.domain === 'OPERATIONS');
      expect(opsItems.length).toBeGreaterThanOrEqual(5);

      const checkIds = opsItems.map((i) => i.id);
      expect(checkIds).toContain('OPS-001'); // Automated backups
      expect(checkIds).toContain('OPS-002'); // Disaster recovery restore
      expect(checkIds).toContain('OPS-003'); // Prisma migrations
      expect(checkIds).toContain('OPS-004'); // Performance & health monitoring
      expect(checkIds).toContain('OPS-005'); // Structured logging with redaction
    });
  });

  describe('13. Domain 11: Testing & Acceptance Verification', () => {
    test('verifies unit, integration, regression, golden cases, E2E, and Phase 50 acceptance tests', () => {
      const tstItems = auditResult.items.filter((i) => i.domain === 'TESTING');
      expect(tstItems.length).toBeGreaterThanOrEqual(6);

      const checkIds = tstItems.map((i) => i.id);
      expect(checkIds).toContain('TST-001'); // Unit testing
      expect(checkIds).toContain('TST-002'); // Integration testing
      expect(checkIds).toContain('TST-003'); // Regression testing
      expect(checkIds).toContain('TST-004'); // Golden cases
      expect(checkIds).toContain('TST-005'); // Master E2E
      expect(checkIds).toContain('TST-006'); // Accountant acceptance (Phase 50)
    });
  });

  describe('14. Production Readiness Report File Generation', () => {
    test('verifies PRODUCTION_READINESS_REPORT.md was successfully generated on disk', () => {
      const reportPath = path.join(process.cwd(), 'PRODUCTION_READINESS_REPORT.md');
      expect(fs.existsSync(reportPath)).toBe(true);

      const content = fs.readFileSync(reportPath, 'utf-8');
      expect(content).toContain('# Production Readiness Certification Report (Phase 51)');
      expect(content).toContain('CERTIFIED FOR PRODUCTION');
      expect(content).toContain('Zero Critical Failures');
      expect(content).toContain('1. Regulatory Compliance & Effective Dates');
      expect(content).toContain('2. Accounting Core & Double-Entry Integrity');
      expect(content).toContain('3. Goods & Services Tax (General GST & Tourism GST)');
      expect(content).toContain('4. Non-Resident Withholding Tax (Section 55)');
      expect(content).toContain('5. Income Tax (CIT, IIT, Losses & Allowances)');
      expect(content).toContain('6. MIRA Statutory Forms & Schedules');
      expect(content).toContain('7. Audit Ledger & Workflow Governance');
      expect(content).toContain('8. Application Security & Access Control');
      expect(content).toContain('9. AI Governance & OCR Review Gates');
      expect(content).toContain('10. Production Operations & Disaster Recovery');
      expect(content).toContain('11. Comprehensive Verification & Acceptance Testing');
      expect(content).toContain('OFFICIALLY CERTIFIED FOR ENTERPRISE PRODUCTION USE');
    });
  });
});
