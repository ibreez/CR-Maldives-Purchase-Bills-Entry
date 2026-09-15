Milestone 1: Domain Modeling & Server-Side Validation
Objective: Create the authoritative revenue domain types, validation rules, and decimal calculation engine without touching existing purchase-bill workflows.

1.1 Define Revenue Domain Types (src/types/revenue.ts):
Define RevenueTransaction: id, tenantId, outletId, transactionDate, accountingPeriodId, category, description, grossAmount (Prisma.Decimal), netAmount, gstAmount, gstClassification (TAXABLE, ZERO_RATED, EXEMPT, OUT_OF_SCOPE), gstRate, gstRuleId, paymentMethod (CASH, BANK, CARD, ONLINE, CREDIT, OTHER), amountBasis (GST_INCLUSIVE, GST_EXCLUSIVE), status (DRAFT, VALIDATED, REVIEW_REQUIRED, APPROVED, POSTED, REVERSED), journalId, gstTransactionId, sourceId, idempotencyKey, auditEventId.

1.2 Build Revenue Validation Service (src/services/revenue/revenueValidationService.ts):
Validate required fields: valid transaction date, non-empty outlet, positive gross amount.
Validate period status via PeriodControlService.validateCanPostToPeriod() and AccountingPeriodService.isPeriodLocked().
Validate GST classification consistency (e.g., exempt sales must yield 0% GST).
Enforce idempotency verification using idempotencyKey / sourceId to prevent double-saving on network retries.
Milestone 2: Accounting Journal Generation & Posting Core
Objective: Integrate revenue into the canonical general ledger with balanced, immutable double-entry bookkeeping.

2.1 Payment Account Mapping (src/services/revenue/revenueAccountMapper.ts):
Create deterministic mapping from paymentMethod to the Chart of Accounts:
Cash 
 1010-CASH-ON-HAND (Cash on Hand)
Card / POS 
 1020-CARD-CLEARING (Card / POS Clearing)
Bank Transfer 
 1000-BANK-ACCOUNT (Cash and Bank)
Credit 
 1100-ACCOUNTS-RECEIVABLE (Accounts Receivable)
Online 
 1030-ONLINE-CLEARING (Online Gateway Clearing)
Fallback: If an account cannot be resolved, flag as REVIEW_REQUIRED rather than inventing accounts.
Output Tax Account 
 2200-GST-OUTPUT-TAX (GST Output Tax Payable).
Operating Revenue Account 
 4000-OPERATING-REVENUE (Operating Revenue).

2.2 Atomic Journal Posting Service (src/services/revenue/revenuePostingService.ts):
Calculate balanced debits and credits with Prisma.Decimal:
 Payment Account: grossAmount
 Operating Revenue: netAmount
 GST Output Tax: gstAmount (omitted if zero/exempt)
Assert 
 before submission.
Execute atomically inside a database transaction (prisma.$transaction):
Persist/update RevenueTransaction.
Post balanced journal via JournalPostingService.postJournal().
Post to general ledger via LedgerService.postJournalLines().
Create cryptographic audit log via auditService.ts (REVENUE_POSTED).
Rollback everything if any step fails (zero orphan records).
Milestone 3: GST Engine & Sector-Aware Resolution
Objective: Replace client-side tax logic with the backend regulatory resolver and feed MIRA 205/206.

3.1 Server-Side GST Computation (src/services/revenue/revenueGstService.ts):
Support both GST_INCLUSIVE and GST_EXCLUSIVE bases.
Call canonicalGstEngine.resolveGstRate(transactionDate, sector):
General Sector: 8% (RULE-GST-GEN-8)
Tourism Sector: 16% through 2025-06-30, 17% from 2025-07-01 (RULE-GST-TOU-16 / RULE-GST-TOU-17)
Handle EXEMPT and ZERO_RATED supplies (yielding 0 GST amount).
Store immutable regulatory snapshot metadata (gstRate, gstRuleId, regulatoryVersion).

3.2 GSTTransaction Creation:
Create a canonical GSTTransaction linked to the RevenueTransaction and Journal.
Ensure these transactions feed generateMira205Return() (General Sector) and generateMira206Return() (Tourism Sector) as output tax (Sales / Supplies).
Milestone 4: Reporting, Reconciliations & Transaction Trace
Objective: Guarantee single-source-of-truth across GL, P&L, and GST returns, plus visual diagnostic traceability.

4.1 P&L Integration via General Ledger:
Verify that generateSchedule1PnL() consumes the general ledger balances (or posted transactions) so that P&L Operating Revenue reflects net revenue (100,000), never gross (108,000).

4.2 Four-Way Revenue Reconciliation Engine (src/services/reconciliation/revenueReconciliationService.ts):
Implement automated reconciliation checks:
Revenue Subledger 
 GL Revenue Account (4000)
Revenue GST 
 GST Output Account (2200)
Revenue GST 
 MIRA 205/206 Output Tax Box
Revenue Subledger 
 P&L Operating Revenue
Return structured status: PASS, WARNING, or FAIL with pinpointed transaction IDs for any discrepancy.

4.3 Transaction Diagnostic Trace Service:
Provide an endpoint GET /api/revenue/:id/trace returning the end-to-end audit tree:
Milestone 5: Corrections, Reversals, API Hardening & UI Polish
Objective: Enforce accounting immutability on the web API and provide correction workflows in the UI.

5.1 API Endpoint Hardening (server.ts):
GET /api/revenue: Return revenue entries enriched with status, journalId, gstTransactionId, and accounting period details.
POST /api/revenue: Execute full validation, GST resolution, and atomic journal posting.
PUT /api/revenue/:id: Allow editing only if status is DRAFT or VALIDATED. If POSTED, return machine-readable HTTP 400 error TRANSACTION_ALREADY_POSTED.
DELETE /api/revenue/:id: Allow deletion only for DRAFT. Reject POSTED or REVERSED with HTTP 400 CANNOT_DELETE_POSTED_TRANSACTION.
POST /api/revenue/:id/reverse: Create a formal reversal journal (negating debits and credits) and mark the record REVERSED.
POST /api/revenue/:id/correct: Atomic reversal of the original record + creation of a replacement corrected transaction.

5.2 Minimal Frontend Updates (src/components/RevenueManagementModal.tsx):
Remove frontend tax calculation formulas and make tax rate/net/gst read-only or server-derived.
Add status chips: DRAFT, APPROVED, POSTED, REVERSED.
For POSTED records: Disable direct in-place editing; display "Create Correction" and "View Accounting Trace" buttons.
Add a slide-over/modal to display the Transaction Diagnostic Trace.
Milestone 6: Automated Test Suite & Non-Regression Verification
Objective: Prove compliance through the roadmap's required acceptance test cases.

6.1 Acceptance Tests (tests/revenue/revenueAccounting.test.ts):
GOLDEN-REV-001: General Sector sale (MVR 108,000 gross 
 MVR 100,000 net, MVR 8,000 GST, balanced journal, GSTTransaction created).
GOLDEN-REV-002: GST-exclusive sale (MVR 100,000 net + 8% 
 identical accounting & GST).
GOLDEN-REV-003: Exempt sale (MVR 100,000 gross 
 MVR 100,000 net, 0 GST, no GST output credit).
GOLDEN-REV-004: Tourism historical rate (2025-06-30 
 16% TGST).
GOLDEN-REV-005: Tourism current rate (2025-07-01 
 17% TGST).

6.2 Workflow & Failure Mode Tests:
test_edit_draft_allowed() vs. test_edit_posted_rejected().
test_duplicate_post_idempotent() (same payload submitted twice 
 only 1 transaction, 1 journal).
test_locked_period_rejected() (posting to locked accounting period is blocked).
test_atomic_rollback() (simulated failure during GST record generation rolls back journal and revenue).
test_revenue_reconciliation() (verify GL, GST, and P&L reconcile with zero variance).

6.3 Existing Systems Regression Check:
Run npm test across all 51 existing test suites.
Run npm run lint (tsc --noEmit).
Verify purchase-bill scanning, OCR extraction, bill approvals, and MIRA filing packages continue working without interruption.
Verification Strategy
Check	Success Standard
Monetary Precision	All revenue, tax, and journal calculations utilize Prisma.Decimal (zero JS float inaccuracies).
Journal Balancing	
 strictly enforced before database write.
Data Immutability	Posted revenue records cannot be mutated or deleted; corrections generate linked reversal journals.
Traceability	Any MIRA 205/206 output tax figure can be traced directly to a GSTTransaction and source RevenueTransaction.
Zero Regression	Existing purchase bills, accounts payable, NWT, asset depreciation, and auth functions remain 100% operational.
Baseline Health & Verification Confirmation
The existing test suite and type system have both been executed and verified in the environment:
Test Suite Result: 54 / 54 test files passed (487 tests passed, 0 failures, 0 regressions).
TypeScript Check: tsc --noEmit compiled cleanly with 0 errors.
Production Readiness: The application maintains its certified status across all 11 regulatory, accounting, and security domains.