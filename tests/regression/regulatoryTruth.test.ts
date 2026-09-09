import { describe, it, expect } from 'vitest';
import {
  RuleResolver,
  defaultRuleResolver,
  SEEDED_REGULATORY_RULES,
  MIRA_REGULATORY_SOURCES,
  MIRA_REGULATORY_VERSIONS
} from '../../src/regulatory';

describe('Phase 19 — Regulatory Truth Layer', () => {
  const resolver = defaultRuleResolver;

  it('Criteria 1: RuleResolver is deterministic for identical inputs', () => {
    const context = {
      transactionDate: '2025-08-15',
      taxType: 'GST' as const,
      sector: 'GENERAL' as const
    };

    const res1 = resolver.resolveRule(context);
    const res2 = resolver.resolveRule(context);
    const res3 = resolver.resolveRule(context);

    expect(res1).not.toBeNull();
    expect(res1?.ruleId).toBe('RULE-GST-GEN-8');
    expect(res1?.parameters.rate).toBe(0.08);

    expect(res1).toEqual(res2);
    expect(res2).toEqual(res3);
  });

  it('Criteria 2: Historical GST rates resolve correctly according to effective dates', () => {
    // General GST historical: 6% before 2023-01-01
    const histGeneral = resolver.resolveGSTRate('2022-06-15', 'GENERAL');
    expect(histGeneral.rate).toBe(0.06);
    expect(histGeneral.ratePercentage).toBe(6);
    expect(histGeneral.rule.ruleId).toBe('RULE-GST-GEN-HIST-6');

    // General GST current: 8% on or after 2023-01-01
    const currentGeneral = resolver.resolveGSTRate('2023-01-01', 'GENERAL');
    expect(currentGeneral.rate).toBe(0.08);
    expect(currentGeneral.ratePercentage).toBe(8);
    expect(currentGeneral.rule.ruleId).toBe('RULE-GST-GEN-8');

    // Tourism GST historical: 12% before 2023-01-01
    const histTourism = resolver.resolveGSTRate('2022-12-31', 'TOURISM');
    expect(histTourism.rate).toBe(0.12);
    expect(histTourism.ratePercentage).toBe(12);
    expect(histTourism.rule.ruleId).toBe('RULE-GST-TOU-HIST-12');

    // Tourism GST prior rate: 16% between 2023-01-01 and 2025-06-30
    const tourism16 = resolver.resolveGSTRate('2024-12-31', 'TOURISM');
    expect(tourism16.rate).toBe(0.16);
    expect(tourism16.ratePercentage).toBe(16);
    expect(tourism16.rule.ruleId).toBe('RULE-GST-TOU-16');
  });

  it('Criteria 3: Tourism GST on 2025-07-01 resolves to 17%', () => {
    const tourism17 = resolver.resolveGSTRate('2025-07-01', 'TOURISM');
    expect(tourism17.rate).toBe(0.17);
    expect(tourism17.ratePercentage).toBe(17);
    expect(tourism17.rule.ruleId).toBe('RULE-GST-TOU-17');
    expect(tourism17.rule.legalReference).toContain('Act No. 12/2024');

    // Future date also resolves to 17%
    const futureTourism = resolver.resolveGSTRate('2026-08-13', 'TOURISM');
    expect(futureTourism.rate).toBe(0.17);
  });

  it('Criteria 4: Individual 5.5% bracket resolves correctly', () => {
    const indRule = resolver.resolveIndividualTaxBrackets('2024-01-01');
    expect(indRule.rule.ruleId).toBe('RULE-IT-INDIVIDUAL-BRACKETS');

    const brackets = indRule.brackets;
    expect(brackets).toHaveLength(5);

    // Bracket 1: 0 to 720k @ 0%
    expect(brackets[0].from).toBe(0);
    expect(brackets[0].to).toBe(720000);
    expect(brackets[0].rate).toBe(0.00);

    // Bracket 2: 720,001 to 1,200,000 @ 5.5%
    expect(brackets[1].from).toBe(720000);
    expect(brackets[1].to).toBe(1200000);
    expect(brackets[1].rate).toBe(0.055);
    expect(brackets[1].ratePercentage).toBe(5.5);

    // Bracket 3: 1.2M to 1.8M @ 8%
    expect(brackets[2].rate).toBe(0.08);

    // Bracket 4: 1.8M to 2.4M @ 12%
    expect(brackets[3].rate).toBe(0.12);

    // Bracket 5: > 2.4M @ 15%
    expect(brackets[4].rate).toBe(0.15);
  });

  it('Criteria 5: Company MVR 500,000 threshold resolves correctly', () => {
    const companyRule = resolver.resolveCompanyIncomeTaxRule('2024-01-01');
    expect(companyRule.ruleId).toBe('RULE-IT-COMPANY-500K');
    expect(companyRule.parameters.standardThreshold).toBe(500000);
    expect(companyRule.parameters.belowThresholdRate).toBe(0.0);
    expect(companyRule.parameters.aboveThresholdRate).toBe(0.15);
    expect(companyRule.parameters.aboveThresholdRatePercentage).toBe(15);
  });

  it('Criteria 6: NWT non-resident contractor resolves to 5%', () => {
    const contractorNWT = resolver.resolveNWTRate('NON_RESIDENT_CONTRACTOR', '2024-05-20');
    expect(contractorNWT.rate).toBe(0.05);
    expect(contractorNWT.ratePercentage).toBe(5);
    expect(contractorNWT.rule.ruleId).toBe('RULE-NWT-SEC55-CONTRACTOR-5');
    expect(contractorNWT.rule.legalReference).toContain('Section 55(a)');
  });

  it('Criteria 7: NWT Section 55(a) general categories resolve to 10%', () => {
    const categories = [
      'ROYALTY',
      'TECHNICAL_SERVICES',
      'RENT_IMMOVABLE_PROPERTY',
      'COMMISSION',
      'INSURANCE_PREMIUM',
      'RESEARCH_DEVELOPMENT'
    ];

    for (const cat of categories) {
      const nwt = resolver.resolveNWTRate(cat, '2024-05-20');
      expect(nwt.rate).toBe(0.10);
      expect(nwt.ratePercentage).toBe(10);
      expect(nwt.rule.ruleId).toBe('RULE-NWT-SEC55-GENERAL-10');
    }
  });

  it('Validates regulatory sources and versions metadata', () => {
    expect(MIRA_REGULATORY_SOURCES.GST_ACT.url).toBeDefined();
    expect(MIRA_REGULATORY_VERSIONS.VERSION_2024_1.versionNumber).toBe('v24.1');
    expect(SEEDED_REGULATORY_RULES.length).toBeGreaterThanOrEqual(8);
  });
});
