import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import {
  ClassificationInput,
  CanonicalLineClassification,
  ClassificationOverridePayload,
  ClassificationApprovalPayload,
  ClassificationValidationResult,
  AccountingClassification,
  GstClassification,
  IncomeTaxClassification,
  NwtClassification,
  AssetClassification,
  MiraReportingClassification,
  HighRiskCategory
} from '../../types/classification';

export class CanonicalClassificationEngine {
  public static readonly REGULATORY_VERSION = 'MIRA-2025.1';

  /**
   * Deterministic Classification Rule Processor.
   * Enforces: "Same input produces deterministic classification."
   */
  public static classifyLine(input: ClassificationInput): CanonicalLineClassification {
    const desc = (input.description || '').toLowerCase().trim();
    const itemCat = (input.itemCategory || '').toLowerCase().trim();
    const supplier = (input.supplierName || '').toLowerCase().trim();
    const fullText = `${desc} ${itemCat} ${supplier} ${(input.rawText || '').toLowerCase()}`.trim();
    const currency = (input.currency || 'MVR').toUpperCase().trim();
    const isForeign = input.isForeignSupplier || (currency !== 'MVR' && currency !== '') || input.supplierCountry === 'FOREIGN';
    const isRelated = input.isRelatedParty === true;
    const amount = Number(input.taxableAmount ?? input.totalAmount ?? 0);

    // -------------------------------------------------------------------------
    // RULE 1: NON-DEDUCTIBLE FINES & PENALTIES
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 18(a)(7)
    // -------------------------------------------------------------------------
    if (
      fullText.includes('fine') ||
      fullText.includes('penalty') ||
      fullText.includes('traffic violation') ||
      fullText.includes('late fee penalty') ||
      fullText.includes('infringement')
    ) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'OUT_OF_SCOPE',
        incomeTaxClassification: 'NON_DEDUCTIBLE_FINE',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'NON_DEDUCTIBLE',
        ruleId: 'MIRA-RULE-ITA-SEC18-FINES',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 18(a)(7)',
        classificationReason: 'Fines and penalties imposed under any law are strictly non-deductible for income tax purposes.',
        confidence: 100,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'NON_DEDUCTIBLE_EXPENSE',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 2: NON-DEDUCTIBLE TAX PAYMENTS
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 18(a)(1)
    // -------------------------------------------------------------------------
    if (
      fullText.includes('income tax payment') ||
      fullText.includes('corporate tax payment') ||
      fullText.includes('bpt payment') ||
      fullText.includes('withholding tax payment to mira')
    ) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'OUT_OF_SCOPE',
        incomeTaxClassification: 'NON_DEDUCTIBLE_TAX_PAYMENT',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'NON_DEDUCTIBLE',
        ruleId: 'MIRA-RULE-ITA-SEC18-TAXES',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 18(a)(1)',
        classificationReason: 'Income tax payable or paid is non-deductible under Section 18.',
        confidence: 100,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'NON_DEDUCTIBLE_EXPENSE',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 3: RELATED PARTY TRANSACTIONS
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Sections 68 & 69
    // -------------------------------------------------------------------------
    if (isRelated) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'GENERAL_INPUT_TAX',
        incomeTaxClassification: 'SPECIAL_TREATMENT',
        nwtClassification: isForeign ? 'NWT_10_TECHNICAL_SERVICES' : 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'SCHEDULE1_RELATED_PARTY',
        ruleId: 'MIRA-RULE-ITA-SEC68-RELATED-PARTY',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 68 & Section 69',
        classificationReason: 'Related party transactions are subject to transfer pricing and Schedule 1 related-party reporting.',
        confidence: 95,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'RELATED_PARTY',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 4: NON-RESIDENT WITHHOLDING TAX (Section 55)
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 55
    // -------------------------------------------------------------------------
    if (isForeign) {
      // 4a. Royalties / Software / IP from non-resident
      if (
        fullText.includes('royalty') ||
        fullText.includes('ip license') ||
        fullText.includes('copyright') ||
        fullText.includes('patent') ||
        fullText.includes('franchise fee')
      ) {
        return {
          accountingClassification: 'EXPENSE',
          gstClassification: 'NO_INPUT_TAX',
          incomeTaxClassification: 'DEDUCTIBLE',
          nwtClassification: 'NWT_10_ROYALTY',
          assetClassification: 'NONE',
          miraReportingClassification: 'SCHEDULE1_OTHER_EXPENSES',
          ruleId: 'MIRA-RULE-ITA-SEC55-ROYALTY',
          regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
          regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 55(a)(2)',
          classificationReason: 'Royalties paid to a non-resident person are subject to 10% Non-Resident Withholding Tax (MIRA 602).',
          confidence: 98,
          source: 'DETERMINISTIC_RULE',
          isHighRisk: true,
          highRiskCategory: 'NWT_APPLICABLE',
          requiresReview: true,
          isApproved: false,
          reviewer: null,
          reviewedAt: null
        };
      }

      // 4b. Technical, consulting, management fees to foreign entity
      if (
        fullText.includes('technical fee') ||
        fullText.includes('consulting') ||
        fullText.includes('management fee') ||
        fullText.includes('software development') ||
        fullText.includes('engineering fee')
      ) {
        return {
          accountingClassification: 'EXPENSE',
          gstClassification: 'NO_INPUT_TAX',
          incomeTaxClassification: 'DEDUCTIBLE',
          nwtClassification: 'NWT_10_TECHNICAL_SERVICES',
          assetClassification: 'NONE',
          miraReportingClassification: 'SCHEDULE1_PROFESSIONAL_FEES',
          ruleId: 'MIRA-RULE-ITA-SEC55-TECHNICAL',
          regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
          regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 55(a)(5)',
          classificationReason: 'Technical services or management fees paid to a non-resident are subject to 10% NWT.',
          confidence: 95,
          source: 'DETERMINISTIC_RULE',
          isHighRisk: true,
          highRiskCategory: 'NWT_APPLICABLE',
          requiresReview: true,
          isApproved: false,
          reviewer: null,
          reviewedAt: null
        };
      }

      // 4c. Non-resident contractor
      if (fullText.includes('contractor') || fullText.includes('subcontractor work')) {
        return {
          accountingClassification: 'EXPENSE',
          gstClassification: 'NO_INPUT_TAX',
          incomeTaxClassification: 'DEDUCTIBLE',
          nwtClassification: 'NWT_5_CONTRACTOR',
          assetClassification: 'NONE',
          miraReportingClassification: 'SCHEDULE1_OTHER_EXPENSES',
          ruleId: 'MIRA-RULE-ITA-SEC55-CONTRACTOR',
          regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
          regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 55(b)',
          classificationReason: 'Payments to non-resident contractors are subject to 5% NWT under Section 55(b).',
          confidence: 95,
          source: 'DETERMINISTIC_RULE',
          isHighRisk: true,
          highRiskCategory: 'NWT_APPLICABLE',
          requiresReview: true,
          isApproved: false,
          reviewer: null,
          reviewedAt: null
        };
      }

      // Generic Foreign Transaction
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'NO_INPUT_TAX',
        incomeTaxClassification: 'DEDUCTIBLE',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'SCHEDULE1_OTHER_EXPENSES',
        ruleId: 'MIRA-RULE-FOREIGN-PURCHASE',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives GST Act & Income Tax Act Foreign Rules',
        classificationReason: 'Foreign transaction requires currency conversion and WHT residency verification.',
        confidence: 85,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'FOREIGN_SUPPLIER',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 5: BLOCKED GST (Entertainment, Passenger Cars, Private Consumption)
    // Regulatory Ref: Maldives Goods and Services Tax Act (Act 10/2011) Section 22(b)
    // -------------------------------------------------------------------------
    if (
      fullText.includes('entertainment') ||
      fullText.includes('vip lounge') ||
      fullText.includes('club membership') ||
      fullText.includes('personal gift') ||
      (fullText.includes('passenger car') && !fullText.includes('rental company'))
    ) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'BLOCKED_INPUT_TAX',
        incomeTaxClassification: 'NON_DEDUCTIBLE_ENTERTAINMENT',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'NON_DEDUCTIBLE',
        ruleId: 'MIRA-RULE-GST-BLOCK-SEC22',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Goods and Services Tax Act (Act 10/2011) Section 22(b)',
        classificationReason: 'Input tax on entertainment, club memberships, or passenger motor vehicles is blocked under GST Act Section 22(b).',
        confidence: 95,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'BLOCKED_GST',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 6: CAPITAL ASSETS & CAPITAL ALLOWANCES (Schedule 2)
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 21 & Schedule 2
    // -------------------------------------------------------------------------
    // 6a. Computer Software & Hardware
    if (
      fullText.includes('laptop') ||
      fullText.includes('macbook') ||
      fullText.includes('computer server') ||
      fullText.includes('desktop pc') ||
      fullText.includes('workstation') ||
      fullText.includes('software license') ||
      fullText.includes('erp system')
    ) {
      return {
        accountingClassification: 'ASSET',
        gstClassification: 'CAPITAL_INPUT_TAX',
        incomeTaxClassification: 'CAPITAL_ALLOWANCE',
        nwtClassification: 'NONE',
        assetClassification: 'COMPUTER_SOFTWARE_HARDWARE',
        miraReportingClassification: 'SCHEDULE2_CAPITAL_ALLOWANCE',
        ruleId: 'MIRA-RULE-ITA-SEC21-COMPUTERS',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Schedule 2 Item 10 (33.33% rate)',
        classificationReason: 'Computer software and hardware are capital assets qualifying for 33.33% Capital Allowance under Schedule 2.',
        confidence: 98,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'CAPITAL_ASSET',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // 6b. Motor Vehicles
    if (
      fullText.includes('motor vehicle') ||
      fullText.includes('pickup truck') ||
      fullText.includes('delivery van') ||
      fullText.includes('motorcycle') ||
      fullText.includes('speedboat') ||
      fullText.includes('vessel')
    ) {
      return {
        accountingClassification: 'ASSET',
        gstClassification: 'CAPITAL_INPUT_TAX',
        incomeTaxClassification: 'CAPITAL_ALLOWANCE',
        nwtClassification: 'NONE',
        assetClassification: 'MOTOR_VEHICLES',
        miraReportingClassification: 'SCHEDULE2_CAPITAL_ALLOWANCE',
        ruleId: 'MIRA-RULE-ITA-SEC21-VEHICLES',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Schedule 2 Item 6 (20% rate)',
        classificationReason: 'Motor vehicles are capital assets qualifying for 20% Capital Allowance under Schedule 2.',
        confidence: 98,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'CAPITAL_ASSET',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // 6c. Plant, Machinery & Commercial Equipment
    if (
      fullText.includes('machinery') ||
      fullText.includes('diesel generator') ||
      fullText.includes('air compressor') ||
      fullText.includes('commercial chiller') ||
      fullText.includes('refrigeration unit') ||
      fullText.includes('espresso machine') ||
      fullText.includes('industrial oven')
    ) {
      return {
        accountingClassification: 'ASSET',
        gstClassification: 'CAPITAL_INPUT_TAX',
        incomeTaxClassification: 'CAPITAL_ALLOWANCE',
        nwtClassification: 'NONE',
        assetClassification: 'PLANT_EQUIPMENT_MACHINERY',
        miraReportingClassification: 'SCHEDULE2_CAPITAL_ALLOWANCE',
        ruleId: 'MIRA-RULE-ITA-SEC21-MACHINERY',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Schedule 2 Item 8 (20% rate)',
        classificationReason: 'Plant and machinery qualify for 20% Capital Allowance under Schedule 2.',
        confidence: 98,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'CAPITAL_ASSET',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // 6d. Furniture & Fittings
    if (
      fullText.includes('office desk') ||
      fullText.includes('ergonomic chair') ||
      fullText.includes('conference table') ||
      fullText.includes('filing cabinet') ||
      fullText.includes('shelving system')
    ) {
      return {
        accountingClassification: 'ASSET',
        gstClassification: 'CAPITAL_INPUT_TAX',
        incomeTaxClassification: 'CAPITAL_ALLOWANCE',
        nwtClassification: 'NONE',
        assetClassification: 'FURNITURE_FITTINGS',
        miraReportingClassification: 'SCHEDULE2_CAPITAL_ALLOWANCE',
        ruleId: 'MIRA-RULE-ITA-SEC21-FURNITURE',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Schedule 2 Item 5 (20% rate)',
        classificationReason: 'Furniture and fittings qualify for 20% Capital Allowance under Schedule 2.',
        confidence: 95,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: true,
        highRiskCategory: 'CAPITAL_ASSET',
        requiresReview: true,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 7: COST OF SALES / INVENTORY / INGREDIENTS
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 11
    // -------------------------------------------------------------------------
    if (
      fullText.includes('coffee beans') ||
      fullText.includes('raw milk') ||
      fullText.includes('sugar') ||
      fullText.includes('flour') ||
      fullText.includes('packaging cups') ||
      fullText.includes('takeaway boxes') ||
      fullText.includes('food ingredients') ||
      fullText.includes('vegetables') ||
      fullText.includes('fish') ||
      fullText.includes('chicken') ||
      fullText.includes('beef') ||
      fullText.includes('local market') ||
      itemCat === 'cost_of_sales' ||
      itemCat === 'inventory'
    ) {
      return {
        accountingClassification: 'COST_OF_SALES',
        gstClassification: 'GENERAL_INPUT_TAX',
        incomeTaxClassification: 'DEDUCTIBLE',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'SCHEDULE1_COST_OF_SALES',
        ruleId: 'MIRA-RULE-ITA-SEC11-COS',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 11(a)',
        classificationReason: 'Cost of goods sold and direct production ingredients incurred in the production of income.',
        confidence: 95,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: false,
        highRiskCategory: 'NONE',
        requiresReview: false,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 8: REPAIRS & MAINTENANCE
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 11
    // -------------------------------------------------------------------------
    if (
      fullText.includes('repair') ||
      fullText.includes('maintenance') ||
      fullText.includes('servicing') ||
      fullText.includes('spare parts') ||
      fullText.includes('ac servicing')
    ) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'GENERAL_INPUT_TAX',
        incomeTaxClassification: 'DEDUCTIBLE',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'SCHEDULE1_REPAIRS_MAINTENANCE',
        ruleId: 'MIRA-RULE-ITA-SEC11-REPAIRS',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 11',
        classificationReason: 'Repairs and maintenance of revenue-generating premises and plant.',
        confidence: 95,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: false,
        highRiskCategory: 'NONE',
        requiresReview: false,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 9: RENTAL & LEASE PAYMENTS
    // Regulatory Ref: Maldives Income Tax Act (Act 25/2019) Section 11
    // -------------------------------------------------------------------------
    if (
      fullText.includes('rent') ||
      fullText.includes('lease payment') ||
      fullText.includes('outlet rent') ||
      fullText.includes('warehouse lease')
    ) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'GENERAL_INPUT_TAX',
        incomeTaxClassification: 'DEDUCTIBLE',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'SCHEDULE1_RENTAL_LEASE',
        ruleId: 'MIRA-RULE-ITA-SEC11-RENT',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 11',
        classificationReason: 'Rental and lease payments for business premises.',
        confidence: 95,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: false,
        highRiskCategory: 'NONE',
        requiresReview: false,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 10: PROFESSIONAL & CONSULTING FEES (Local)
    // -------------------------------------------------------------------------
    if (
      fullText.includes('audit fee') ||
      fullText.includes('legal fee') ||
      fullText.includes('accounting fee') ||
      fullText.includes('consulting') ||
      fullText.includes('advisory')
    ) {
      return {
        accountingClassification: 'EXPENSE',
        gstClassification: 'GENERAL_INPUT_TAX',
        incomeTaxClassification: 'DEDUCTIBLE',
        nwtClassification: 'NONE',
        assetClassification: 'NONE',
        miraReportingClassification: 'SCHEDULE1_PROFESSIONAL_FEES',
        ruleId: 'MIRA-RULE-ITA-SEC11-PROF-FEES',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 11',
        classificationReason: 'Professional and consultancy fees for business operations.',
        confidence: 92,
        source: 'DETERMINISTIC_RULE',
        isHighRisk: false,
        highRiskCategory: 'NONE',
        requiresReview: false,
        isApproved: false,
        reviewer: null,
        reviewedAt: null
      };
    }

    // -------------------------------------------------------------------------
    // RULE 11: STANDARD GENERAL OPERATING EXPENSES (Default Fallback)
    // -------------------------------------------------------------------------
    return {
      accountingClassification: 'EXPENSE',
      gstClassification: 'GENERAL_INPUT_TAX',
      incomeTaxClassification: 'DEDUCTIBLE',
      nwtClassification: 'NONE',
      assetClassification: 'NONE',
      miraReportingClassification: 'SCHEDULE1_OTHER_EXPENSES',
      ruleId: 'MIRA-RULE-ITA-SEC11-OTHER-EXPENSES',
      regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
      regulatoryCitation: 'Maldives Income Tax Act (Act 25/2019) Section 11',
      classificationReason: 'General business operational expenses wholly and exclusively incurred in the production of income.',
      confidence: 90,
      source: 'DETERMINISTIC_RULE',
      isHighRisk: false,
      highRiskCategory: 'NONE',
      requiresReview: false,
      isApproved: false,
      reviewer: null,
      reviewedAt: null
    };
  }

  /**
   * AI/Heuristic Classification Suggestion.
   * Enforces: "AI output must never directly post a transaction. AI suggestions are marked as AI_SUGGESTION."
   */
  public static async suggestClassification(
    input: ClassificationInput
  ): Promise<CanonicalLineClassification> {
    // 1. Run deterministic classification first to form the authoritative baseline
    const deterministic = CanonicalClassificationEngine.classifyLine(input);

    // 2. Wrap as suggestion (lower confidence score if AI suggestion, source = AI_SUGGESTION)
    return {
      ...deterministic,
      source: 'AI_SUGGESTION',
      confidence: Math.min(deterministic.confidence, 85),
      requiresReview: true, // All AI suggestions require review before approval
      isApproved: false
    };
  }

  /**
   * Validates a classification against statutory consistency rules and high-risk constraints.
   */
  public static validateClassification(
    classification: CanonicalLineClassification,
    input?: ClassificationInput
  ): ClassificationValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Rule 1: High-Risk Items cannot be marked as pre-approved without a human reviewer
    if (classification.isHighRisk && classification.isApproved && !classification.reviewer) {
      errors.push(`High-risk classification (${classification.highRiskCategory}) requires an explicit authorized reviewer.`);
    }

    // Rule 2: If Income Tax is CAPITAL_ALLOWANCE, Accounting must be ASSET and assetClassification must not be NONE
    if (classification.incomeTaxClassification === 'CAPITAL_ALLOWANCE') {
      if (classification.accountingClassification !== 'ASSET') {
        errors.push(`Capital Allowance requires accountingClassification to be 'ASSET', but received '${classification.accountingClassification}'.`);
      }
      if (classification.assetClassification === 'NONE') {
        errors.push(`Capital Allowance requires a valid MIRA assetClassification, but received 'NONE'.`);
      }
      if (classification.miraReportingClassification !== 'SCHEDULE2_CAPITAL_ALLOWANCE') {
        warnings.push(`Capital assets should route to Schedule 2 rather than Schedule 1 expense reporting.`);
      }
    }

    // Rule 3: If GST is BLOCKED_INPUT_TAX, Income Tax should not claim full deduction or should be flagged
    if (classification.gstClassification === 'BLOCKED_INPUT_TAX') {
      if (!classification.isHighRisk) {
        errors.push(`Blocked Input Tax transactions must be flagged as high-risk.`);
      }
    }

    // Rule 4: Non-deductible items must route to non-deductible tax reporting
    if (classification.incomeTaxClassification.startsWith('NON_DEDUCTIBLE')) {
      if (classification.miraReportingClassification !== 'NON_DEDUCTIBLE') {
        warnings.push(`Non-deductible item is reported under '${classification.miraReportingClassification}' instead of 'NON_DEDUCTIBLE'.`);
      }
    }

    // Rule 5: Regulatory traceability check
    if (!classification.ruleId || !classification.regulatoryVersion) {
      errors.push(`Classification decision lacks mandatory regulatory traceability (ruleId or regulatoryVersion missing).`);
    }

    const isValid = errors.length === 0;
    const canApprove = isValid && (!classification.isHighRisk || !!classification.reviewer);
    const canPost = canApprove && classification.isApproved;

    return {
      isValid,
      canApprove,
      canPost,
      warnings,
      errors
    };
  }

  /**
   * Approves a classification after accountant review.
   * Enforces: "High-risk classification cannot bypass review."
   */
  public static async approveClassification(
    payload: ClassificationApprovalPayload,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<CanonicalLineClassification> {
    const { tenantId, invoiceId, lineId, lineNumber, approvedBy, comments } = payload;

    if (!approvedBy || !approvedBy.trim()) {
      throw new Error(`Approval Error: An authorized reviewer name is required.`);
    }

    const execute = async (tx: PrismaClient | Prisma.TransactionClient) => {
      // Find invoice line
      const line = lineId
        ? await tx.invoiceLine.findUnique({ where: { id: lineId }, include: { invoice: true } })
        : await tx.invoiceLine.findFirst({
            where: { invoiceId, lineNumber: lineNumber ?? 1 },
            include: { invoice: true }
          });

      if (!line) {
        throw new Error(`Invoice line not found for approval (invoiceId: ${invoiceId}).`);
      }

      // Build classification from line fields
      const currentClassification: CanonicalLineClassification = {
        accountingClassification: (line.accountingClassification as AccountingClassification) || 'EXPENSE',
        gstClassification: (line.gstClassification as GstClassification) || 'GENERAL_INPUT_TAX',
        incomeTaxClassification: (line.incomeTaxClassification as IncomeTaxClassification) || 'DEDUCTIBLE',
        nwtClassification: (line.nwtClassification as NwtClassification) || 'NONE',
        assetClassification: (line.assetClassification as AssetClassification) || 'NONE',
        miraReportingClassification: (line.miraReportingClassification as MiraReportingClassification) || 'SCHEDULE1_OTHER_EXPENSES',
        ruleId: line.ruleId || 'MIRA-RULE-MANUAL-APPROVED',
        regulatoryVersion: line.regulatoryVersion || CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'MIRA Tax Regulations 2025',
        classificationReason: comments || line.classificationReason || 'Approved by accountant',
        confidence: line.confidence ? Number(line.confidence) : 100,
        source: (line.source as any) || 'DETERMINISTIC_RULE',
        isHighRisk: line.requiresReview || false,
        highRiskCategory: line.requiresReview ? 'CAPITAL_ASSET' : 'NONE',
        requiresReview: false,
        isApproved: true,
        reviewer: approvedBy,
        reviewedAt: new Date()
      };

      // Validate
      const validation = CanonicalClassificationEngine.validateClassification(currentClassification);
      if (!validation.isValid) {
        throw new Error(`Cannot approve line due to classification errors: ${validation.errors.join(', ')}`);
      }

      // Update database line record
      await tx.invoiceLine.update({
        where: { id: line.id },
        data: {
          isApproved: true,
          requiresReview: false,
          reviewer: approvedBy,
          reviewedAt: new Date(),
          classificationReason: comments ? `${line.classificationReason || ''} [Approved: ${comments}]` : line.classificationReason
        }
      });

      // Resolve valid user ID for audit log foreign key
      let validUserId: string | null = null;
      if (approvedBy) {
        const existingUser = await tx.user.findFirst({
          where: { OR: [{ id: approvedBy }, { name: approvedBy }, { email: approvedBy }] }
        });
        if (existingUser) {
          validUserId = existingUser.id;
        } else {
          const userKey = `user-${approvedBy.toLowerCase().replace(/[^a-z0-9]/g, '') || 'reviewer'}`;
          const createdUser = await tx.user.upsert({
            where: { id: userKey },
            update: {},
            create: {
              id: userKey,
              tenantId,
              name: approvedBy,
              email: `${userKey}@tenant.local`
            }
          });
          validUserId = createdUser.id;
        }
      }

      // Log Audit Event
      await tx.auditEvent.create({
        data: {
          tenantId,
          action: 'CLASSIFICATION_APPROVED',
          entityType: 'INVOICE_LINE',
          recordId: line.id,
          performedBy: validUserId,
          details: `Line #${line.lineNumber} (${line.description}) approved by ${approvedBy}. Comments: ${comments || 'None'}`
        }
      });

      return currentClassification;
    };

    if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
      return await (db as PrismaClient).$transaction(async tx => execute(tx), { maxWait: 10000, timeout: 20000 });
    } else {
      return await execute(db as Prisma.TransactionClient);
    }
  }

  /**
   * Applies a human manual override to a line's classifications with full audit trail.
   * Enforces: "AI suggestion can be overridden. Override is audited."
   */
  public static async overrideClassification(
    payload: ClassificationOverridePayload,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<CanonicalLineClassification> {
    const { tenantId, invoiceId, lineId, lineNumber, overrideValues, overrideReason, overriddenBy } = payload;

    if (!overriddenBy || !overriddenBy.trim()) {
      throw new Error(`Override Error: Reviewer identity (overriddenBy) is required.`);
    }
    if (!overrideReason || !overrideReason.trim()) {
      throw new Error(`Override Error: An audit reason (overrideReason) is required for classification overrides.`);
    }

    const execute = async (tx: PrismaClient | Prisma.TransactionClient) => {
      const line = lineId
        ? await tx.invoiceLine.findUnique({ where: { id: lineId } })
        : await tx.invoiceLine.findFirst({ where: { invoiceId, lineNumber: lineNumber ?? 1 } });

      if (!line) {
        throw new Error(`Invoice line not found for override.`);
      }

      const previousState = {
        accountingClassification: line.accountingClassification,
        gstClassification: line.gstClassification,
        incomeTaxClassification: line.incomeTaxClassification,
        nwtClassification: line.nwtClassification,
        assetClassification: line.assetClassification,
        miraReportingClassification: line.miraReportingClassification,
        ruleId: line.ruleId,
        source: line.source
      };

      const updatedAccounting = overrideValues.accountingClassification || line.accountingClassification || 'EXPENSE';
      const updatedGst = overrideValues.gstClassification || line.gstClassification || 'GENERAL_INPUT_TAX';
      const updatedIncomeTax = overrideValues.incomeTaxClassification || line.incomeTaxClassification || 'DEDUCTIBLE';
      const updatedNwt = overrideValues.nwtClassification || line.nwtClassification || 'NONE';
      const updatedAsset = overrideValues.assetClassification || line.assetClassification || 'NONE';
      const updatedMira = overrideValues.miraReportingClassification || line.miraReportingClassification || 'SCHEDULE1_OTHER_EXPENSES';

      // Check if override sets or resolves high-risk
      const isHighRisk =
        updatedAccounting === 'ASSET' ||
        updatedGst === 'BLOCKED_INPUT_TAX' ||
        updatedIncomeTax.startsWith('NON_DEDUCTIBLE') ||
        updatedNwt !== 'NONE';

      // Update line in database
      const updatedLine = await tx.invoiceLine.update({
        where: { id: line.id },
        data: {
          accountingClassification: updatedAccounting,
          gstClassification: updatedGst,
          incomeTaxClassification: updatedIncomeTax,
          nwtClassification: updatedNwt,
          assetClassification: updatedAsset,
          miraReportingClassification: updatedMira,
          ruleId: 'MIRA-RULE-HUMAN-OVERRIDE',
          regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
          classificationReason: `Manually overridden by ${overriddenBy}: ${overrideReason}`,
          confidence: new Prisma.Decimal(100),
          source: 'MANUAL_OVERRIDE',
          requiresReview: isHighRisk,
          isApproved: true,
          reviewer: overriddenBy,
          reviewedAt: new Date()
        }
      });

      // Resolve valid user ID for audit log foreign key
      let validUserId: string | null = null;
      if (overriddenBy) {
        const existingUser = await tx.user.findFirst({
          where: { OR: [{ id: overriddenBy }, { name: overriddenBy }, { email: overriddenBy }] }
        });
        if (existingUser) {
          validUserId = existingUser.id;
        } else {
          const userKey = `user-${overriddenBy.toLowerCase().replace(/[^a-z0-9]/g, '') || 'reviewer'}`;
          const createdUser = await tx.user.upsert({
            where: { id: userKey },
            update: {},
            create: {
              id: userKey,
              tenantId,
              name: overriddenBy,
              email: `${userKey}@tenant.local`
            }
          });
          validUserId = createdUser.id;
        }
      }

      // Create Audit Event record
      await tx.auditEvent.create({
        data: {
          tenantId,
          action: 'CLASSIFICATION_OVERRIDDEN',
          entityType: 'INVOICE_LINE',
          recordId: line.id,
          performedBy: validUserId,
          details: `Classification overridden by ${overriddenBy}. Reason: ${overrideReason}`,
          previousState: JSON.stringify(previousState)
        }
      });

      const result: CanonicalLineClassification = {
        accountingClassification: updatedAccounting as AccountingClassification,
        gstClassification: updatedGst as GstClassification,
        incomeTaxClassification: updatedIncomeTax as IncomeTaxClassification,
        nwtClassification: updatedNwt as NwtClassification,
        assetClassification: updatedAsset as AssetClassification,
        miraReportingClassification: updatedMira as MiraReportingClassification,
        ruleId: 'MIRA-RULE-HUMAN-OVERRIDE',
        regulatoryVersion: CanonicalClassificationEngine.REGULATORY_VERSION,
        regulatoryCitation: 'Audited Human Accountant Classification Override',
        classificationReason: `Manually overridden by ${overriddenBy}: ${overrideReason}`,
        confidence: 100,
        source: 'MANUAL_OVERRIDE',
        isHighRisk,
        highRiskCategory: isHighRisk ? 'CAPITAL_ASSET' : 'NONE',
        requiresReview: false,
        isApproved: true,
        reviewer: overriddenBy,
        reviewedAt: new Date()
      };

      return result;
    };

    if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
      return await (db as PrismaClient).$transaction(async tx => execute(tx), { maxWait: 10000, timeout: 20000 });
    } else {
      return await execute(db as Prisma.TransactionClient);
    }
  }
}
