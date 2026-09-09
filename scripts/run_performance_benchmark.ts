#!/usr/bin/env tsx
/**
 * Phase 48 — High-Volume Performance Benchmark CLI Runner
 *
 * Runs statutory benchmarks across:
 * - 10,000 invoices
 * - 100,000 invoice lines
 * - 1,000,000 journal lines
 * - Multiple tenants (Retail, Resort, Logistics)
 * - Multiple tax years (2024, 2025, 2026)
 *
 * Enforces:
 * - Do NOT optimize business rules
 * - Only optimize after proving the bottleneck
 * - Do NOT change calculation results
 */

import { PerformanceBenchmarkEngine, BenchmarkConfig } from '../src/infrastructure/performanceBenchmark.js';

async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes('--quick');

  console.log('='.repeat(80));
  console.log('   MIRA STATUTORY SYSTEM — HIGH-VOLUME PERFORMANCE BENCHMARK (PHASE 48)   ');
  console.log('='.repeat(80));

  const config: BenchmarkConfig = isQuick
    ? {
        invoiceCount: 1000,
        linesPerInvoice: 10,
        journalLineCount: 100000
      }
    : {
        invoiceCount: 10000,
        linesPerInvoice: 10,
        journalLineCount: 1000000
      };

  console.log(`Mode:               ${isQuick ? 'QUICK BENCHMARK' : 'FULL 1,000,000 LINES BENCHMARK'}`);
  console.log(`Invoices:           ${config.invoiceCount?.toLocaleString()}`);
  console.log(`Invoice Lines:      ${((config.invoiceCount || 0) * (config.linesPerInvoice || 10)).toLocaleString()}`);
  console.log(`Journal Lines:      ${config.journalLineCount?.toLocaleString()}`);
  console.log(`Tenants:            3 (Retail, Resort, Logistics)`);
  console.log(`Tax Years:          2024, 2025, 2026`);
  console.log('-'.repeat(80));
  console.log('Starting benchmark suite execution...\n');

  const report = await PerformanceBenchmarkEngine.runBenchmark(config);

  console.log('OPERATIONAL MEASUREMENTS');
  console.log('-'.repeat(80));
  console.log(
    'Operation'.padEnd(28) +
    'Items'.padStart(10) +
    'Duration'.padStart(12) +
    'Throughput'.padStart(14) +
    'P95 (ms)'.padStart(12)
  );
  console.log('-'.repeat(80));

  for (const [opName, op] of Object.entries(report.operations)) {
    console.log(
      opName.padEnd(28) +
      op.itemCount.toLocaleString().padStart(10) +
      `${op.totalDurationMs} ms`.padStart(12) +
      `${op.throughputPerSecond.toLocaleString()}/s`.padStart(14) +
      `${op.latency.p95Ms} ms`.padStart(12)
    );
  }

  console.log('-'.repeat(80));
  console.log(`Total Suite Duration: ${report.totalDurationMs.toLocaleString()} ms`);
  console.log(`Calculation Results Verified Identical: ${report.calculationIdentityVerified ? 'YES (100% IDENTICAL)' : 'NO'}`);
  console.log('='.repeat(80));

  console.log('\nIDENTIFIED BOTTLENECKS & PROVED OPTIMIZATIONS');
  console.log('-'.repeat(80));
  for (const b of report.bottlenecks) {
    console.log(`[${b.id}] [${b.type}] ${b.title}`);
    console.log(`  Severity:       ${b.severity}`);
    console.log(`  Location:       ${b.location}`);
    console.log(`  Evidence:       ${b.evidence.baselineValue}`);
    console.log(`  Recommendation: ${b.recommendation}`);
    if (b.optimizationResult) {
      console.log(`  Proved Gain:    ${b.optimizationResult.improvementFactor} (${b.optimizationResult.optimizedValue})`);
      console.log(`  Result Check:   ${b.optimizationResult.calculationIdentityVerified ? 'PASSED - Strict Mathematical Identity' : 'FAILED'}`);
    }
    console.log();
  }
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
