import { describe, it, expect } from 'vitest';
import { GoldenCaseRegistry } from '../../src/services/golden/goldenCaseRegistry';
import { GoldenCaseRunner } from '../../src/services/golden/goldenCaseRunner';
import { GoldenCaseId, GoldenTaxCaseFixture } from '../../src/types/goldenCases';
import { computeFixtureDigest } from '../../src/services/golden/goldenCaseDefinitions';

describe('Phase 41 — Golden Regulatory Tax Cases Suite', () => {
  const registry = GoldenCaseRegistry.getInstance();
  const runner = new GoldenCaseRunner();

  describe('1. Immutable Golden Case Integrity & Structure', () => {
    it('contains exactly 20 authoritative golden cases (GOLDEN-001 to GOLDEN-020)', () => {
      const allFixtures = registry.getAllFixtures();
      expect(allFixtures).toHaveLength(20);

      for (let i = 1; i <= 20; i++) {
        const caseId = `GOLDEN-${String(i).padStart(3, '0')}` as GoldenCaseId;
        const fixture = registry.getFixture(caseId);
        expect(fixture).toBeDefined();
        expect(fixture.caseNumber).toBe(i);
        expect(fixture.caseId).toBe(caseId);
      }
    });

    it('each golden case fixture contains all mandatory top-level sections', () => {
      const allFixtures = registry.getAllFixtures();
      for (const fixture of allFixtures) {
        expect(fixture.title).toBeTypeOf('string');
        expect(fixture.description).toBeTypeOf('string');
        expect(fixture.category).toBeTypeOf('string');
        expect(fixture.regulatoryReferences).toBeInstanceOf(Array);
        expect(fixture.regulatoryReferences.length).toBeGreaterThan(0);
        expect(fixture.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(fixture.inputs).toBeDefined();
        expect(fixture.expectedClassifications).toBeDefined();
        expect(fixture.expectedCalculations).toBeDefined();
        expect(fixture.expectedReturnValues).toBeDefined();
        expect(fixture.expectedReconciliationState).toBeDefined();
        expect(fixture.immutableSha256Checksum).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('cryptographically verifies all 20 fixtures without any checksum mismatch', () => {
      const result = registry.verifyIntegrity();
      expect(result.isValid).toBe(true);
      expect(result.checkedCount).toBe(20);
      expect(result.errors).toHaveLength(0);
    });

    it('fails integrity check immediately if any fixture content is modified', () => {
      const baseFixture = registry.getFixture('GOLDEN-001');
      const tamperedFixture: GoldenTaxCaseFixture = {
        ...baseFixture,
        inputs: {
          ...baseFixture.inputs,
          taxpayer: {
            ...baseFixture.inputs.taxpayer,
            taxpayerName: 'Tampered Malicious Name'
          }
        }
      };

      const { immutableSha256Checksum, ...rest } = tamperedFixture;
      const recomputed = computeFixtureDigest(rest);
      expect(recomputed).not.toBe(tamperedFixture.immutableSha256Checksum);
    });
  });

  describe('2. Execution of Authoritative Benchmark Cases (GOLDEN-001 to GOLDEN-020)', () => {
    it('GOLDEN-001: simple purchase with standard-rated general GST (8%)', async () => {
      const res = await runner.executeCase('GOLDEN-001');
      expect(res.passed).toBe(true);
      expect(res.checksumValid).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.classificationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-002: general GST return calculation under 8% regime', async () => {
      const res = await runner.executeCase('GOLDEN-002');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-003: tourism GST before 2025-07-01 resolves to historical 16% TGST', async () => {
      const res = await runner.executeCase('GOLDEN-003');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-004: tourism GST from 2025-07-01 resolves to statutory 17% TGST', async () => {
      const res = await runner.executeCase('GOLDEN-004');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-005: exempt purchase carries 0.00 claimable input tax', async () => {
      const res = await runner.executeCase('GOLDEN-005');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-006: blocked input tax on hospitality / entertainment with Income Tax add-back', async () => {
      const res = await runner.executeCase('GOLDEN-006');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-007: capital asset acquisition and Schedule 2 capital allowance pooling', async () => {
      const res = await runner.executeCase('GOLDEN-007');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-008: foreign currency purchase with MMA exchange rate and realized FX calculation', async () => {
      const res = await runner.executeCase('GOLDEN-008');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-009: non-resident withholding tax on technical services (10%)', async () => {
      const res = await runner.executeCase('GOLDEN-009');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-010: non-resident contractor withholding tax (5%)', async () => {
      const res = await runner.executeCase('GOLDEN-010');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-011: double tax avoidance agreement (DTAA) treaty relief exemption (0%)', async () => {
      const res = await runner.executeCase('GOLDEN-011');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-012: company income tax (MIRA 604 v25.1 progressive calculation)', async () => {
      const res = await runner.executeCase('GOLDEN-012');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-013: individual income tax 5-bracket progressive calculation', async () => {
      const res = await runner.executeCase('GOLDEN-013');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-014: prior year tax loss offset and carry-forward lot relief', async () => {
      const res = await runner.executeCase('GOLDEN-014');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-015: related-party transaction and transfer pricing arm\'s length add-back', async () => {
      const res = await runner.executeCase('GOLDEN-015');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-016: controlled foreign entity (CFE) attributable income inclusion', async () => {
      const res = await runner.executeCase('GOLDEN-016');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-017: period lock state machine enforcement and mutation blocking', async () => {
      const res = await runner.executeCase('GOLDEN-017');
      expect(res.passed).toBe(true);
      expect(res.reconciliationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-018: accounting reversal via balanced contra entries with zero trial balance variance', async () => {
      const res = await runner.executeCase('GOLDEN-018');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-019: OCR extraction correction preserving raw OCR hash and lineage audit trail', async () => {
      const res = await runner.executeCase('GOLDEN-019');
      expect(res.passed).toBe(true);
      expect(res.calculationMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('GOLDEN-020: comprehensive MIRA offline statutory filing package generation', async () => {
      const res = await runner.executeCase('GOLDEN-020');
      expect(res.passed).toBe(true);
      expect(res.returnMatches).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });

  describe('3. Batch Execution & Category Filtering', () => {
    it('executes all 20 golden cases with 100% pass rate in runner.executeAll()', async () => {
      const results = await runner.executeAll();
      expect(results).toHaveLength(20);

      const failedCases = results.filter(r => !r.passed);
      if (failedCases.length > 0) {
        console.error('Failed golden cases:', JSON.stringify(failedCases, null, 2));
      }
      expect(failedCases).toHaveLength(0);
    });

    it('correctly filters golden fixtures by category', () => {
      const gstCases = registry.getFixturesByCategory('GST');
      expect(gstCases.length).toBeGreaterThanOrEqual(5);

      const nwtCases = registry.getFixturesByCategory('NWT');
      expect(nwtCases.length).toBe(3);

      const incomeTaxCases = registry.getFixturesByCategory('INCOME_TAX');
      expect(incomeTaxCases.length).toBe(3);
    });
  });
});
