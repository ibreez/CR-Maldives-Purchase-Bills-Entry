import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { processDocument, ClassificationInput, ClassificationOutput } from '../../src/services/classificationEngine';

interface FixtureSchema {
  fixtureId: string;
  description: string;
  sourceDocument: {
    fileName: string;
    supplierName: string;
    supplierTin?: string;
    invoiceNumber?: string;
    issueDate: string;
    currency?: string;
  };
  expectedExtraction: {
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    gstRate?: number;
  };
  expectedAssertions: Partial<ClassificationOutput> & {
    documentType: string;
    accountingCategory: string;
    subcategory: string;
    gstTreatment: string;
    miraCategory: string;
    incomeTaxTreatment: string;
    reviewRequired: boolean;
  };
}

describe('Maldivian Tax & Accounting Engine - Phase 0.3 Regression Suite', () => {
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  const indexFilePath = path.join(fixturesDir, 'index.json');

  let fixtureFiles: string[] = [];

  if (fs.existsSync(indexFilePath)) {
    fixtureFiles = JSON.parse(fs.readFileSync(indexFilePath, 'utf-8'));
  } else {
    fixtureFiles = fs
      .readdirSync(fixturesDir)
      .filter((file) => file.endsWith('.json') && file !== 'fixture.schema.json');
  }

  expect(fixtureFiles.length).toBeGreaterThan(0);

  fixtureFiles.forEach((file) => {
    const filePath = path.join(fixturesDir, file);
    if (!fs.existsSync(filePath)) return;

    const fixture: FixtureSchema = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    test(`Fixture Regression: ${fixture.fixtureId} - ${fixture.description}`, () => {
      // 1. Prepare input payload for OCR/Classification pipeline
      const inputPayload: ClassificationInput = {
        fileName: fixture.sourceDocument.fileName,
        supplierName: fixture.sourceDocument.supplierName,
        supplierTin: fixture.sourceDocument.supplierTin,
        invoiceNumber: fixture.sourceDocument.invoiceNumber,
        issueDate: fixture.sourceDocument.issueDate,
        currency: fixture.sourceDocument.currency,
        subtotal: fixture.expectedExtraction.subtotal,
        gstAmount: fixture.expectedExtraction.gstAmount,
        totalAmount: fixture.expectedExtraction.totalAmount,
        gstRate: fixture.expectedExtraction.gstRate
      };

      // 2. Execute processDocument pipeline
      const actualOutput = processDocument(inputPayload);

      // 3. Strict field assertion checking with detailed failure logging
      const expected = fixture.expectedAssertions;

      const failures: string[] = [];

      if (actualOutput.documentType !== expected.documentType) {
        failures.push(`documentType: Expected '${expected.documentType}', Got '${actualOutput.documentType}'`);
      }
      if (actualOutput.accountingCategory !== expected.accountingCategory) {
        failures.push(`accountingCategory: Expected '${expected.accountingCategory}', Got '${actualOutput.accountingCategory}'`);
      }
      if (actualOutput.subcategory !== expected.subcategory) {
        failures.push(`subcategory: Expected '${expected.subcategory}', Got '${actualOutput.subcategory}'`);
      }
      if (actualOutput.gstTreatment !== expected.gstTreatment) {
        failures.push(`gstTreatment: Expected '${expected.gstTreatment}', Got '${actualOutput.gstTreatment}'`);
      }
      if (actualOutput.miraCategory !== expected.miraCategory) {
        failures.push(`miraCategory: Expected '${expected.miraCategory}', Got '${actualOutput.miraCategory}'`);
      }
      if (actualOutput.incomeTaxTreatment !== expected.incomeTaxTreatment) {
        failures.push(`incomeTaxTreatment: Expected '${expected.incomeTaxTreatment}', Got '${actualOutput.incomeTaxTreatment}'`);
      }
      if (actualOutput.reviewRequired !== expected.reviewRequired) {
        failures.push(`reviewRequired: Expected '${expected.reviewRequired}', Got '${actualOutput.reviewRequired}'`);
      }
      if (expected.adjustmentCode && actualOutput.adjustmentCode !== expected.adjustmentCode) {
        failures.push(`adjustmentCode: Expected '${expected.adjustmentCode}', Got '${actualOutput.adjustmentCode}'`);
      }
      if (expected.miraAssetClass && actualOutput.miraAssetClass !== expected.miraAssetClass) {
        failures.push(`miraAssetClass: Expected '${expected.miraAssetClass}', Got '${actualOutput.miraAssetClass}'`);
      }

      if (failures.length > 0) {
        console.error(`\n❌ REGRESSION FAILURE IN FIXTURE [${fixture.fixtureId}] (${file}):\n` + failures.join('\n'));
      }

      expect(failures).toEqual([]);

      // Full deep check assertion
      expect(actualOutput).toMatchObject({
        documentType: expected.documentType,
        accountingCategory: expected.accountingCategory,
        subcategory: expected.subcategory,
        gstTreatment: expected.gstTreatment,
        miraCategory: expected.miraCategory,
        incomeTaxTreatment: expected.incomeTaxTreatment,
        reviewRequired: expected.reviewRequired
      });
    });
  });
});
