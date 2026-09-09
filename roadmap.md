MIRA Tax & Accounting Engine


GLOBAL RULES
AI_DEVELOPMENT_RULES.md
ARCHITECTURE.md
REGULATORY_SOURCES.md
IMPLEMENTATION_STATUS.md

The following rules apply to every phase below.

Permanent AI Studio rules
You are modifying an existing production-oriented Maldives Tax &
Accounting Calculation Engine.

The repository already contains working functionality.

DO NOT perform a rewrite.

DO NOT replace the existing application architecture unless the
specific phase explicitly authorizes it.

DO NOT delete working functionality.

DO NOT modify unrelated files.

DO NOT change the UI unless explicitly required by the phase.

DO NOT change existing API contracts unless explicitly required.

DO NOT silently change tax rules.

DO NOT invent MIRA requirements.

DO NOT infer a tax rule from general knowledge when a regulatory
source is required.

Every statutory calculation must reference a versioned regulatory rule.

Every financial amount must use decimal-safe arithmetic.
Do not use JavaScript floating-point arithmetic for monetary
calculations.

Posted accounting transactions are immutable.

Closed accounting/tax periods are immutable.

Corrections must use reversal/adjustment transactions.

AI/OCR output is NEVER authoritative tax/accounting data.

AI may suggest classifications.

Deterministic rules must validate classifications.

Human approval is required wherever the configured risk policy
requires it.

Never claim that a return was filed with MIRA.

MIRAconnect integration is NOT part of this project.

The system may generate filing-ready documents/packages, but submission
is performed outside this application.

Before changing code:
1. inspect relevant existing implementation;
2. identify dependencies;
3. identify existing tests;
4. explain intended changes;
5. then implement.

After changing code:
1. run relevant tests;
2. run TypeScript/build checks;
3. report modified files;
4. report test results;
5. report any remaining risks.

Never hide failing tests.

If a regulatory requirement is uncertain, implement
REVIEW_REQUIRED rather than inventing a rule.


PHASE 19 — Regulatory Truth Layer
Objective
Create the authoritative regulatory rules system.
Google AI Studio prompt
PHASE 19 — REGULATORY TRUTH LAYER

Do not modify the UI.

Do not rewrite existing tax services.

Do not change existing calculations yet.

First inspect:
- src/services/miraTaxRates.ts
- src/services/*
- src/types/*
- src/config/*
- tests/*
- existing Prisma schema

Implement a versioned regulatory rule subsystem.

Create:

src/regulatory/
  rules/
  versions/
  resolvers/
  types/
  sources/

The regulatory model must support:

- ruleId
- taxType
- ruleCode
- description
- effectiveFrom
- effectiveTo
- taxYear
- version
- legalReference
- sourceURL
- parameters
- status

Create a deterministic RuleResolver.

The resolver must select a rule based on:
- transaction date
- tax year
- taxpayer type
- sector
- jurisdiction
- applicable regulatory version

Do not hard-code statutory rates into application services.

Seed only verified rules.

Important verified current rules include:
- General GST: 8%
- Tourism GST: 17% from 2025-07-01
- Individual income-tax brackets: 0%, 5.5%, 8%, 12%, 15%
- Company threshold: MVR 500,000 at 0%, excess at 15%
- NWT Section 55(a): generally 10%
- NWT non-resident contractor: 5%

Do NOT remove old historical rates.
Historical rates must remain available through effective dating.

Create unit tests proving that historical and current rates resolve
according to transaction/tax-period date.

Do not connect this system to the existing services yet.

Acceptance criteria:
1. RuleResolver is deterministic.
2. Historical GST rates resolve correctly.
3. 2025-07-01 tourism GST resolves to 17%.
4. Individual 5.5% bracket resolves correctly.
5. Company 500,000 threshold resolves correctly.
6. NWT contractor resolves to 5%.
7. NWT Section 55(a) categories resolve to 10%.
8. No existing tests regress.

Return a file-by-file summary after implementation.

Do not touch
src/components/*
src/App.tsx
server.ts
existing tax calculation formulas
database persistence
authentication


PHASE 20 — PostgreSQL + Prisma [COMPLETE]
This is the biggest architectural migration.
Objective
Eliminate the dangerous three-way persistence model.
Current:
JSON
+
in-memory Maps
+
Prisma

Target:
PostgreSQL
    ↑
Prisma
    ↑
services
    ↑
API

Prompt
PHASE 20 — DATABASE FOUNDATION

Inspect the existing:
- src/db/schema.prisma
- src/services/persistenceService.ts
- server.ts
- /data/*
- all service persistence calls
- all tests

Do not delete the JSON stores yet.

Design and implement the production PostgreSQL schema.

Extend the Prisma schema to support:

Tenant
User
Role
Permission
UserTenant

Taxpayer
TaxRegistration
TaxPeriod

Supplier
Customer

Document
DocumentVersion
Invoice
InvoiceLine

Account
AccountingPeriod
Journal
JournalLine

GSTTransaction
GSTPeriod

NWTTransaction
NWTPeriod

FixedAsset
FixedAssetMovement

TaxAdjustment
TaxLoss
TaxLossUtilisation

TaxCalculation
TaxCalculationLine

MIRAReturn
MIRAReturnLine

Reconciliation
Approval
AuditEvent
PeriodLock

RegulatoryRule
RegulatoryVersion

All monetary fields must use Prisma Decimal.

All business records must contain tenantId where tenant isolation
is required.

Add foreign keys, unique constraints and indexes.

Do NOT migrate application logic yet.

Do NOT remove JSON storage.

Create migration files.

Create a database seed mechanism for regulatory rules.

Acceptance tests:
- Prisma schema validates.
- migrations execute against a clean database.
- migrations execute against an existing development database.
- all foreign keys work.
- Decimal fields are used for monetary amounts.
- tenant isolation can be represented at schema level.
- existing 108 tests remain passing.

Do not modify UI.


PHASE 21 — Accounting / General Ledger Core
Prompt
PHASE 21 — ACCOUNTING CORE

Build the authoritative accounting ledger.

Inspect:
- transactionService.ts
- journalService.ts
- pnlService.ts
- persistenceService.ts
- existing accounting tests

Implement the following domain model:

Account
AccountingPeriod
Journal
JournalLine
LedgerPosting
TrialBalance

Rules:

1. Every posted journal must balance.
2. Debit total must equal credit total.
3. Posted journals cannot be edited.
4. Posted journals cannot be deleted.
5. Corrections require reversal journals.
6. Every journal belongs to an accounting period.
7. Locked periods reject new postings.
8. Every posting must identify source document/event.
9. All monetary calculations use Decimal.
10. Journal posting must be atomic.

Create:

src/services/accounting/
  ledgerService.ts
  journalPostingService.ts
  trialBalanceService.ts
  accountingPeriodService.ts

Migrate the existing in-memory accounting behavior into this domain
without changing the UI yet.

Acceptance tests:
- balanced journal posts.
- unbalanced journal is rejected.
- zero-line journal is rejected.
- duplicate posting is rejected.
- reversal balances.
- locked period rejects posting.
- trial balance balances.
- database transaction rollback works.
- existing accounting regression tests pass.


PHASE 22 — Purchase Invoice / OCR Evidence
Prompt
PHASE 22 — PURCHASE INVOICE EVIDENCE MODEL

Improve purchase-bill ingestion without changing the current UI.

Every OCR-extracted field must become evidence-backed data.

For every extracted field store:

value
confidence
source
boundingBox if available
OCRModel
OCRTimestamp
manuallyCorrected
correctedBy
correctedAt

Create:

Document
DocumentVersion
Invoice
InvoiceLine
OCRFieldEvidence

Invoice lifecycle:

UPLOADED
OCR_PROCESSING
EXTRACTED
VALIDATION_REQUIRED
CLASSIFICATION_REQUIRED
ACCOUNTANT_REVIEW
APPROVED
POSTED
REJECTED

Never automatically mark a financial document APPROVED merely because
OCR succeeded.

Implement validation for:
- invoice number
- invoice date
- supplier
- supplier TIN where applicable
- currency
- subtotal
- GST
- total
- arithmetic consistency

Acceptance tests:
- OCR values are preserved.
- corrections preserve original OCR value.
- corrected values are auditable.
- invalid totals cannot be posted.
- low-confidence extraction reaches review.
- existing purchase bill UI continues working.


PHASE 23 — Deterministic Classification Engine
Prompt
PHASE 23 — CLASSIFICATION ENGINE

There are currently duplicated classification systems.

Inspect:
- classificationEngine.ts
- classificationService.ts
- OCR parsing in server.ts
- miraCategoryMapping.ts
- pnlService.ts

Create one canonical classification engine.

Each invoice line must independently contain:

accountingClassification
gstClassification
incomeTaxClassification
nwtClassification
assetClassification
miraReportingClassification

AI may provide suggestions.

AI output must never directly post a transaction.

Implement:

suggestClassification()
validateClassification()
approveClassification()

Classification decisions must reference:
- ruleId
- regulatoryVersion
- classificationReason
- confidence
- reviewer

High-risk classifications must require human approval.

High-risk examples:
- capital asset
- blocked GST
- non-deductible expense
- NWT
- related-party transaction
- foreign transaction

Acceptance tests:
- same input produces deterministic classification.
- AI suggestion can be overridden.
- override is audited.
- high-risk classification cannot bypass review.
- classification has regulatory traceability.


PHASE 24 — GST Engine + MIRA 205/206
This is an important correction to the audit report.
Prompt
PHASE 24 — GST ENGINE

Correct the existing GST architecture.

MIRA 105 is GST registration.
MIRA 205 is the General Sector GST Return.
MIRA 206 is the Tourism Sector GST Return.

Do not call MIRA 105 the GST return.

Implement a versioned GST engine.

Support:
- general sector
- tourism sector
- taxable
- zero-rated
- exempt
- out-of-scope
- input tax
- blocked input tax
- capital input tax
- mixed-use input tax
- apportionment
- corrections
- credit/debit adjustments
- transaction date/effective rate

Current verified rates:
General: 8%
Tourism:
16% through 2025-06-30
17% from 2025-07-01

Use RegulatoryRule resolver rather than constants.

Implement:
GSTTransaction
GSTPeriod
GSTCalculation
GSTReconciliation

Generate:
MIRA 205 v25.1 for applicable General Sector periods.
MIRA 206 for applicable Tourism Sector periods.

Do not assume that MIRA 205 and MIRA 206 have identical structures.

Retrieve field definitions from the official current MIRA forms/guides
before finalizing mappings.

Acceptance tests:
- 2025-06-30 tourism transaction uses 16%.
- 2025-07-01 tourism transaction uses 17%.
- general sector uses 8%.
- exempt transaction creates no output GST.
- blocked input cannot be claimed.
- claimable input reconciles to source invoices.
- MIRA 205 output is traceable to GST transactions.
- MIRA 206 output is independently supported.
- GST return totals reconcile to GL.

MIRA currently confirms MIRA 205 is the General GST Return and MIRA 206 is for tourism. (Mira)

PHASE 25 — NWT / MIRA 602
Prompt
PHASE 25 — NON-RESIDENT WITHHOLDING TAX

Correct the existing WHT naming/model.

The Maldives Income Tax Act distinguishes employee withholding tax
under Section 54 from non-resident withholding tax under Section 55.

This phase implements NWT.

The return is MIRA 602.

Current Section 55 rates:
10%:
- rent of Maldivian immovable property
- royalty
- qualifying interest
- dividends
- technical services
- commissions for services supplied in Maldives
- public entertainer performances
- R&D
- insurance premiums

5%:
- payments to non-resident contractors

The engine must determine:
- residency
- payment type
- Section 55 category
- payment date
- payable date
- earlier-of payment/payable withholding date
- gross amount
- rate
- DTAA/treaty relief where legally applicable
- withholding amount
- currency
- reporting period

Do not automatically assume every foreign supplier is subject to NWT.

Implement:
NWTTransaction
NWTPeriod
NWTCalculation
NWTReconciliation
WithholdingCertificateRecord

MIRA 602 must reflect the current form version applicable to the period.
Do not hard-code v23.1 or v24.1 universally.

Acceptance tests:
- 10% FTS.
- 10% royalty.
- 5% contractor.
- non-NWT foreign purchase.
- withholding date uses earlier payment/payable date.
- treaty relief requires documented evidence.
- MIRA 602 is generated from NWT transactions.
- monthly NWT reconciliation works.
- due date is the 15th of following month.

MIRA confirms MIRA 602 and the current 10%/5% structure. (Mira)

PHASE 26 — Income Tax Engine
Prompt
PHASE 26 — INCOME TAX ENGINE

Rebuild entity income-tax calculations around versioned regulatory rules.

Support:

Company
Individual
Partnership
Other applicable taxpayer types

Company:
0% on first MVR 500,000
15% above MVR 500,000

Individual:
0% up to 720,000
5.5% from 720,000 to 1,200,000
8% from 1,200,000 to 1,800,000
12% from 1,800,000 to 2,400,000
15% above 2,400,000

Do not hard-code these values.

Implement:
TaxableIncomeCalculation
TaxBracketCalculation
TaxLiability
TaxCredit
Prepayment
WithholdingCredit
FinalTaxPayable

Tax calculations must be explainable.

Each calculation must retain:
inputs
rule IDs
formula
intermediate values
result

Use Decimal arithmetic.

Acceptance tests must cover:
- every bracket boundary
- MVR 500,000 company boundary
- MVR 500,001 company case
- zero income
- negative accounting profit
- tax loss
- short accounting period where legally applicable
- credits/prepayments

Current MIRA individual and company rates are confirmed by MIRA. (Mira)

PHASE 27 — MIRA 604 v25.1 [COMPLETE]
Prompt
PHASE 27 — MIRA 604 VERSIONED FORM ENGINE

Implement MIRA 604 as a versioned form definition.

Current verified target:
MIRA 604 v25.1
Applicable from tax year 2024 onward.

Do not represent the form as one giant hard-coded function.

Create:

src/regulatory/forms/
  mira604/
    v25_1/
      definition.ts
      fields.ts
      formulas.ts
      validations.ts
      mappings.ts

Every field must define:
fieldCode
label
dataType
required
source
formula if applicable
validation
applicability
ruleVersion

Every generated value must have a source trace.

Build:
MIRA604Calculation
MIRA604Validation
MIRA604Generator

Do not assume the old Section A-F description is sufficient.
Use the official v25.1 form and guide as the source of truth.

Acceptance tests:
- all required v25.1 fields are represented.
- invalid required fields are rejected.
- generated values reconcile with tax engine.
- form values trace to accounting/tax records.
- current v25.1 structure is regression-tested.

MIRA identifies v25.1 as the current MIRA 604 version for tax years from 2024 onward. (Mira)

PHASE 28 — MIRA Schedules
Prompt
PHASE 28 — MIRA 604 SCHEDULE ENGINE

Do not assume that every schedule is a capital-allowance schedule.

The official MIRA forms catalogue currently identifies:

Schedule 2:
Statement of Financial Position

Schedule 3:
Statement of Net Worth Excluding Business

Schedule 4:
Reporting of International Transactions with Associates

Schedule 5:
Reporting of share of taxable income from Controlled Foreign Entities

Current Schedule 4 and Schedule 5 versions are v25.1.

Implement versioned schedule definitions.

Create:
Schedule2
Schedule3
Schedule4
Schedule5

Each schedule must have:
field definitions
source mappings
applicability rules
validation rules
version

Schedule 4 must support related-party/international transaction data.

Schedule 5 must support CFE reporting where applicable.

Do not generate Schedule 4 or 5 merely because the return exists.
Determine applicability.

Acceptance tests:
- Schedule 2 reconciles to balance sheet.
- Schedule 3 handles applicable non-business net worth.
- Schedule 4 is triggered by applicable related-party transactions.
- Schedule 5 is triggered by applicable CFE ownership/income conditions.
- all schedule totals reconcile.

MIRA's current forms catalogue supports these schedule descriptions and versions. (Mira)

PHASE 29 — Capital Allowance
Prompt
PHASE 29 — CAPITAL ALLOWANCE ENGINE

Separate accounting depreciation from tax capital allowance.

Implement:

FixedAsset
FixedAssetMovement
TaxAssetPool
CapitalAllowanceCalculation
DisposalCalculation

Each tax asset must retain:
cost
tax basis
acquisition date
in-service date
tax classification
applicable rule
allowance claimed
closing tax value
disposal proceeds
disposal date

Do not hard-code rates.

Resolve rates through RegulatoryRule.

Do not assume that the existing "Schedule 2 capital allowance"
description is correct. Validate the actual current MIRA 604/form
presentation before implementing report mappings.

Support:
- acquisition
- partial-year treatment where legally applicable
- disposal
- balancing adjustments where legally applicable
- low-value treatment where legally applicable
- historical rates

Acceptance tests:
- asset acquisition.
- asset disposal.
- partial-year asset.
- fully depreciated/allowed asset.
- historical rate.
- tax basis never becomes negative.
- accounting depreciation never changes tax basis directly.


PHASE 30 — Tax Adjustment Engine
Prompt
PHASE 30 — TAX ADJUSTMENT LEDGER

Create a formal tax adjustment ledger.

Every adjustment must have:

id
taxYear
sourceJournalLine
adjustmentCode
description
amount
direction
ruleId
supportingDocument
reviewStatus
approvedBy
approvedAt

Support:
- depreciation addback
- non-deductible expenditure
- private expenditure
- fines/penalties
- capital expenditure adjustments
- allowable tax deductions
- other legally applicable adjustments

Do not assume an adjustment is deductible/non-deductible merely from
an account name.

Use deterministic rules.

Every adjustment must be traceable to:
invoice/document
journal
account
tax rule

Acceptance tests:
- adjustment creates tax bridge.
- source journal is traceable.
- reversing accounting transaction reverses/updates adjustment.
- unauthorized user cannot approve.
- duplicate adjustment cannot occur.


PHASE 31 — Tax Loss Engine
Prompt
PHASE 31 — TAX LOSS LOT ENGINE

Do not store prior-year loss as one aggregate number.

Create TaxLossLot:

originTaxYear
originalAmount
utilisedAmount
remainingAmount
expiryTaxYear
status

Create TaxLossUtilisation:

lossLotId
taxYear
amount
calculationId
approvedBy

Implement FIFO or the legally correct utilisation ordering after
verifying the applicable Income Tax Act/Regulation requirement.

Do not assume five-year treatment solely from the old application code.
Validate the current law and encode the verified rule.

Acceptance tests:
- loss generated.
- loss carried forward.
- partial utilisation.
- multiple loss years.
- expiry.
- no over-utilisation.
- complete audit trail.


PHASE 32 — Foreign Exchange
Prompt
PHASE 32 — FOREIGN EXCHANGE ENGINE

Implement authoritative FX accounting.

Every foreign-currency transaction must store:

transactionCurrency
functionalCurrency
sourceAmount
fxRate
rateDate
rateSource
MVRAmount

Never recalculate historical transactions using current FX rates.

Support:
- invoice recognition
- settlement
- realised FX gain/loss
- period-end revaluation
- unrealised FX
- reversal of previous revaluation

Implement FXRate table:

currency
date
rate
source
retrievedAt
approved

MVR transactions must not require unnecessary FX conversion.

Acceptance tests:
- USD invoice.
- historical rate.
- settlement at different rate.
- realised gain.
- realised loss.
- period-end unrealised FX.
- reversal.
- missing rate results in REVIEW_REQUIRED rather than invented rate.


PHASE 33 — Reconciliation Engine
Prompt
PHASE 33 — RECONCILIATION ENGINE

Build a formal reconciliation framework.

Every reconciliation must return:

PASS
WARNING
FAIL

Create:

Reconciliation
ReconciliationItem
ReconciliationRule

Implement:

GL ↔ GST
GL ↔ NWT
AP ↔ NWT
Fixed Assets ↔ GL
Tax Assets ↔ Fixed Assets
P&L ↔ Income Tax
Tax Adjustments ↔ Tax Calculation
MIRA 604 ↔ Tax Engine
Schedule 2 ↔ Balance Sheet
Schedule 3 ↔ applicable source data
Schedule 4 ↔ related-party ledger
Schedule 5 ↔ CFE data

Every difference must identify the underlying transactions.

Acceptance tests:
- perfect reconciliation returns PASS.
- one transaction difference returns FAIL.
- rounding-only difference follows configured tolerance.
- user can drill from reconciliation difference to source transaction.


PHASE 34 — Offline MIRA Filing Package
Prompt
PHASE 34 — MIRA FILING PACKAGE

Do NOT implement MIRAconnect transmission.

Remove MIRAconnect from the required production workflow.

Create an offline filing-package generator.

Output:

/filing-package/
  manifest.json
  MIRA604.pdf
  MIRA205.pdf where applicable
  MIRA206.pdf where applicable
  MIRA602.pdf where applicable
  schedules/
  tax-calculation/
  reconciliation/
  supporting-documents/
  hashes.json

The manifest must contain:

tenant
TIN
taxpayer
taxYear
accountingPeriod
formVersions
regulatoryVersions
generatedAt
documentHashes

The package must state:

"Generated for taxpayer review and filing."

It must NOT state:

"Filed with MIRA."

Acceptance tests:
- package generates.
- hashes verify.
- package can be regenerated deterministically for the same data/version.
- missing mandatory form data blocks package generation.
- MIRAconnect is not called.


PHASE 35 — Immutable Audit Ledger
Prompt
PHASE 35 — AUDIT SYSTEM

Implement immutable audit events.

AuditEvent:

id
tenantId
actorId
timestamp
eventType
entityType
entityId
beforeHash
afterHash
metadata
reason
correlationId

Audit:
- document upload
- OCR
- OCR correction
- classification
- classification override
- approval
- journal posting
- journal reversal
- tax adjustment
- tax calculation
- period lock
- return generation
- filing package generation

Do not allow ordinary users to edit/delete audit events.

Create tamper-evident chaining if compatible with existing architecture.

Acceptance tests:
- every financial mutation produces audit event.
- override is audited.
- audit event cannot be edited.
- unauthorized audit access is rejected.
- audit chain integrity can be verified.


PHASE 36 — Period Closing
Prompt
PHASE 36 — PERIOD CONTROL

Implement accounting/tax period states:

OPEN
REVIEW
APPROVED
LOCKED
AMENDED

Rules:

OPEN:
normal posting

REVIEW:
controlled changes

APPROVED:
only authorized amendments

LOCKED:
no normal modifications

AMENDED:
requires explicit amendment workflow

No database deletion may bypass the period lock.

Corrections to locked periods must use controlled amendment/reversal
workflow.

Acceptance tests:
- open period accepts posting.
- locked period rejects posting.
- locked transaction cannot be edited.
- reversal requires permission.
- amendment is audited.


PHASE 37 — Approval Workflow
Prompt
PHASE 37 — ACCOUNTING AND TAX APPROVAL WORKFLOW

Implement:

DATA_ENTRY
ACCOUNTANT
TAX_REVIEWER
FINANCE_MANAGER
ADMIN
AUDITOR

Create approval states:

DRAFT
SUBMITTED
REVIEW_REQUIRED
APPROVED
REJECTED
POSTED

Risk-based approval must apply to:
- capital assets
- blocked GST
- NWT
- tax adjustments
- related-party transactions
- foreign currency exceptions
- manual OCR corrections affecting tax
- tax return approval

The AI model cannot approve.

Acceptance tests:
- unauthorized approval rejected.
- accountant can approve configured classifications.
- tax reviewer required for tax adjustments.
- approval creates audit event.
- rejected records cannot post.


PHASE 38 — Security Hardening
Prompt
PHASE 38 — SECURITY HARDENING

Inspect all Express routes in server.ts.

Current risks include:
- timestamp-based session tokens
- plaintext/sensitive JSON storage
- weak tenant enforcement
- legacy routes without consistent authorization

Implement:

cryptographically secure session IDs
session expiration
secure cookies
HttpOnly
SameSite
CSRF protection where applicable
rate limiting
request validation
RBAC middleware
tenant isolation
security headers
secure file-upload validation
secret environment variables

Do not expose:
passwords
session tokens
API keys
service credentials

Do not delete existing routes.

Wrap legacy routes with authorization middleware.

Acceptance tests:
- unauthenticated request rejected.
- expired session rejected.
- tenant A cannot access tenant B.
- unauthorized role rejected.
- malicious upload rejected.
- secrets are not committed.


PHASE 39 — AI Governance
This is one of the most important phases.
Prompt
PHASE 39 — AI GOVERNANCE

AI/OCR is an assistant, never the tax authority.

Separate:

AIExtraction
AISuggestion
DeterministicValidation
HumanApproval
AccountingPosting

Gemini may:
- extract invoice data
- suggest classification
- identify possible anomalies

Gemini may NOT:
- directly post journals
- directly calculate final tax liability
- change statutory tax rates
- approve tax treatment
- bypass mandatory review

Every AI result must store:
model
modelVersion
promptVersion
timestamp
confidence
rawOutputHash
normalizedOutput

Implement review thresholds.

High-risk financial/tax classifications must require human approval.

Acceptance tests:
- AI cannot post.
- AI cannot alter regulatory rules.
- AI cannot approve.
- low confidence requires review.
- overridden AI result is audited.


PHASE 40 — Comprehensive E2E Test Engine
Prompt
PHASE 40 — MASTER END-TO-END TEST

Replace the existing concept of "test passes = production ready"
with a much stronger deterministic E2E suite.

Create:

tests/e2e/miraTaxEngine.test.ts

Test:

Tenant
→ taxpayer
→ supplier
→ document
→ OCR
→ validation
→ classification
→ approval
→ journal
→ GL
→ GST
→ NWT
→ fixed asset
→ tax adjustment
→ income tax
→ MIRA form
→ reconciliation
→ filing package

Assert every major intermediate value.

Do not merely assert that the pipeline completed.

Assert:
- journal balance
- GST
- NWT
- tax adjustment
- taxable income
- tax liability
- return values
- reconciliation
- document hashes

The E2E test must fail if any intermediate calculation is wrong.


PHASE 41 — Golden Tax Cases
Prompt
PHASE 41 — GOLDEN REGULATORY CASES

Create immutable golden test fixtures.

Cases:

GOLDEN-001 simple purchase
GOLDEN-002 general GST
GOLDEN-003 tourism GST before 2025-07-01
GOLDEN-004 tourism GST from 2025-07-01
GOLDEN-005 exempt purchase
GOLDEN-006 blocked input tax
GOLDEN-007 capital asset
GOLDEN-008 foreign currency purchase
GOLDEN-009 NWT technical service
GOLDEN-010 NWT contractor
GOLDEN-011 NWT treaty relief
GOLDEN-012 company income tax
GOLDEN-013 individual income tax
GOLDEN-014 prior tax loss
GOLDEN-015 related-party transaction
GOLDEN-016 CFE scenario
GOLDEN-017 period lock
GOLDEN-018 accounting reversal
GOLDEN-019 OCR correction
GOLDEN-020 full MIRA filing package

Each fixture must contain:
inputs
expected calculations
expected classifications
expected return values
expected reconciliation state

Do not silently update golden expected values.
Changing a golden value requires explicit review.


PHASE 42 — Regulatory Regression Framework
Prompt
PHASE 42 — REGULATORY REGRESSION

Create a regulatory regression framework.

Every regulatory rule must have:
effectiveFrom
effectiveTo
version
source
test cases

When a new rule is introduced:
- old historical rules remain available
- historical tests continue passing
- new tests are added
- existing tax years must not change unexpectedly

Create:
RegulatorySnapshot
RegulatoryRuleVersion
RegulatoryRegressionTest

Acceptance test:

Change a future tax rule.

Verify that:
2024 calculations remain unchanged.
2025 calculations remain unchanged where applicable.
Future periods use the new rule.

No rule may be changed merely by editing UI configuration.


PHASE 43 — Explainable Tax Calculation
Prompt
PHASE 43 — TAX EXPLAINABILITY

Every tax calculation must produce a calculation explanation.

Create:

TaxCalculationExplanation

Structure:

INPUTS
RULES
STEPS
INTERMEDIATE_RESULTS
FINAL_RESULT

Example:

Taxable income:
MVR X

Bracket 1:
amount × rate = tax

Bracket 2:
amount × rate = tax

Total:
MVR X

Every step must reference its regulatory rule.

Expose the explanation through an API.

Do not use AI to generate the mathematical explanation.

The explanation must come directly from deterministic calculation data.

Acceptance tests:
- calculation explanation reproduces exact tax result.
- every tax step has rule reference.
- no unexplained adjustment exists.


PHASE 44 — Compliance Dashboard
Prompt
PHASE 44 — TAX COMPLIANCE DASHBOARD

Add a compliance dashboard without changing the existing application
navigation unnecessarily.

Display:

Accounting status
GST status
NWT status
Income Tax status
MIRA return status
Reconciliation status
Approval status
Period status

Each item should show:
PASS
WARNING
BLOCKED
NOT_APPLICABLE

Show blocking issues.

Examples:
Missing TIN
Unapproved classification
GST reconciliation difference
Unposted journal
Locked-period amendment
Missing supporting document
Required schedule incomplete

Every warning must link to the underlying record.

Do not calculate tax in React.
The backend remains authoritative.


PHASE 45 — Filing Readiness Engine
Prompt
PHASE 45 — PRE-FILING CONTROL ENGINE

Create:

PreFilingCheck
PreFilingResult
PreFilingIssue

Implement:

RUN PRE-FILING CHECK

Checks:

accounting balances
no unposted required transactions
period approved
period status valid
GST reconciled
NWT reconciled
fixed assets reconciled
tax adjustments reviewed
tax losses reconciled
MIRA return validated
required schedules validated
supporting documents present
mandatory approvals complete
no blocking audit exceptions

Return:

READY_FOR_FILING

or

NOT_READY

with blocking issues.

The filing package generator must refuse to generate a
"ready for filing" package if blocking issues exist.


PHASE 46 — Production Infrastructure
Prompt
PHASE 46 — PRODUCTION INFRASTRUCTURE

Prepare the application for deployment.

Implement/document:

development environment
staging environment
production environment

PostgreSQL
environment variables
database migrations
health endpoint
readiness endpoint
structured logging
error handling
request correlation IDs
Docker configuration
backup configuration
migration deployment process

Do not put production credentials in repository.

Do not modify tax logic.

Acceptance tests:
- clean production-like build.
- clean database migration.
- health endpoint works.
- readiness endpoint detects database failure.
- application starts without development-only assumptions.


PHASE 47 — Disaster Recovery
Prompt
PHASE 47 — DISASTER RECOVERY

Design and document:

database backup
point-in-time recovery
document backup
audit backup
off-site backup
restore procedure

Create a recovery runbook.

Test:

1. create accounting data
2. create tax calculation
3. create audit events
4. create filing package
5. backup
6. restore
7. verify all records
8. verify audit chain
9. verify tax results

Acceptance criteria:
Restored system produces identical accounting and tax results.


PHASE 48 — Performance Testing
Prompt
PHASE 48 — PERFORMANCE TESTING

Do not optimize business rules.

Benchmark:

10,000 invoices
100,000 invoice lines
1,000,000 journal lines
multiple tenants
multiple years

Measure:

invoice ingestion
classification
journal posting
trial balance
GST calculation
NWT calculation
income tax calculation
reconciliation
MIRA form generation
filing package generation

Identify:
slow SQL queries
N+1 queries
memory leaks
unbounded queries
missing indexes

Only optimize after proving the bottleneck.

Do not change calculation results.


PHASE 49 — Security Audit
Prompt
PHASE 49 — SECURITY AUDIT

Perform a security review of the complete repository.

Check:

authentication
authorization
tenant isolation
session management
CSRF
XSS
SQL injection
file upload
path traversal
IDOR
API abuse
rate limiting
secret exposure
dependency vulnerabilities
logging of sensitive information

Create:

SECURITY_AUDIT.md

For every finding:

severity
location
risk
recommended fix
status

Fix critical and high vulnerabilities.

Do not modify tax formulas.

Run all existing tests afterward.


PHASE 50 — Accountant Acceptance Testing
This phase should involve a real accountant/tax practitioner.
Prompt
PHASE 50 — ACCOUNTANT ACCEPTANCE TESTING

Create a structured acceptance-test framework for Maldives
accounting/tax practitioners.

Create:

tests/acceptance/

Provide anonymized scenarios covering:

purchase invoices
GST
tourism GST
NWT
foreign currency
capital assets
tax adjustments
tax losses
company income tax
individual income tax
related parties
CFE
period amendments
MIRA 604
MIRA 205
MIRA 206
MIRA 602

For each case capture:

input
expected accounting
expected tax treatment
expected MIRA result
reviewer
review date
result
comments

Do not automatically mark acceptance tests passed.

Create an acceptance report.


PHASE 51 — Production Certification
This is the final gate.
Prompt
PHASE 51 — PRODUCTION CERTIFICATION

Do NOT change application functionality unless a certification test
reveals a failure.

Run a complete production-readiness audit.

Verify:

REGULATORY
- current MIRA rules documented
- effective dates implemented
- sources documented
- historical rules preserved

ACCOUNTING
- double-entry integrity
- immutable posted journals
- trial balance
- period controls

GST
- MIRA 205
- MIRA 206
- current rates
- historical rates
- GST reconciliation

NWT
- MIRA 602
- Section 55 categories
- 10% categories
- 5% contractor
- payment/payable date
- reconciliation

INCOME TAX
- company rates
- individual brackets
- tax losses
- tax adjustments
- capital allowances

MIRA
- MIRA 604 v25.1
- applicable schedules
- correct form versions
- source traceability

AUDIT
- immutable events
- approvals
- reversals
- period locking

SECURITY
- authentication
- authorization
- tenant isolation
- secrets
- file security

AI
- no AI direct tax authority
- review gates
- model/version audit

OPERATIONS
- backups
- restore
- migrations
- monitoring
- logging

TESTING
- unit
- integration
- regression
- golden cases
- E2E
- acceptance tests

Generate:

PRODUCTION_READINESS_REPORT.md

Classify every item:

PASS
FAIL
WARNING
NOT_APPLICABLE

The application must not be declared production-ready if any
critical regulatory, accounting, security, audit, or data-integrity
item is FAIL.


The database architecture I want AI Studio to converge toward
Don't let each phase invent its own tables. This is the target model.
TENANCY
────────
Tenant
User
Role
Permission
UserTenant

TAXPAYER
────────
Taxpayer
TaxRegistration
TaxPeriod

DOCUMENTS
─────────
Document
DocumentVersion
OCRFieldEvidence

PURCHASES
─────────
Supplier
Invoice
InvoiceLine

ACCOUNTING
─────────
Account
AccountingPeriod
Journal
JournalLine
LedgerPosting
TrialBalance

GST
───
GSTTransaction
GSTPeriod
GSTCalculation

NWT
───
NWTTransaction
NWTPeriod
NWTCalculation
WithholdingCertificate

FIXED ASSETS
────────────
FixedAsset
FixedAssetMovement
TaxAssetPool
CapitalAllowanceCalculation

INCOME TAX
──────────
TaxAdjustment
TaxLossLot
TaxLossUtilisation
TaxCalculation
TaxCalculationLine
TaxCredit
TaxPrepayment

MIRA
────
MIRAReturn
MIRAReturnLine
MIRASchedule
MIRAFormVersion

COMPLIANCE
──────────
Reconciliation
ReconciliationItem
PreFilingCheck
PreFilingIssue

GOVERNANCE
──────────
Approval
AuditEvent
PeriodLock

REGULATORY
──────────
RegulatoryVersion
RegulatoryRule
RegulatorySource


Critical correction: don't let AI Studio preserve the current naming blindly
Your audit report contains several names that should be corrected before implementation.
Current repository/report concept
Target
MIRA 105 GST return
MIRA 105 = GST registration; MIRA 205/206 = GST returns
MIRA 302 WHT
MIRA 602 = Non-Resident WHT Return
Tourism GST 16% universally
16% until 2025-06-30; 17% from 2025-07-01
Individual 5% / 10%
5.5% / 8% / 12% / 15% current brackets
Schedule 2 = capital allowance
Verify against actual MIRA form; current catalogue says Schedule 2 = Statement of Financial Position
Fixed MIRA form version
Version must be resolved by tax period
WHT 10% for every foreign vendor
Determine actual Section 55 category; contractor is currently 5%

These aren't cosmetic changes. They should be treated as regulatory defects in the existing implementation. MIRA's official materials confirm the current forms and rates above. (Mira)

One more thing I strongly recommend: add a Regulatory Change Protocol
Create:
REGULATORY_CHANGE_PROTOCOL.md

with this process:
MIRA publishes change
        ↓
Regulatory analyst reviews source
        ↓
Create RegulatoryChange record
        ↓
Determine effective date
        ↓
Determine affected tax years
        ↓
Create new RegulatoryRule version
        ↓
Create regression tests
        ↓
Run historical tests
        ↓
Run future-period tests
        ↓
Accountant/tax reviewer approval
        ↓
Activate rule

Never modify a rate by simply changing:
const GST_RATE = 0.17;

Again, MIRA's GST history demonstrates exactly why this matters: the tourism rate changed from 16% to 17% on 1 July 2025, while general GST remained 8%. (Mira)

Your first 5 AI Studio sessions
I would not start with Phase 20 immediately.
Run these in order:
Session 1
Phase 19 — Regulatory Truth Layer
Then inspect the diff.
Session 2
Phase 20 — Prisma database
Then inspect migrations.
Session 3
Phase 21 — Accounting Core
Then run accounting regression tests.
Session 4
Phase 22 — Invoice/OCR evidence
Then verify the existing purchase-bill UI still works.
Session 5
Phase 23 — Classification
Only after these five are stable should you begin modifying GST/tax calculations.

And one very important change to your definition of "done"
Your existing statement says:
"Passing tests/integration/e2eTaxEngine.test.ts means the tax engine is fully built, tested, and ready for production."
Delete that statement.
Replace it with:
"Passing the master E2E test confirms that the implemented workflow is internally consistent. Production readiness additionally requires regulatory validation, effective-dated rules, accounting integrity, reconciliation, security testing, golden regulatory cases, disaster recovery, and independent accountant/tax-practitioner acceptance."
That distinction is essential.
The current MIRA materials themselves show why a static E2E test isn't enough: MIRA has already revised MIRA 205 to v25.1, MIRA 604 is v25.1 for tax years from 2024, and MIRA 602 has version changes depending on the period. (Mira)

Recommended implementation order
If you want the lowest-risk path in Google AI Studio, use this sequence:
                   FOUNDATION
                        │
                        ▼
                 PHASE 19
             Regulatory Truth
                        │
                        ▼
                 PHASE 20
              PostgreSQL/Prisma
                        │
                        ▼
                 PHASE 21
              Accounting Core
                        │
                        ▼
                 PHASE 22
             Document Evidence
                        │
                        ▼
                 PHASE 23
              Classification
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
       PHASE 24      PHASE 25       PHASE 26
         GST           NWT        Income Tax
          │             │              │
          └─────────────┼──────────────┘
                        ▼
                 PHASE 27
                   MIRA 604
                        │
                        ▼
                 PHASE 28
                 Schedules
                        │
                        ▼
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       PHASE 29      PHASE 30      PHASE 31
       Assets       Adjustments      Losses
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                 PHASE 32
                       FX
                        │
                        ▼
                 PHASE 33
                Reconciliation
                        │
                        ▼
                 PHASE 34
               Filing Package
                        │
                        ▼
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
       PHASE 35      PHASE 36       PHASE 37
        Audit         Periods       Approval
          │             │              │
          └─────────────┼──────────────┘
                        ▼
                 PHASE 38
                    Security
                        │
                        ▼
                 PHASE 39
                 AI Governance
                        │
                        ▼
              PHASE 40–42
             Testing System
                        │
                        ▼
              PHASE 43–45
              Compliance UX
                        │
                        ▼
              PHASE 46–49
             Production Ops
                        │
                        ▼
              PHASE 50–51
             Human Validation
                        │
                        ▼
                   🟢 GO LIVE

The single most important architectural principle
Make this the motto at the top of ARCHITECTURE.md:
AI extracts. Rules determine. Accounting records. Humans approve. MIRA forms report. Audit proves.
That architecture is much safer than trying to make Gemini itself behave like a tax engine.
And because you're deliberately not implementing MIRAconnect, your production boundary should be:
                   YOUR APPLICATION
                          │
             ┌────────────┴────────────┐
             │                         │
       Tax Calculation           Filing Package
             │                         │
             └────────────┬────────────┘
                          ▼
                  Accountant Review
                          │
                          ▼
                  External MIRA Filing

rather than pretending your application has submitted anything to MIRA.
MIRA itself currently states that MIRA 604, MIRA 205 and MIRA 602 are submitted through MIRAconnect, subject to the applicable alternative filing provisions, so your application should clearly distinguish "filing package generated" from "return filed." (Mira)
I would start with Phase 19 exactly as written above, and after AI Studio completes it, don't let it proceed to Phase 20 until you have reviewed the regulatory-rule diff and tests.

