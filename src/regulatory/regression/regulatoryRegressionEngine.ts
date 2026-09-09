import {
  RegulatoryRegressionResult,
  RegulatoryRule,
  RegulatoryTestCase,
  RegulatoryTestCaseResult
} from '../types';
import { RuleResolver } from '../resolvers/ruleResolver';
import { SEEDED_REGULATORY_RULES } from '../rules';
import { RegulatorySnapshotService } from '../snapshot/regulatorySnapshotService';

export class RegulatoryConfigurationTamperingError extends Error {
  constructor(message: string) {
    super(`[RegulatorySecurityViolation] UI / runtime configuration tampering rejected: ${message}`);
    this.name = 'RegulatoryConfigurationTamperingError';
  }
}

export class RegulatoryRegressionEngine {
  private resolver: RuleResolver;
  private rules: RegulatoryRule[];

  constructor(rules: RegulatoryRule[] = SEEDED_REGULATORY_RULES) {
    this.rules = rules;
    this.resolver = new RuleResolver(rules);
  }

  /**
   * Executes a single regulatory test case against the active rule resolver.
   */
  public executeTestCase(rule: RegulatoryRule, testCase: RegulatoryTestCase): RegulatoryTestCaseResult {
    try {
      const resolved = this.resolver.resolveRule({
        transactionDate: testCase.input.transactionDate,
        taxYear: testCase.input.taxYear,
        taxpayerType: testCase.input.taxpayerType,
        sector: testCase.input.sector,
        taxType: testCase.input.taxType || rule.taxType,
        ruleCode: testCase.input.ruleCode || rule.ruleCode
      });

      if (!resolved) {
        return {
          ruleId: rule.ruleId,
          testCaseId: testCase.testCaseId,
          name: testCase.name,
          passed: false,
          error: `Rule did not resolve for input date ${testCase.input.transactionDate}`,
          expected: testCase.expected.ruleId,
          actual: null
        };
      }

      // 1. Verify Rule ID match
      if (resolved.ruleId !== testCase.expected.ruleId) {
        return {
          ruleId: rule.ruleId,
          testCaseId: testCase.testCaseId,
          name: testCase.name,
          passed: false,
          error: `Rule ID mismatch: expected ${testCase.expected.ruleId}, got ${resolved.ruleId}`,
          expected: testCase.expected.ruleId,
          actual: resolved.ruleId
        };
      }

      // 2. Verify rate if expected
      if (testCase.expected.rate !== undefined) {
        const actualRate = resolved.parameters.rate;
        if (actualRate !== testCase.expected.rate) {
          return {
            ruleId: rule.ruleId,
            testCaseId: testCase.testCaseId,
            name: testCase.name,
            passed: false,
            error: `Rate mismatch: expected ${testCase.expected.rate}, got ${actualRate}`,
            expected: testCase.expected.rate,
            actual: actualRate
          };
        }
      }

      // 3. Verify threshold if expected
      if (testCase.expected.threshold !== undefined) {
        const actualThreshold = resolved.parameters.standardThreshold || resolved.parameters.threshold;
        if (actualThreshold !== testCase.expected.threshold) {
          return {
            ruleId: rule.ruleId,
            testCaseId: testCase.testCaseId,
            name: testCase.name,
            passed: false,
            error: `Threshold mismatch: expected ${testCase.expected.threshold}, got ${actualThreshold}`,
            expected: testCase.expected.threshold,
            actual: actualThreshold
          };
        }
      }

      // 4. Verify calculated tax if amount and calculatedTax are provided
      if (testCase.input.amount !== undefined && testCase.expected.calculatedTax !== undefined) {
        let calculated = 0;
        if (resolved.taxType === 'GST' || resolved.taxType === 'NWT') {
          const rate = resolved.parameters.rate as number;
          calculated = Math.round(testCase.input.amount * rate * 100) / 100;
        } else if (resolved.taxType === 'INCOME_TAX' && resolved.parameters.standardThreshold !== undefined) {
          const taxableAbove = Math.max(0, testCase.input.amount - (resolved.parameters.standardThreshold as number));
          calculated = Math.round(taxableAbove * (resolved.parameters.aboveThresholdRate as number) * 100) / 100;
        }

        if (calculated !== testCase.expected.calculatedTax) {
          return {
            ruleId: rule.ruleId,
            testCaseId: testCase.testCaseId,
            name: testCase.name,
            passed: false,
            error: `Calculated tax mismatch: expected ${testCase.expected.calculatedTax}, got ${calculated}`,
            expected: testCase.expected.calculatedTax,
            actual: calculated
          };
        }
      }

      return {
        ruleId: rule.ruleId,
        testCaseId: testCase.testCaseId,
        name: testCase.name,
        passed: true,
        expected: testCase.expected,
        actual: {
          resolvedRuleId: resolved.ruleId,
          parameters: resolved.parameters
        }
      };
    } catch (err: any) {
      return {
        ruleId: rule.ruleId,
        testCaseId: testCase.testCaseId,
        name: testCase.name,
        passed: false,
        error: err.message || 'Execution error',
        expected: testCase.expected,
        actual: null
      };
    }
  }

  /**
   * Executes the full regression suite across all registered rules and their embedded test cases.
   */
  public runFullRegressionSuite(): RegulatoryRegressionResult {
    const testCaseResults: RegulatoryTestCaseResult[] = [];
    const executedRuleIds: string[] = [];

    this.rules.forEach((rule) => {
      executedRuleIds.push(rule.ruleId);
      if (rule.testCases && rule.testCases.length > 0) {
        rule.testCases.forEach((tc) => {
          const result = this.executeTestCase(rule, tc);
          testCaseResults.push(result);
        });
      }
    });

    const passed = testCaseResults.filter((r) => r.passed).length;
    const failed = testCaseResults.filter((r) => !r.passed).length;

    return {
      totalTests: testCaseResults.length,
      passed,
      failed,
      isSuccess: failed === 0,
      timestamp: new Date().toISOString(),
      executedRuleIds,
      testCaseResults,
      historicalConsistencyConfirmed: failed === 0
    };
  }

  /**
   * Acceptance Test: Simulates introducing a future statutory tax rule.
   * Verifies that:
   * 1. 2024 calculations remain 100% unchanged.
   * 2. 2025 calculations remain 100% unchanged where applicable.
   * 3. Future period uses the new rule.
   * 4. Old historical rules remain available.
   */
  public simulateFutureRuleEvolution(params: {
    futureRule: RegulatoryRule;
    testCasesForFuture: RegulatoryTestCase[];
    historicalDatesToCheck: Array<{ date: string; taxType: any; ruleCode: string; expectedRuleId: string; expectedRate?: number }>;
  }): {
    success: boolean;
    historicalIntegrityPreserved: boolean;
    futureRuleActive: boolean;
    baseline2024Check: boolean;
    baseline2025Check: boolean;
    details: string[];
  } {
    const details: string[] = [];
    
    // Create new augmented rule set
    const augmentedRules: RegulatoryRule[] = [
      ...this.rules,
      {
        ...params.futureRule,
        checksum: RegulatorySnapshotService.computeRuleDigest(params.futureRule),
        testCases: params.testCasesForFuture
      }
    ];

    const augmentedEngine = new RegulatoryRegressionEngine(augmentedRules);

    // 1. Check historical dates against augmented rules
    let historicalIntegrityPreserved = true;
    let baseline2024Check = true;
    let baseline2025Check = true;

    params.historicalDatesToCheck.forEach((chk) => {
      const resolved = augmentedEngine.resolver.resolveRule({
        transactionDate: chk.date,
        taxType: chk.taxType,
        ruleCode: chk.ruleCode
      });

      const matched = resolved?.ruleId === chk.expectedRuleId &&
        (chk.expectedRate === undefined || resolved?.parameters.rate === chk.expectedRate);

      if (!matched) {
        historicalIntegrityPreserved = false;
        if (chk.date.startsWith('2024')) baseline2024Check = false;
        if (chk.date.startsWith('2025')) baseline2025Check = false;
        details.push(`Historical check failed for ${chk.date}: expected ${chk.expectedRuleId}, got ${resolved?.ruleId}`);
      } else {
        details.push(`Historical check PASSED for ${chk.date}: ${chk.expectedRuleId}`);
      }
    });

    // 2. Check future rule resolution
    let futureRuleActive = true;
    params.testCasesForFuture.forEach((tc) => {
      const res = augmentedEngine.executeTestCase(params.futureRule, tc);
      if (!res.passed) {
        futureRuleActive = false;
        details.push(`Future test case failed: ${tc.name} (${res.error})`);
      } else {
        details.push(`Future test case PASSED: ${tc.name}`);
      }
    });

    const success = historicalIntegrityPreserved && futureRuleActive && baseline2024Check && baseline2025Check;

    return {
      success,
      historicalIntegrityPreserved,
      futureRuleActive,
      baseline2024Check,
      baseline2025Check,
      details
    };
  }

  /**
   * Governance Guardrail: Rejects arbitrary runtime UI mutations of statutory tax rules.
   */
  public static rejectUIConfigurationOverride(attemptedChange: Record<string, any>): never {
    throw new RegulatoryConfigurationTamperingError(
      `Direct modification of statutory tax rule via UI configuration is strictly forbidden. ` +
      `All regulatory changes must be codified as versioned, effective-dated RegulatoryRule instances with statutory citations. Attempted: ${JSON.stringify(attemptedChange)}`
    );
  }
}
