AI extracts. Rules determine. Accounting records. Humans approve. MIRA forms report. Audit proves.

Architecture
Project: CR Maldives Purchase Bills Entry  
Repository: `ibreez/CR-Maldives-Purchase-Bills-Entry`  
Reviewed: 2026-08-13
1. Architectural objective
The application is evolving from a purchase-bill OCR utility into a multi-outlet financial and tax-support platform for Maldives businesses.
The target architecture must support:
multiple taxpayers/entities,
multiple outlets,
purchase-document capture,
OCR and human verification,
GST input-tax support,
expense classification,
revenue capture,
fixed assets and capital allowances,
income-tax reporting support,
auditability,
reconciliation,
PostgreSQL persistence,
controlled report generation.
2. Current technology stack
The repository currently contains:
React 19
TypeScript
Vite
Express 4
Node.js/TypeScript server
Google GenAI SDK
Multer for uploads
XLSX generation
Tailwind CSS
Vitest
JSON-file persistence
The package scripts include development, build, start, lint/type-check and test commands.
3. Current high-level topology
```text
Browser
  |
  | HTTP
  v
Express server
  |
  +--> Authentication/session logic
  |
  +--> Upload handling
  |       |
  |       +--> data/uploads/*
  |
  +--> OCR / Gemini integration
  |
  +--> Bill validation / duplicate detection
  |
  +--> Expense / tax classification
  |
  +--> Revenue
  |
  +--> Fixed assets
  |
  +--> GST / Income Tax calculations
  |
  +--> XLSX/report generation
  |
  +--> JSON files
          |
          +--> bills.json
          +--> settings.json
          +--> outlets.json
          +--> users.json
          +--> sessions.json
          +--> revenue.json
          +--> assets.json
          +--> custom_template.xlsx
```
4. Current domain model
The existing TypeScript types already separate several important concepts.
4.1 Document layer
`BillRecord` contains:
document identity,
outlet,
uploader,
original file metadata,
OCR status,
extracted data,
verified data,
confidence,
validation,
reporting period,
audit trail.
4.2 Extraction layer
`ExtractedBillData` separates:
document type,
tax status,
expense category,
supplier,
invoice information,
line items,
totals,
notes,
field evidence.
4.3 Tax/accounting layer
The repository contains decoupled models for:
accounting classification,
GST treatment,
income-tax treatment,
transaction identity,
journal entries,
accounting periods,
fixed assets,
reconciliation/audit concepts,
MIRA return structures.
This separation is important and must be preserved.
5. Target domain architecture
The target system should be organized conceptually into these bounded areas:
```text
                    ┌─────────────────────┐
                    │   Tenant / Entity   │
                    └──────────┬──────────┘
                               |
                    ┌──────────v──────────┐
                    │       Outlets       │
                    └──────────┬──────────┘
                               |
        ┌──────────────────────┼──────────────────────┐
        |                      |                      |
┌───────v────────┐     ┌───────v────────┐     ┌───────v────────┐
│ Source Docs    │     │ Transactions   │     │ Revenue        │
│ OCR + Review   │     │ Accounting     │     │ Sales/Income   │
└───────┬────────┘     └───────┬────────┘     └───────┬────────┘
        |                      |                      |
        └──────────────────────┼──────────────────────┘
                               |
                    ┌──────────v──────────┐
                    │ Classification      │
                    │ GST / Income Tax    │
                    └──────────┬──────────┘
                               |
              ┌────────────────┼────────────────┐
              |                |                |
      ┌───────v───────┐ ┌──────v──────┐ ┌──────v──────┐
      │ Fixed Assets  │ │ GST Returns │ │ Income Tax  │
      │ / Schedule 2  │ │ / Reports   │ │ / MIRA 604  │
      └───────────────┘ └─────────────┘ └─────────────┘
```
6. Recommended PostgreSQL model
The JSON files should ultimately be replaced by normalized PostgreSQL tables.
Core tables:
```text
entities
outlets
users
sessions
documents
document_files
document_extractions
document_reviews
transactions
transaction_lines
tax_treatments
accounting_categories
revenue_transactions
fixed_assets
journal_entries
journal_lines
accounting_periods
audit_events
report_runs
report_snapshots
tax_adjustments
exchange_rates
```
Important relationships:
```text
entities 1---N outlets
entities 1---N users
outlets  1---N documents
documents 1---N extractions
documents 0/1---1 transactions
transactions 1---N journal_entries/lines
transactions 0/1---1 fixed_assets
entities 1---N accounting_periods
report_runs 1---1 report_snapshots
```
7. Document pipeline
The preferred pipeline is:
```text
Upload
  |
  v
File validation
  |
  v
Immutable document storage
  |
  v
OCR / Gemini extraction
  |
  v
Schema validation
  |
  v
Normalization
  |
  v
Arithmetic validation
  |
  v
Duplicate detection
  |
  v
Confidence scoring
  |
  +---- low confidence / conflict ----> Human review
  |
  v
Verified document
  |
  v
Accounting transaction
  |
  v
Tax classification
  |
  v
Reports / exports
```
OCR should never directly write a "final approved" accounting transaction.
8. Separation of concerns
Document service
Responsible for:
file metadata,
immutable original evidence,
document lifecycle,
OCR request orchestration.
OCR service
Responsible for:
prompt/schema,
extraction,
normalization,
confidence/evidence,
provider integration.
It must not decide final tax deductibility.
Validation service
Responsible for:
schema validation,
arithmetic validation,
duplicate checks,
required-field checks,
tax consistency checks.
Accounting service
Responsible for:
transaction creation,
classification,
journal generation,
period assignment,
accounting treatment.
Tax engine
Responsible for:
GST treatment,
income-tax treatment,
adjustments,
capital allowances,
effective-dated rules,
report calculations.
Reporting service
Responsible for:
MIRA-oriented output,
XLSX generation,
report snapshots,
reconciliation,
export metadata.
9. Tax calculation architecture
Tax rules must be data-driven.
Do not embed a large set of mutable tax rules inside route handlers.
Prefer:
```text
Tax Rule
  - jurisdiction
  - tax type
  - rule code
  - effective from
  - effective to
  - rate/threshold
  - applicability
  - source reference
  - version
```
Then:
```text
Transaction
   |
   v
Applicable rule set
   |
   v
Tax treatment
   |
   v
Calculation
   |
   v
Adjustment/review
   |
   v
Report snapshot
```
10. Multi-outlet design
Outlet filtering must be enforced at the backend/data-access layer.
A request such as:
```text
GET /api/bills?outlet_id=OUTLET-004
```
must never be trusted merely because the browser supplied `outlet_id`.
The server should derive the permitted outlet scope from the authenticated user and enforce it in the query.
Super-admin aggregation can operate across outlets, but reports must preserve outlet attribution.
11. Multi-taxpayer design
The application should evolve from the current `taxpayerProfile` setting into a true entity model.
Target:
```text
Entity
  id
  legal_name
  entity_type
  TIN
  GST registration details
  accounting period
  presentation currency
  status
```
`COMPANY` and `SOLE_PROPRIETOR` are business/entity modes, not merely UI preferences.
12. Reporting and snapshot architecture
A report should be reproducible.
When a user generates a tax report:
```text
Report request
   |
   v
Resolve entity + period
   |
   v
Resolve approved transactions
   |
   v
Apply effective tax rules
   |
   v
Run validations/reconciliation
   |
   v
Generate report
   |
   v
Create immutable report snapshot
```
Historical report snapshots must not silently change when a new rule or later transaction is added.
13. Storage architecture
Current
JSON files + local uploaded files.
This is acceptable for development but unsafe as the long-term financial data store.
Target
```text
PostgreSQL
  |
  +-- relational accounting/tax data

Object storage
  |
  +-- original bill images/PDFs

Application server
  |
  +-- business logic/API

AI provider
  |
  +-- OCR/extraction only
```
The database should store object-storage references and hashes rather than large binary documents.
14. Audit architecture
Audit events should be append-oriented.
Examples:
```text
DOCUMENT_UPLOADED
OCR_COMPLETED
DOCUMENT_REVIEWED
FIELD_CORRECTED
DOCUMENT_APPROVED
DOCUMENT_REJECTED
TRANSACTION_CREATED
TRANSACTION_RECLASSIFIED
TAX_ADJUSTMENT_CREATED
REPORT_GENERATED
REPORT_FINALIZED
PERIOD_LOCKED
```
Each event should record:
timestamp,
actor,
entity,
outlet where applicable,
affected record,
action,
previous state/hash where appropriate,
new state/hash where appropriate.
15. Security architecture
Required controls for production:
secure password hashing,
secure session/token handling,
server-side authorization,
CSRF protection where applicable,
upload MIME/type validation,
image/PDF size limits,
path traversal protection,
rate limiting,
security headers,
structured audit logging,
secret management,
encrypted transport,
encrypted backups,
database least privilege.
16. Deployment architecture
Recommended production layout:
```text
Internet
   |
Reverse proxy / TLS
   |
Web application
   |
   +--> PostgreSQL
   |
   +--> Object storage
   |
   +--> Gemini API
```
Backups:
```text
PostgreSQL backup
+
Object storage backup
+
Application configuration backup
+
Tax-rule/version metadata
+
Report snapshots
```
17. Architectural invariants
The following must remain true:
Original evidence is never replaced by OCR output.
OCR output is not automatically equivalent to verified accounting data.
Accounting classification and tax treatment remain separate.
Outlet/entity ownership is explicit.
Tax rules are effective-dated.
Historical reports are reproducible.
Manual corrections are auditable.
Authorization is enforced server-side.
Regulatory assumptions are documented.
Database migration must preserve financial history.