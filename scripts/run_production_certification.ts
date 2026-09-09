/**
 * Phase 51 — Run Production Certification CLI Script
 * 
 * Executes full production audit and writes PRODUCTION_READINESS_REPORT.md
 */

import fs from 'fs';
import path from 'path';
import { ProductionCertificationService } from '../src/services/certification/productionCertificationService';

export function runProductionCertification(outputPath?: string): string {
  console.log('Running complete production-readiness audit (Phase 51)...');
  const result = ProductionCertificationService.runProductionAudit();

  console.log(`Audited ${result.totalChecks} items across all 11 domains.`);
  console.log(`Passed: ${result.passCount}, Failed: ${result.failCount}, Warnings: ${result.warningCount}`);
  console.log(`Critical Items Passed: ${result.criticalPassCount} / ${result.criticalPassCount + result.criticalFailCount}`);
  console.log(`Verdict: ${result.readinessVerdict}`);

  const report = ProductionCertificationService.generateProductionReadinessReport(result);
  const targetPath = outputPath || path.join(process.cwd(), 'PRODUCTION_READINESS_REPORT.md');

  fs.writeFileSync(targetPath, report, 'utf-8');
  console.log(`Successfully generated production readiness report at: ${targetPath}`);

  return targetPath;
}

if (process.argv[1]?.endsWith('run_production_certification.ts')) {
  runProductionCertification();
}
