import { describe, test, expect } from 'vitest';
import { classifyDocument } from '../../src/services/classificationService';

describe('classificationService - Phase 1 Document Classification', () => {

  test('Classifies standard operational expense (STELCO electricity bill)', () => {
    const ocrData = {
      supplierName: 'STELCO',
      rawText: 'Electricity Bill for July 2026',
      amount: 10000,
      gstAmount: 800,
      supplierTin: '1000001GST001'
    };

    const result = classifyDocument(ocrData);

    expect(result.accountingClassification).toBe('EXPENSE');
    expect(result.accountingTreatment).toBe('EXPENSE');
    expect(result.gstTreatment).toBe('STANDARD_RATED');
    expect(result.incomeTaxTreatment).toBe('DEDUCTIBLE');
    expect(result.isCapitalAsset).toBe(false);
  });

  test('Recognizes Capital Asset (MacBook / Laptop) and assigns ASSET and CAPITAL_ALLOWANCE', () => {
    const ocrData = {
      supplierName: 'Personal Computers LLC',
      description: 'MacBook Pro M3 Max 16-inch 36GB RAM',
      fileName: 'macbook_invoice.pdf',
      subtotal: 35000,
      gstAmount: 2800,
      supplierTin: '1000002GST001'
    };

    const result = classifyDocument(ocrData);

    expect(result.accountingClassification).toBe('ASSET');
    expect(result.accountingTreatment).toBe('ASSET');
    expect(result.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(result.gstTreatment).toBe('STANDARD_RATED');
    expect(result.isCapitalAsset).toBe(true);
    expect(result.miraAssetClass).toBe('Computer software & hardware');
    expect(result.miraCategory).toBe('capital_asset_schedule2');
    expect(result.adjustmentCode).toBe('ADJ-CAPITAL');
  });

  test('Recognizes Capital Asset (Delivery Pickup Van) and assigns ASSET and CAPITAL_ALLOWANCE', () => {
    const ocrData = {
      supplierName: 'Mulia Motors',
      description: 'Toyota Hilux Double Cab Pickup Truck',
      subtotal: 450000,
      gstAmount: 36000
    };

    const result = classifyDocument(ocrData);

    expect(result.accountingClassification).toBe('ASSET');
    expect(result.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(result.isCapitalAsset).toBe(true);
    expect(result.miraAssetClass).toBe('Motor vehicles');
  });

  test('Recognizes Capital Asset (Kitchen Oven / Machinery) and assigns ASSET and CAPITAL_ALLOWANCE', () => {
    const ocrData = {
      supplierName: 'Astron Maldives',
      description: 'Commercial Convection Oven & Kitchen Equipment',
      amount: 85000,
      gstAmount: 6800
    };

    const result = classifyDocument(ocrData);

    expect(result.accountingClassification).toBe('ASSET');
    expect(result.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(result.isCapitalAsset).toBe(true);
    expect(result.miraAssetClass).toBe('Plant & equipment / Machinery');
  });

  test('Classifies statutory fines as NON_DEDUCTIBLE with OUT_OF_SCOPE GST', () => {
    const ocrData = {
      supplierName: 'MIRA',
      description: 'Late Filing Penalty Notice for GST Return',
      amount: 5000,
      gstAmount: 0
    };

    const result = classifyDocument(ocrData);

    expect(result.accountingClassification).toBe('EXPENSE');
    expect(result.incomeTaxTreatment).toBe('NON_DEDUCTIBLE');
    expect(result.gstTreatment).toBe('OUT_OF_SCOPE');
    expect(result.adjustmentCode).toBe('ADJ-FINES');
    expect(result.reviewStatus).toBe('NEEDS_REVIEW');
  });

  test('Classifies rent invoice with EXEMPT GST treatment and DEDUCTIBLE income tax treatment', () => {
    const ocrData = {
      supplierName: 'City Office Properties',
      description: 'Monthly Premises Rent - Shop 4',
      subtotal: 40000,
      gstAmount: 0
    };

    const result = classifyDocument(ocrData);

    expect(result.accountingClassification).toBe('EXPENSE');
    expect(result.gstTreatment).toBe('EXEMPT');
    expect(result.incomeTaxTreatment).toBe('DEDUCTIBLE');
    expect(result.isCapitalAsset).toBe(false);
  });

});
