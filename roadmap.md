PHASE 52 — REVENUE / SALES + ACCOUNTING INTEGRATION
Objective

Connect the existing Revenue/Sales functionality to the authoritative accounting, GST, reporting, reconciliation and audit layers.

Current problem

The application can currently record revenue information through the Revenue Management UI, but revenue is not yet reliably functioning as part of the accounting system.

Revenue must not remain an isolated CRUD record.

The target flow is:

REVENUE / SALES ENTRY
        │
        ▼
VALIDATION
        │
        ▼
CLASSIFICATION
        │
        ├──────────────► GST TRANSACTION
        │
        ▼
ACCOUNTING JOURNAL
        │
        ▼
GENERAL LEDGER
        │
        ├──────────────► TRIAL BALANCE
        │
        ├──────────────► P&L
        │
        └──────────────► BALANCE SHEET
        │
        ▼
GST RETURN / RECONCILIATION
        │
        ▼
INCOME TAX ENGINE
        │
        ▼
MIRA REPORTING

Do not rewrite the existing application.

Do not replace working purchase-bill functionality.

Do not redesign the entire UI.

Implement the smallest set of changes necessary to make Revenue/Sales a genuine accounting transaction source.

1. Mandatory AI Studio operating rules

Before modifying code:

Inspect the existing repository.
Inspect the current Revenue Management implementation.
Inspect all existing accounting services.
Inspect GST services.
Inspect P&L services.
Inspect persistence/database implementation.
Inspect existing tests.
Identify existing API contracts.
Identify duplicate or conflicting revenue/accounting logic.
Explain the proposed implementation before changing files.

After implementation:

Run existing tests.
Run new Phase 52 tests.
Run TypeScript checks.
Run the production build.
Report every modified file.
Report every new file.
Report tests passed/failed.
Report unresolved integration problems.
Do not hide failing tests.

These requirements follow the roadmap's permanent AI Studio rules.

2. First inspect these areas

AI Studio must inspect, at minimum:

src/components/RevenueManagementModal.tsx

src/services/accounting/
src/services/gst/
src/services/tax/
src/services/reports/
src/services/audit/
src/services/db/
src/types/
src/config/

server.ts

prisma/
data/

tests/

Also search the entire repository for:

revenue
sales
gross_amount
gst_collected
net_revenue
payment_method
journal
journalLine
ledger
GSTTransaction
pnl
accounting
/api/revenue

Do not assume the existing names represent the target architecture.

3. Define the Revenue/Sales domain model

Create or adapt the existing model rather than creating duplicate concepts.

A revenue transaction should conceptually contain:

RevenueTransaction

id
tenantId
outletId

transactionDate
accountingPeriodId

category
description

grossAmount
netAmount
gstAmount

gstClassification
gstRate
gstRuleId
gstRegulatoryVersion

paymentMethod
customerReference

currency
fxRate
mvrAmount

status

sourceType
sourceId

journalId
gstTransactionId

createdBy
createdAt
updatedAt

Use the existing project's naming conventions if equivalent entities already exist.

Do not create duplicate tables merely because the existing name differs.

The roadmap explicitly establishes a target accounting model based around Journal, JournalLine, LedgerPosting, TrialBalance, and GST transactions.

4. Revenue lifecycle

Implement the following lifecycle:

DRAFT
   ↓
VALIDATED
   ↓
REVIEW_REQUIRED
   ↓
APPROVED
   ↓
POSTED

Possible terminal state:

REVERSED

Rules:

DRAFT

Can be edited.

VALIDATED

Passed structural and accounting validation.

REVIEW_REQUIRED

Requires human intervention.

Examples:

invalid GST classification
unusual GST treatment
missing account mapping
foreign currency without approved FX rate
closed period
invalid outlet
manually overridden tax treatment
APPROVED

Authorized person has approved the transaction.

POSTED

Accounting journal and related tax records have been committed.

Once POSTED:

Do not edit or delete the financial transaction.

The roadmap requires posted journals to be immutable and corrections to use reversal journals.

5. Accounting journal generation

This is the most important part of Phase 52.

For a simple GST-inclusive sale:

Gross sales       MVR 108,000
GST               MVR   8,000
Net sales         MVR 100,000

The accounting result should conceptually be:

DR  Cash / Bank / Card Clearing       108,000

CR  Sales Revenue                     100,000

CR  GST Output Tax                      8,000

The exact account IDs must come from the existing chart of accounts.

Do not hard-code account IDs.

Create a deterministic service such as:

createRevenueJournal()

or adapt the existing canonical journal service.

It must produce:

Journal
 ├── JournalLine
 ├── JournalLine
 └── JournalLine

with:

totalDebit === totalCredit

before posting.

6. Cash / payment-method mapping

Do not simply post every revenue transaction to a generic Cash account.

Create deterministic payment-account mapping.

Example:

CASH
    → Cash account

BANK
    → Bank account

CARD
    → Card clearing account

ONLINE
    → Online payment clearing account

OTHER
    → configured account

The exact account mapping should come from configuration/chart-of-accounts data.

If an account cannot be resolved:

REVIEW_REQUIRED

Do not invent an account.

7. GST calculation

The frontend must not be authoritative for GST.

The current Revenue UI performs GST/net calculations in JavaScript. Replace that as the source of truth with backend/domain calculation.

The flow should be:

Revenue Input
     ↓
GST classification
     ↓
Regulatory rule resolver
     ↓
GST calculation
     ↓
Revenue journal
     ↓
GSTTransaction

All financial calculations must use Decimal-safe arithmetic, consistent with the roadmap's accounting requirement.

8. Gross versus net revenue

The backend must explicitly know whether the entered amount is:

GST_INCLUSIVE

or

GST_EXCLUSIVE

Do not infer this ambiguously.

For example:

amountBasis = GST_INCLUSIVE

Then the backend determines:

gross
gst
net

If:

amountBasis = GST_EXCLUSIVE

the backend determines:

net
gst
gross

The resulting values must be stored.

Do not repeatedly recalculate historical transactions using whatever GST rate happens to be current today.

9. GST classification

Every revenue transaction must have a GST classification.

At minimum support the classifications already established by the GST architecture:

TAXABLE
ZERO_RATED
EXEMPT
OUT_OF_SCOPE

The roadmap specifically requires these GST classifications and versioned rate resolution.

The transaction must preserve:

gstClassification
gstRate
ruleId
regulatoryVersion

so historical transactions remain reproducible.

10. Sector-aware GST

Revenue GST must use the taxpayer/outlet sector.

Do not simply use:

GST_RATE = 0.08

or:

GST_RATE = 0.17

The roadmap requires effective-dated regulatory resolution and currently distinguishes:

General sector:
8%

Tourism:
16% through 2025-06-30
17% from 2025-07-01

with historical rules retained.

Therefore:

resolveGstRule(
    transactionDate,
    taxpayer,
    sector
)

must determine the applicable rule.

If the rule cannot be determined:

REVIEW_REQUIRED
11. GST transaction creation

Every POSTED taxable revenue transaction must create a corresponding:

GSTTransaction

containing enough information to trace:

GSTTransaction
    ↓
RevenueTransaction
    ↓
Journal
    ↓
JournalLine

The reverse direction must also be possible:

MIRA GST box
    ↓
GSTTransaction
    ↓
RevenueTransaction
    ↓
source document

This is necessary for reconciliation and filing traceability.

The roadmap requires GST return totals to reconcile back to source transactions and the GL.

12. Revenue → P&L integration

Revenue must appear in the existing P&L through the ledger.

Do not create a second P&L calculation based directly on revenue.json.

The authoritative path is:

Revenue
   ↓
Journal
   ↓
Ledger
   ↓
P&L

Therefore:

P&L Revenue

must equal the appropriate revenue accounts in the GL.

This prevents:

Revenue screen = MVR X

P&L = MVR Y

GST return = MVR Z

from becoming three independent numbers.

There should be one accounting source of truth.

13. Revenue → Income Tax

Do not calculate income tax directly inside Revenue Management.

Instead:

Revenue
   ↓
GL
   ↓
P&L
   ↓
Income Tax Engine

The income-tax engine should consume the authoritative accounting result.

This is particularly important because the roadmap defines income tax around:

TaxAdjustment
TaxLossLot
TaxLossUtilisation
TaxCalculation
TaxCalculationLine
TaxCredit
TaxPrepayment

rather than a direct revenue calculation.

Phase 52 should therefore enable income-tax integration rather than duplicate the income-tax engine.

14. Reconciliation requirements

Add revenue-related reconciliation checks.

At minimum:

Revenue Subledger ↔ GL Revenue
GST Transactions ↔ GL GST Output
Revenue ↔ GST Return
Revenue ↔ P&L

Each reconciliation must return:

PASS
WARNING
FAIL

The roadmap's reconciliation framework requires differences to identify the underlying transactions.

Example:

Revenue GL reconciliation

Expected: 1,080,000
Actual:   1,080,000
Difference: 0

PASS

If one transaction is missing:

Expected: 1,080,000
Actual:   972,000
Difference: 108,000

FAIL

Affected transaction:
REV-000123
15. Editing revenue

This directly addresses the user's current inability to update revenue.

Before posting

Allow:

PUT /api/revenue/:id

or the existing equivalent.

The update must validate:

period status
transaction status
permissions
GST calculation
accounting classification
After posting

Do not update the journal in place.

Instead:

Original:
REV-000123
POSTED
108,000

Correction:
REV-000123-REV
REVERSAL
-108,000

Replacement:
REV-000123-CORR
POSTED
120,000

The original remains untouched.

This conforms to the roadmap's immutable-journal and reversal model.

16. Delete revenue

Implement these rules:

DRAFT
→ may delete

VALIDATED
→ may delete according to permission

APPROVED
→ no ordinary delete

POSTED
→ NEVER DELETE

REVERSED
→ NEVER DELETE

A posted transaction is corrected through reversal.

17. Period controls

Before posting revenue:

resolveAccountingPeriod(transactionDate)

Then verify:

period.status

If:

OPEN

posting may proceed.

If:

REVIEW
APPROVED
LOCKED
AMENDED

follow the existing period-control workflow.

In particular:

LOCKED
→ reject normal posting

The roadmap explicitly requires locked periods to reject new postings and amendments to use a controlled workflow.

18. Idempotency / duplicate protection

This is essential.

If the user presses Save twice, or the browser retries an API request, the application must not create:

2 revenue records
2 journals
2 GST transactions

for one logical transaction.

Implement an idempotency mechanism using an appropriate combination of:

sourceId
requestId / idempotencyKey
tenantId

and database uniqueness constraints where appropriate.

Acceptance test:

POST same transaction twice

Expected:
1 RevenueTransaction
1 Journal
1 GSTTransaction
19. Atomic posting

Revenue posting must be transactional.

Conceptually:

BEGIN TRANSACTION

create/update RevenueTransaction

create Journal

create JournalLines

post Ledger

create GSTTransaction

create audit event

COMMIT

If anything fails:

ROLLBACK EVERYTHING

Never allow:

Revenue exists
but Journal does not

or

Journal exists
but GSTTransaction does not

The roadmap explicitly requires journal posting to be atomic and database rollback to be tested.

20. Audit trail

Posting revenue must create an immutable audit event.

At minimum:

eventType:
REVENUE_CREATED
REVENUE_UPDATED
REVENUE_APPROVED
REVENUE_POSTED
REVENUE_REVERSED

Include:

tenantId
actorId
timestamp
entityType
entityId
beforeHash
afterHash
metadata
reason
correlationId

The roadmap specifies these audit fields and requires financial mutations to generate audit events.

21. API contract

First inspect the existing API.

The existing Revenue UI already expects operations conceptually equivalent to:

GET    /api/revenue
POST   /api/revenue
PUT    /api/revenue/:id
DELETE /api/revenue/:id

Do not change these contracts unnecessarily.

Instead, make their backend behavior correct.

GET

Return revenue records with status and integration state.

Example:

{
  "id": "REV-001",
  "date": "2026-08-31",
  "category": "SALES",
  "grossAmount": "108000.00",
  "netAmount": "100000.00",
  "gstAmount": "8000.00",
  "status": "POSTED",
  "journalId": "JRN-001",
  "gstTransactionId": "GST-001"
}

Use the project's existing response conventions rather than blindly adopting this exact JSON shape.

22. API error behavior

Do not return generic:

500 Internal Server Error

for every business failure.

Return useful machine-readable errors.

Examples:

PERIOD_LOCKED

UNBALANCED_JOURNAL

INVALID_GST_CLASSIFICATION

GST_RULE_NOT_FOUND

ACCOUNT_MAPPING_MISSING

TRANSACTION_ALREADY_POSTED

TRANSACTION_NOT_FOUND

DUPLICATE_TRANSACTION

APPROVAL_REQUIRED

PERMISSION_DENIED

The frontend can then display meaningful messages.

23. Frontend requirements

Keep the existing Revenue Management UI unless changes are required.

Add only the minimum UI necessary to expose the new state.

For example:

Status
------
DRAFT
APPROVED
POSTED
REVERSED

and:

Accounting:
Journal JRN-001

GST:
GST-001

Period:
August 2026


For a posted record, show:

Edit

as disabled or replace it with:

Create Correction

Do not allow the frontend to mutate posted accounting data directly.

24. Transaction Trace

This phase should introduce a very small but extremely valuable diagnostic capability.

For each revenue transaction provide:

Revenue
   ↓
Classification
   ↓
GST Transaction
   ↓
Journal
   ↓
Ledger Posting
   ↓
P&L

Example:

REV-001
MVR 108,000
        │
        ├── Net sales: MVR 100,000
        ├── GST:       MVR   8,000
        │
        ▼
GST-001
        │
        ▼
JRN-001
        ├── DR Bank       108,000
        ├── CR Sales      100,000
        └── CR GST          8,000
        │
        ▼
GL
        │
        ▼
P&L

This will make the MIRA 205/206 and income-tax problems dramatically easier to diagnose.

25. MIRA 205 / 206 integration

Do not rewrite the existing MIRA 205/206 generators if they already exist.

Instead, make sure revenue transactions feed the canonical GST engine that those generators consume.

The roadmap specifically defines MIRA 205 as the General Sector GST Return and MIRA 206 as the Tourism Sector GST Return.

The target is:

Revenue
   ↓
GSTTransaction
   ↓
GSTPeriod
   ↓
GSTCalculation
   ↓
MIRA205 / MIRA206

Do not create a separate:

Revenue → MIRA205

shortcut.

That would recreate the architecture problem this phase is intended to fix.

26. Acceptance test: simple general-sector sale

Create:

GOLDEN-REV-001

Input:

Sector: General
Date: valid general GST period

Gross: MVR 108,000
GST-inclusive: Yes
GST: 8%

Expected:

Net = 100,000
GST = 8,000
Gross = 108,000

Journal:

DR Cash/Bank             108,000
CR Sales Revenue         100,000
CR GST Output Tax          8,000

Assertions:

Debit = Credit

Revenue GL = 100,000
GST output = 8,000

GSTTransaction exists

P&L revenue = 100,000

GST return receives 8,000

Transaction trace is complete
27. Acceptance test: GST-exclusive sale

Create:

GOLDEN-REV-002

Example:

Net sale: MVR 100,000
GST: 8%

Expected:

Net = 100,000
GST = 8,000
Gross = 108,000

Verify accounting and GST are identical to the corresponding inclusive calculation.

28. Acceptance test: exempt sale

Create:

GOLDEN-REV-003

Expected:

GST = 0

Journal:

DR Cash/Bank             gross

CR Sales Revenue         gross

No output GST should be created.

This corresponds to the GST engine's requirement that exempt transactions create no output GST.

29. Acceptance test: tourism rate change

Create two transactions:

GOLDEN-REV-004
Date: 2025-06-30
Sector: Tourism

GOLDEN-REV-005
Date: 2025-07-01
Sector: Tourism

Verify that the historical transaction resolves to the historical rate and the later transaction resolves to the new rate.

The roadmap explicitly requires these effective-date tests.

30. Acceptance test: edit before posting
Create revenue
→ DRAFT

Change amount
→ save

Verify:
only one revenue transaction exists
no posted journal exists
no posted GST transaction exists
31. Acceptance test: edit after posting
Create
→ Approve
→ Post

Attempt PUT

Expected:

REJECTED

TRANSACTION_ALREADY_POSTED

Then:

Create correction
→ reversal
→ replacement transaction

Verify:

original journal unchanged
reversal balances
replacement balances
audit trail complete
32. Acceptance test: duplicate POST
POST revenue
POST same request again

Expected:

one revenue transaction
one journal
one GST transaction
one accounting posting
33. Acceptance test: locked period

Create a revenue transaction dated inside a locked period.

Expected:

posting rejected
no journal created
no GST transaction created
no partial accounting mutation
34. Acceptance test: rollback

Force an error during GST transaction creation after the journal has been constructed.

Expected:

RevenueTransaction = rolled back
Journal = rolled back
JournalLines = rolled back
LedgerPosting = rolled back
GSTTransaction = rolled back

No orphan records.

35. Acceptance test: P&L

Create:

10 sales × MVR 10,800 gross

Expected:

Gross sales = MVR 108,000
Net revenue = MVR 100,000
GST = MVR 8,000

Verify the P&L gets:

Revenue = MVR 100,000

—not MVR 108,000.

36. Acceptance test: reconciliation

After posting:

Revenue ↔ GL
Revenue ↔ GST
Revenue ↔ P&L

must all return:

PASS

Then deliberately corrupt or omit one posting in a test fixture.

Expected:

FAIL

with the affected transaction identified.

37. Database requirements

If PostgreSQL/Prisma is already present, use the existing schema architecture.

Do not introduce a parallel:

revenue.json

source of truth for posted financial transactions.

The roadmap's target architecture places accounting, GST, tax and compliance entities in the database model.

If migration from existing JSON revenue data is required:

JSON revenue
     ↓
migration
     ↓
RevenueTransaction
     ↓
validation
     ↓
accounting integration

Do not silently invent journals for historical data if insufficient information exists.

Instead mark such records:

MIGRATION_REVIEW_REQUIRED
38. Existing-data compatibility

This phase must not break existing purchase-bill functionality.

Run:

npm test
npm run build

or the project's actual equivalents.

Specifically verify:

Purchase entry
OCR
Bill review
GST Excel export
GST calculations
Existing accounting tests
Existing tax tests

before declaring Phase 52 complete.

39. Files AI Studio should probably create/adapt

Do not create all of these automatically.

First inspect the repository and reuse existing services.

Potential target structure:

src/services/revenue/
    revenueService.ts
    revenueValidationService.ts
    revenuePostingService.ts
    revenueClassificationService.ts

src/services/accounting/
    journalPostingService.ts
    ledgerService.ts

src/services/gst/
    gstService.ts

src/services/reconciliation/
    reconciliationService.ts

tests/revenue/
    revenueAccounting.test.ts
    revenueGst.test.ts
    revenuePosting.test.ts
    revenueReversal.test.ts
    revenueReconciliation.test.ts

If equivalent services already exist, extend them instead.

40. Phase 52 definition of DONE

Phase 52 is NOT DONE merely because:

Revenue screen saves a record.

It is DONE only when this works:

CREATE SALE
      ↓
VALIDATE
      ↓
CLASSIFY
      ↓
CALCULATE GST
      ↓
APPROVE
      ↓
POST
      ↓
JOURNAL
      ↓
LEDGER
      ↓
P&L
      ↓
GST TRANSACTION
      ↓
MIRA 205/206 INPUT
      ↓
RECONCILIATION
      ↓
AUDIT TRAIL

And this must also work:

POSTED SALE
      ↓
CORRECTION
      ↓
REVERSAL
      ↓
REPLACEMENT

without modifying the original posted journal.

41. Phase 52 acceptance checklist

AI Studio must produce a report with:

Test	Required
Revenue creates transaction	PASS
Revenue can be edited while draft	PASS
Posted revenue cannot be edited	PASS
Posted revenue cannot be deleted	PASS
Reversal works	PASS
Journal balances	PASS
Decimal arithmetic	PASS
Duplicate posting prevented	PASS
Payment account resolved	PASS
GST calculated backend-side	PASS
GST transaction created	PASS
General GST works	PASS
Tourism historical rate works	PASS
Tourism current rate works	PASS
Exempt revenue works	PASS
P&L receives revenue	PASS
GST reconciliation works	PASS
GL reconciliation works	PASS
Period lock works	PASS
Audit event generated	PASS
Transaction trace works	PASS
Existing purchase tests pass	PASS
Existing GST tests pass	PASS
Build passes	PASS

Any critical failure means:

PHASE 52 = FAIL

—not “mostly complete.”

42. The actual Google AI Studio prompt

I recommend giving AI Studio the phase in smaller execution prompts, rather than pasting the whole specification and asking it to implement everything in one shot.

Prompt 1 — Architecture inspection

PHASE 52 — REVENUE / SALES + ACCOUNTING INTEGRATION
STEP 1 — ARCHITECTURE INSPECTION

You are modifying an existing production-oriented Maldives Tax & Accounting application.

DO NOT rewrite the application.
DO NOT modify unrelated functionality.
DO NOT change the UI yet.
DO NOT implement anything yet.

The objective of Phase 52 is to make Revenue/Sales a real accounting transaction source.

Inspect the complete repository and specifically inspect:

src/components/RevenueManagementModal.tsx
src/services/accounting/
src/services/gst/
src/services/tax/
src/services/reports/
src/services/audit/
src/services/db/
src/types/
src/config/
server.ts
prisma/
data/
tests/

Search for:

revenue
sales
gross_amount
gst_collected
net_revenue
payment_method
journal
journalLine
ledger
GSTTransaction
pnl
accounting
/api/revenue

Determine:

How Revenue is currently persisted.
Which API endpoints currently implement Revenue.
Whether GET/POST/PUT/DELETE Revenue operations are complete.
Which existing accounting service should receive Revenue postings.
Which existing journal-posting service should be reused.
Which existing GST service should receive Revenue transactions.
Which existing P&L service should receive Revenue through the GL.
Which database models already exist.
Whether JSON persistence is still being used for Revenue.
Which existing tests cover Revenue.
Which existing tests cover accounting.
Which existing tests cover GST.
Any duplicate Revenue/accounting implementations.
Any frontend financial calculations that should move to the backend.

Do not change files.

Return an architecture report containing:

CURRENT REVENUE FLOW
CURRENT ACCOUNTING FLOW
CURRENT GST FLOW
CURRENT PERSISTENCE FLOW
EXISTING SERVICES TO REUSE
EXISTING SERVICES THAT ARE INCOMPLETE
API CONTRACT GAPS
DATA MODEL GAPS
TEST GAPS
RECOMMENDED MINIMUM CHANGES

Do not claim that a route, service, or model is missing unless you verified it in the repository.

Prompt 2 — Revenue posting

PHASE 52 — REVENUE / SALES + ACCOUNTING INTEGRATION
STEP 2 — REVENUE ACCOUNTING POSTING

Based on the architecture inspection, implement ONLY the Revenue → Accounting integration.

Reuse existing services and models wherever possible.

Do not rewrite the application.

Requirements:

Revenue must have a deterministic lifecycle:
DRAFT
VALIDATED
REVIEW_REQUIRED
APPROVED
POSTED
REVERSED
Draft revenue may be edited.
Posted revenue is immutable.
Posted revenue cannot be deleted.
Corrections require reversal/adjustment transactions.
Revenue posting must create a balanced Journal.

For a GST-inclusive sale:

Gross = 108000
GST = 8000
Net = 100000

The conceptual journal is:

DR Cash/Bank/Card Clearing 108000
CR Sales Revenue 100000
CR GST Output Tax 8000

Use the existing chart of accounts.
Do not hard-code account IDs.

Payment method must resolve to the configured accounting account.
Missing account mapping must produce REVIEW_REQUIRED rather than inventing an account.
All monetary calculations must use Decimal-safe arithmetic.
Posting must be atomic.
Duplicate posting must be prevented.
Every journal must identify its source Revenue transaction.
Posting must respect AccountingPeriod status.
Locked periods must reject normal posting.
Create an immutable audit event for posting.

Do not change MIRA formulas.

Do not implement the complete GST return yet.

After implementation:

run Revenue tests
run accounting tests
run TypeScript checks
run build
report modified files
report new files
report test results
report remaining risks

Do not hide failures.

Prompt 3 — Revenue → GST

PHASE 52 — REVENUE / SALES + ACCOUNTING INTEGRATION
STEP 3 — REVENUE → GST

Now connect the posted Revenue transaction to the existing canonical GST engine.

Do NOT create a second GST calculation system.

Do NOT calculate authoritative GST in React.

The backend/domain layer must calculate:

gross amount
net amount
GST amount
GST classification
GST rate
regulatory rule
regulatory version

Support the existing GST classifications:

TAXABLE
ZERO_RATED
EXEMPT
OUT_OF_SCOPE

Resolve GST using the existing regulatory/effective-date architecture.

Do not hard-code statutory rates.

Revenue must create a GSTTransaction when appropriate.

The GST transaction must retain a trace to:

RevenueTransaction
→ GSTTransaction
→ Journal
→ LedgerPosting

Verify:

General-sector GST.
Tourism historical rate.
Tourism current rate.
Exempt revenue.
Zero-rated revenue.
Out-of-scope revenue.
GST-inclusive revenue.
GST-exclusive revenue.
Decimal-safe calculations.
GST transaction rollback if journal posting fails.
Historical transaction rates remain reproducible.

Reuse existing MIRA 205/206 generators.

Do NOT rewrite MIRA 205/206.

The objective is to feed them authoritative GST transactions.

Run all relevant tests and build checks afterward.

Prompt 4 — P&L/reconciliation

PHASE 52 — REVENUE / SALES + ACCOUNTING INTEGRATION
STEP 4 — REPORTING + RECONCILIATION

Connect Revenue to reporting through the authoritative accounting ledger.

Do NOT create a separate P&L calculation based directly on Revenue records.

Required flow:

Revenue
→ Journal
→ Ledger
→ P&L

Verify that net sales revenue appears in the correct P&L account.

Implement or extend reconciliation checks for:

Revenue ↔ GL
Revenue ↔ P&L
Revenue GST ↔ GSTTransaction
GSTTransaction ↔ GST output accounts

Every reconciliation must return:

PASS
WARNING
FAIL

Every difference must identify the affected Revenue transaction.

Add a Transaction Trace capability that can show:

Revenue
→ Classification
→ GSTTransaction
→ Journal
→ JournalLines
→ LedgerPosting
→ P&L

Do not redesign the application navigation.

Add only the minimum UI/API needed to expose the trace.

Run all tests and build checks.

Prompt 5 — correction workflow

PHASE 52 — REVENUE / SALES + ACCOUNTING INTEGRATION
STEP 5 — CORRECTIONS / REVERSALS

Implement the Revenue correction workflow.

Rules:

DRAFT can be edited.
POSTED cannot be edited.
POSTED cannot be deleted.
Closed periods cannot be bypassed.
Corrections use reversal/adjustment transactions.

Test:

Post a revenue transaction.
Attempt to edit it.
Verify edit is rejected.
Attempt to delete it.
Verify delete is rejected.
Create a reversal.
Verify reversal balances.
Create replacement revenue.
Verify replacement balances.
Verify original journal remains unchanged.
Verify audit events exist for posting and reversal.
Verify locked periods prevent unauthorized corrections.

Do not physically delete financial records.

Run regression tests afterward.

One important implementation decision

I would not ask Google AI Studio to “make MIRA 205/206 work” as the next task.

That is too high-level and will likely cause it to patch the form generator.

Instead, make the success criterion:

“Post one sale completely through Revenue → Journal → GL → GSTTransaction → MIRA 205/206 source data → P&L → reconciliation.”

Once that vertical slice works, the MIRA 205/206 problem becomes much easier because the return is no longer trying to manufacture accounting data itself.

The roadmap already establishes this philosophy: the accounting core requires balanced immutable journals and source-document traceability, while the GST layer requires return values to be traceable to GST transactions and reconciled to the GL.

What I would consider the Phase 52 milestone
                    ┌──────────────┐
                    │ Revenue Sale │
                    └──────┬───────┘
                           │
                     classification
                           │
                    ┌──────▼───────┐
                    │ GST Engine   │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │     Accounting Journal  │
              └────────────┬────────────┘
                           │
                       ┌───▼───┐
                       │  GL   │
                       └───┬───┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
              P&L                 GST Return
                │                 MIRA 205/206
                │                     │
                └──────────┬──────────┘
                           ▼
                    Reconciliation
                           │
                           ▼
                       Audit Trail

If this diagram works for one real transaction in the app, you have fixed the fundamental Revenue/Sales integration problem. From there, Income Tax can consume the resulting authoritative P&L rather than trying to calculate from a separate revenue subsystem.