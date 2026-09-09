import crypto from 'crypto';
import {
  RegulatoryComparisonReport,
  RegulatoryRule,
  RegulatorySnapshot,
  TaxType
} from '../types';
import { SEEDED_REGULATORY_RULES } from '../rules';
import { RuleResolver } from '../resolvers/ruleResolver';

export class RegulatorySnapshotService {
  /**
   * Computes a deterministic SHA-256 digest of a regulatory rule or collection of rules.
   */
  public static computeRuleDigest(rule: RegulatoryRule): string {
    const canonicalObject = {
      ruleId: rule.ruleId,
      taxType: rule.taxType,
      ruleCode: rule.ruleCode,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      taxYear: rule.taxYear,
      version: rule.version,
      legalReference: rule.legalReference,
      sourceURL: rule.sourceURL,
      sourceId: rule.sourceId || null,
      status: rule.status,
      sector: rule.sector || 'ALL',
      taxpayerType: rule.taxpayerType || 'ALL',
      jurisdiction: rule.jurisdiction || 'MV',
      parameters: rule.parameters
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonicalObject)).digest('hex');
  }

  /**
   * Generates a deterministic cryptographic snapshot of all rules applicable as of a given date or tax year.
   */
  public static createSnapshot(
    asOfDate: string,
    rules: RegulatoryRule[] = SEEDED_REGULATORY_RULES,
    customVersion?: string
  ): RegulatorySnapshot {
    const normalizedDate = RuleResolver.normalizeDate(asOfDate);
    const resolver = new RuleResolver(rules);

    // Resolve all active rules as of normalizedDate
    // Filter out rules not effective on normalizedDate
    const applicableRules = rules.filter((r) => {
      if (r.effectiveFrom > normalizedDate) return false;
      if (r.effectiveTo !== null && r.effectiveTo < normalizedDate) return false;
      return true;
    }).sort((a, b) => a.ruleId.localeCompare(b.ruleId));

    // Determine tax types covered
    const taxTypesSet = new Set<TaxType>();
    applicableRules.forEach((r) => taxTypesSet.add(r.taxType));
    const taxTypesCovered = Array.from(taxTypesSet).sort();

    // Determine representative regulatory version
    let regVersion = customVersion;
    if (!regVersion) {
      const year = parseInt(normalizedDate.slice(0, 4), 10);
      if (year >= 2025) regVersion = 'v25.1';
      else if (year >= 2024) regVersion = 'v24.1';
      else if (year >= 2023) regVersion = 'v23.1';
      else regVersion = 'v20.1';
    }

    // Attach checksum to each rule
    const hydratedRules = applicableRules.map((r) => ({
      ...r,
      checksum: RegulatorySnapshotService.computeRuleDigest(r)
    }));

    const digestPayload = {
      asOfDate: normalizedDate,
      regulatoryVersion: regVersion,
      rules: hydratedRules.map((r) => ({
        ruleId: r.ruleId,
        checksum: r.checksum
      }))
    };

    const sha256Digest = crypto.createHash('sha256').update(JSON.stringify(digestPayload)).digest('hex');
    const snapshotId = `SNAP-${normalizedDate}-${sha256Digest.slice(0, 8).toUpperCase()}`;

    return Object.freeze({
      snapshotId,
      asOfDate: normalizedDate,
      effectiveTaxYear: parseInt(normalizedDate.slice(0, 4), 10),
      regulatoryVersion: regVersion,
      createdAt: new Date().toISOString(),
      sha256Digest,
      ruleCount: hydratedRules.length,
      taxTypesCovered,
      rules: hydratedRules
    });
  }

  /**
   * Verifies the cryptographic integrity of a snapshot.
   */
  public static verifySnapshotIntegrity(snapshot: RegulatorySnapshot): {
    isValid: boolean;
    computedDigest: string;
    expectedDigest: string;
    corruptedRuleIds: string[];
  } {
    const corruptedRuleIds: string[] = [];

    snapshot.rules.forEach((r) => {
      const computed = RegulatorySnapshotService.computeRuleDigest(r);
      if (r.checksum && r.checksum !== computed) {
        corruptedRuleIds.push(r.ruleId);
      }
    });

    const digestPayload = {
      asOfDate: snapshot.asOfDate,
      regulatoryVersion: snapshot.regulatoryVersion,
      rules: snapshot.rules.map((r) => ({
        ruleId: r.ruleId,
        checksum: RegulatorySnapshotService.computeRuleDigest(r)
      }))
    };

    const computedDigest = crypto.createHash('sha256').update(JSON.stringify(digestPayload)).digest('hex');
    const isValid = corruptedRuleIds.length === 0 && computedDigest === snapshot.sha256Digest;

    return {
      isValid,
      computedDigest,
      expectedDigest: snapshot.sha256Digest,
      corruptedRuleIds
    };
  }

  /**
   * Compares two snapshots to detect regulatory changes, rate alterations, or rule additions/removals.
   */
  public static compareSnapshots(
    baseline: RegulatorySnapshot,
    target: RegulatorySnapshot
  ): RegulatoryComparisonReport {
    const baselineMap = new Map<string, RegulatoryRule>(baseline.rules.map((r) => [r.ruleId, r]));
    const targetMap = new Map<string, RegulatoryRule>(target.rules.map((r) => [r.ruleId, r]));

    const addedRules: RegulatoryRule[] = [];
    const removedRules: RegulatoryRule[] = [];
    const modifiedRules: RegulatoryComparisonReport['modifiedRules'] = [];

    targetMap.forEach((targetRule, id) => {
      if (!baselineMap.has(id)) {
        addedRules.push(targetRule);
      } else {
        const baseRule = baselineMap.get(id)!;
        if (targetRule.checksum !== baseRule.checksum) {
          // Identify modified fields
          if (targetRule.effectiveFrom !== baseRule.effectiveFrom) {
            modifiedRules.push({
              ruleId: id,
              ruleCode: id,
              field: 'effectiveFrom',
              oldValue: baseRule.effectiveFrom,
              newValue: targetRule.effectiveFrom
            });
          }
          if (targetRule.effectiveTo !== baseRule.effectiveTo) {
            modifiedRules.push({
              ruleId: id,
              ruleCode: id,
              field: 'effectiveTo',
              oldValue: baseRule.effectiveTo,
              newValue: targetRule.effectiveTo
            });
          }
          if (JSON.stringify(targetRule.parameters) !== JSON.stringify(baseRule.parameters)) {
            modifiedRules.push({
              ruleId: id,
              ruleCode: id,
              field: 'parameters',
              oldValue: baseRule.parameters,
              newValue: targetRule.parameters
            });
          }
        }
      }
    });

    baselineMap.forEach((baseRule, id) => {
      if (!targetMap.has(id)) {
        removedRules.push(baseRule);
      }
    });

    const isIdentical = addedRules.length === 0 && removedRules.length === 0 && modifiedRules.length === 0;

    return {
      baselineSnapshotId: baseline.snapshotId,
      targetSnapshotId: target.snapshotId,
      asOfDateBaseline: baseline.asOfDate,
      asOfDateTarget: target.asOfDate,
      addedRules,
      removedRules,
      modifiedRules,
      isIdentical
    };
  }
}
