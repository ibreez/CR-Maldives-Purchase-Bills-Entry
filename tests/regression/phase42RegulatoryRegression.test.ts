import { describe, it, expect } from 'vitest';
import {
  SEEDED_REGULATORY_RULES,
  RegulatorySnapshotService,
  RegulatoryRegressionEngine,
  RegulatoryConfigurationTamperingError,
  RegulatoryRule,
  RegulatoryTestCase
} from '../../src/regulatory';

describe('Phase 42: Regulatory Regression Framework', () => {
  const engine = new RegulatoryRegressionEngine(SEEDED_REGULATORY_RULES);

  describe('Rule Metadata & Test Case Completeness', () => {
    it('ensures every regulatory rule has effectiveFrom, effectiveTo, version, sourceId, and testCases', () => {
      SEEDED_REGULATORY_RULES.forEach((rule) => {
        expect(rule.ruleId, `Rule ${rule.ruleId} must have valid ruleId`).toBeTruthy();
        expect(rule.effectiveFrom, `Rule ${rule.ruleId} must have effectiveFrom`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (rule.effectiveTo !== null) {
          expect(rule.effectiveTo, `Rule ${rule.ruleId} effectiveTo must be valid date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(rule.effectiveFrom <= rule.effectiveTo, `effectiveFrom <= effectiveTo for ${rule.ruleId}`).toBe(true);
        }
        expect(rule.version, `Rule ${rule.ruleId} must have version`).toMatch(/^v\d+\.\d+$/);
        expect(rule.sourceId || rule.sourceURL, `Rule ${rule.ruleId} must have statutory source`).toBeTruthy();
        expect(rule.legalReference, `Rule ${rule.ruleId} must have legalReference`).toBeTruthy();
        expect(rule.testCases, `Rule ${rule.ruleId} must have embedded test cases`).toBeDefined();
        expect(rule.testCases!.length, `Rule ${rule.ruleId} must have at least 1 test case`).toBeGreaterThan(0);
      });
    });

    it('executes all embedded test cases across all rules with 100% success', () => {
      const regressionResult = engine.runFullRegressionSuite();
      expect(regressionResult.totalTests).toBeGreaterThanOrEqual(25);
      expect(regressionResult.failed).toBe(0);
      expect(regressionResult.passed).toBe(regressionResult.totalTests);
      expect(regressionResult.isSuccess).toBe(true);
      expect(regressionResult.historicalConsistencyConfirmed).toBe(true);
    });
  });

  describe('Cryptographic Regulatory Snapshots', () => {
    it('creates deterministic snapshots with verified SHA-256 integrity', () => {
      const snapshot2024 = RegulatorySnapshotService.createSnapshot('2024-06-15');
      const snapshot2024Duplicate = RegulatorySnapshotService.createSnapshot('2024-06-15');

      expect(snapshot2024.sha256Digest).toBe(snapshot2024Duplicate.sha256Digest);
      expect(snapshot2024.ruleCount).toBeGreaterThan(0);
      expect(snapshot2024.taxTypesCovered).toContain('GST');
      expect(snapshot2024.taxTypesCovered).toContain('INCOME_TAX');
      expect(snapshot2024.taxTypesCovered).toContain('CAPITAL_ALLOWANCE');

      const verification = RegulatorySnapshotService.verifySnapshotIntegrity(snapshot2024);
      expect(verification.isValid).toBe(true);
      expect(verification.corruptedRuleIds).toHaveLength(0);
    });

    it('detects tampering or corruption in snapshots', () => {
      const snapshot = RegulatorySnapshotService.createSnapshot('2024-06-15');
      // Create a tampered copy
      const tamperedRules = snapshot.rules.map((r, i) =>
        i === 0 ? { ...r, parameters: { ...r.parameters, rate: 0.99 } } : r
      );
      const tamperedSnapshot = { ...snapshot, rules: tamperedRules };

      const verification = RegulatorySnapshotService.verifySnapshotIntegrity(tamperedSnapshot);
      expect(verification.isValid).toBe(false);
      expect(verification.corruptedRuleIds.length).toBeGreaterThan(0);
    });

    it('accurately compares snapshots between different statutory regimes', () => {
      const snap2022 = RegulatorySnapshotService.createSnapshot('2022-06-15'); // 6% General GST, 12% Tourism GST
      const snap2024 = RegulatorySnapshotService.createSnapshot('2024-06-15'); // 8% General GST, 16% Tourism GST
      const snap2026 = RegulatorySnapshotService.createSnapshot('2026-06-15'); // 8% General GST, 17% Tourism GST

      const comp2022vs2024 = RegulatorySnapshotService.compareSnapshots(snap2022, snap2024);
      expect(comp2022vs2024.isIdentical).toBe(false);
      expect(comp2022vs2024.addedRules.map((r) => r.ruleId)).toContain('RULE-GST-GEN-8');
      expect(comp2022vs2024.addedRules.map((r) => r.ruleId)).toContain('RULE-GST-TOU-16');

      const comp2024vs2026 = RegulatorySnapshotService.compareSnapshots(snap2024, snap2026);
      expect(comp2024vs2026.isIdentical).toBe(false);
      expect(comp2024vs2026.addedRules.map((r) => r.ruleId)).toContain('RULE-GST-TOU-17');
    });
  });

  describe('Historical Rule Availability & Rate Transition Boundaries', () => {
    it('correctly resolves historical vs contemporary rates across exact date boundaries', () => {
      // GST General: <= 2022-12-31 -> 6%, >= 2023-01-01 -> 8%
      const resGst2022 = engine.executeTestCase(
        SEEDED_REGULATORY_RULES.find((r) => r.ruleId === 'RULE-GST-GEN-HIST-6')!,
        {
          testCaseId: 'TC-BOUNDARY-01',
          name: 'General GST 2022-12-31',
          input: { transactionDate: '2022-12-31', taxType: 'GST', sector: 'GENERAL', amount: 10000 },
          expected: { ruleId: 'RULE-GST-GEN-HIST-6', rate: 0.06, calculatedTax: 600 }
        }
      );
      expect(resGst2022.passed).toBe(true);

      const resGst2023 = engine.executeTestCase(
        SEEDED_REGULATORY_RULES.find((r) => r.ruleId === 'RULE-GST-GEN-8')!,
        {
          testCaseId: 'TC-BOUNDARY-02',
          name: 'General GST 2023-01-01',
          input: { transactionDate: '2023-01-01', taxType: 'GST', sector: 'GENERAL', amount: 10000 },
          expected: { ruleId: 'RULE-GST-GEN-8', rate: 0.08, calculatedTax: 800 }
        }
      );
      expect(resGst2023.passed).toBe(true);

      // GST Tourism: 2024-05-01 -> 16%, 2025-06-30 -> 16%, 2025-07-01 -> 17%
      const resTou2024 = engine.executeTestCase(
        SEEDED_REGULATORY_RULES.find((r) => r.ruleId === 'RULE-GST-TOU-16')!,
        {
          testCaseId: 'TC-BOUNDARY-03',
          name: 'Tourism GST 2024',
          input: { transactionDate: '2024-05-01', taxType: 'GST', sector: 'TOURISM', amount: 10000 },
          expected: { ruleId: 'RULE-GST-TOU-16', rate: 0.16, calculatedTax: 1600 }
        }
      );
      expect(resTou2024.passed).toBe(true);

      const resTou2025June = engine.executeTestCase(
        SEEDED_REGULATORY_RULES.find((r) => r.ruleId === 'RULE-GST-TOU-16')!,
        {
          testCaseId: 'TC-BOUNDARY-04',
          name: 'Tourism GST 2025-06-30',
          input: { transactionDate: '2025-06-30', taxType: 'GST', sector: 'TOURISM', amount: 10000 },
          expected: { ruleId: 'RULE-GST-TOU-16', rate: 0.16, calculatedTax: 1600 }
        }
      );
      expect(resTou2025June.passed).toBe(true);

      const resTou2025July = engine.executeTestCase(
        SEEDED_REGULATORY_RULES.find((r) => r.ruleId === 'RULE-GST-TOU-17')!,
        {
          testCaseId: 'TC-BOUNDARY-05',
          name: 'Tourism GST 2025-07-01',
          input: { transactionDate: '2025-07-01', taxType: 'GST', sector: 'TOURISM', amount: 10000 },
          expected: { ruleId: 'RULE-GST-TOU-17', rate: 0.17, calculatedTax: 1700 }
        }
      );
      expect(resTou2025July.passed).toBe(true);
    });
  });

  describe('Acceptance Test: Future Tax Rule Evolution with Zero Historical Regression', () => {
    it('introduces a future 2027 statutory rule and verifies 2024/2025 calculations remain 100% unchanged', () => {
      // Suppose in 2027, General GST increases to 10%
      const futureRule: RegulatoryRule = {
        ruleId: 'RULE-GST-GEN-2027-10',
        taxType: 'GST',
        ruleCode: 'GST_GENERAL_RATE',
        description: 'Future 2027 Statutory General Sector GST Rate (10%)',
        effectiveFrom: '2027-01-01',
        effectiveTo: null,
        taxYear: null,
        version: 'v27.1',
        legalReference: 'Hypothetical Future GST Amendment Act 2026 Section 15',
        sourceId: 'MIRA-SRC-FUTURE-001',
        sourceURL: 'https://www.mira.gov.mv/Legislations/View/GST-Act-2027',
        parameters: {
          rate: 0.10,
          ratePercentage: 10
        },
        status: 'ACTIVE',
        sector: 'GENERAL',
        taxpayerType: 'ALL',
        jurisdiction: 'MV'
      };

      const testCasesForFuture: RegulatoryTestCase[] = [
        {
          testCaseId: 'TC-FUTURE-01',
          name: 'General GST 2027 at 10%',
          input: { transactionDate: '2027-01-15', taxType: 'GST', sector: 'GENERAL', amount: 1000 },
          expected: { ruleId: 'RULE-GST-GEN-2027-10', rate: 0.10, calculatedTax: 100 }
        },
        {
          testCaseId: 'TC-FUTURE-02',
          name: 'General GST 2028 at 10%',
          input: { transactionDate: '2028-06-01', taxType: 'GST', sector: 'GENERAL', amount: 5000 },
          expected: { ruleId: 'RULE-GST-GEN-2027-10', rate: 0.10, calculatedTax: 500 }
        }
      ];

      const simulation = engine.simulateFutureRuleEvolution({
        futureRule,
        testCasesForFuture,
        historicalDatesToCheck: [
          { date: '2022-06-01', taxType: 'GST', ruleCode: 'GST_GENERAL_RATE', expectedRuleId: 'RULE-GST-GEN-HIST-6', expectedRate: 0.06 },
          { date: '2024-03-15', taxType: 'GST', ruleCode: 'GST_GENERAL_RATE', expectedRuleId: 'RULE-GST-GEN-8', expectedRate: 0.08 },
          { date: '2025-08-01', taxType: 'GST', ruleCode: 'GST_GENERAL_RATE', expectedRuleId: 'RULE-GST-GEN-8', expectedRate: 0.08 },
          { date: '2026-09-02', taxType: 'GST', ruleCode: 'GST_GENERAL_RATE', expectedRuleId: 'RULE-GST-GEN-8', expectedRate: 0.08 }
        ]
      });

      expect(simulation.success).toBe(true);
      expect(simulation.historicalIntegrityPreserved).toBe(true);
      expect(simulation.futureRuleActive).toBe(true);
      expect(simulation.baseline2024Check).toBe(true);
      expect(simulation.baseline2025Check).toBe(true);
    });
  });

  describe('Security & Governance Guardrails', () => {
    it('rejects arbitrary UI/runtime configuration tampering', () => {
      expect(() => {
        RegulatoryRegressionEngine.rejectUIConfigurationOverride({
          field: 'taxRate',
          newRate: 0.05,
          user: 'admin_ui'
        });
      }).toThrow(RegulatoryConfigurationTamperingError);
    });
  });
});
