AI Development Rules
Project: CR Maldives Purchase Bills Entry  
Repository: `ibreez/CR-Maldives-Purchase-Bills-Entry`  
Status: Development governance document  
Last reviewed: 2026-08-13
1. Purpose
This document defines the rules that AI coding agents and human developers must follow when modifying this repository.
The application is a Maldives-focused purchase-document, GST input-tax, expense, revenue, fixed-asset, and income-tax support system. It currently uses a React/Vite frontend, an Express/TypeScript backend, Gemini for document extraction, XLSX generation, and JSON files for persistence.
The application must be treated as an accounting/compliance-support system, not as an autonomous tax authority or a substitute for professional review.
2. Source-of-truth hierarchy
When making a compliance-related decision, use this order:
Current MIRA Acts, Regulations, forms, instructions and official notices.
Current application requirements explicitly approved by the project owner.
Existing domain models and tested application behavior.
Existing implementation.
AI-generated assumptions.
Never allow an AI agent to invent a tax rule merely because it seems reasonable.
If a rule cannot be verified, mark it as `REVIEW_REQUIRED` / `NEEDS_REVIEW` or equivalent rather than silently applying it.
3. Regulatory safety rules
3.1 GST
Do not hard-code a tax rate unless the rate is explicitly effective for the relevant date and regime.
Do not assume every purchase document carries deductible input tax.
Preserve the distinction between:
taxable value,
GST amount,
gross invoice total,
tax-inclusive pricing,
zero-rated,
exempt,
out-of-scope,
no-input-tax transactions.
Validate supplier and invoice information before treating GST as claimable.
Preserve the original uploaded document and the extracted/verified values separately.
Never overwrite OCR output with a user edit without retaining an audit trail.
3.2 Income tax
Keep accounting classification separate from income-tax treatment.
Do not equate an accounting expense with a tax-deductible expense automatically.
Capital expenditure must be capable of being routed to the fixed-asset/capital-allowance workflow.
Non-deductible items must be explicitly classified and traceable to the underlying transaction.
Tax calculations must be based on effective-dated rules and identifiable source material.
Generated MIRA 604-related figures must be presented as calculated/supporting figures unless the system has verified the exact current filing schema.
4. AI/OCR rules
4.1 Extraction is probabilistic
Gemini/OCR output is an extraction candidate, not authoritative accounting data.
Every important extracted field should have:
value,
confidence,
source/evidence label where available,
validation result,
review state.
Low-confidence or contradictory fields must be sent to review.
4.2 Semantic field matching
The OCR prompt and parser must recognize equivalent labels and context, not only exact strings.
Examples:
Canonical field	Possible document labels
Invoice number	Invoice No, Bill No, Document No, Receipt No, Ref No, Inv #
Invoice date	Date, Issue Date, Bill Date, Transaction Date
Supplier TIN	TIN, GSTIN, Tax ID, Tax Registration No
GST amount	GST, TGST, Tax, VAT, Tax Amount
Taxable value	Subtotal, Net Amount, Amount Before Tax, Taxable Amount
Total	Grand Total, Total Due, Amount Payable, Net Payable
The model should infer from layout and surrounding context when labels are missing.
4.3 Handwritten/local-market documents
The system must support handwritten purchase records as a distinct document type.
For handwritten documents:
lower OCR confidence,
extract only values supported by visible evidence,
do not fabricate supplier TINs or invoice numbers,
allow `null` for unavailable fields,
require review when required accounting/GST information is absent or ambiguous,
retain the original image.
4.4 Arithmetic validation
After extraction, calculate consistency checks where possible:
line-item subtotal vs extracted subtotal,
taxable value + GST ± rounding vs invoice total,
GST rate vs GST amount,
duplicate invoice/document detection,
date validity,
negative/invalid monetary values,
missing required fields.
A mathematically inconsistent document must not be silently approved.
5. Data integrity rules
Monetary values must not be handled with floating-point arithmetic where exact accounting precision matters. Use decimal-safe calculations or integer minor units in the persistent accounting layer.
IDs must be unique and stable.
Original uploaded files must be immutable after upload.
Verified data must be separate from raw OCR data.
Every material manual correction must be auditable.
Deletion of accounting documents should be soft-delete or controlled archival unless a regulatory/legal retention policy explicitly permits permanent deletion.
Never lose the relationship between:
`entity -> outlet -> document -> transaction -> tax treatment -> report`.
6. Multi-entity and multi-outlet rules
The application supports multiple outlets and taxpayer profiles.
Every financial document/transaction must have an unambiguous ownership context:
taxpayer/entity,
outlet,
reporting period,
uploader,
source document.
Do not rely on outlet name strings as the primary relational key.
Do not aggregate different taxpayers merely because they share an outlet name or database.
7. Authentication and authorization
Server-side authorization is mandatory; hiding UI controls is not authorization.
`super_admin` and `outlet_user` permissions must be enforced on every relevant API endpoint.
Outlet users must not be able to read or modify another outlet's records unless explicitly authorized.
Sessions/tokens must be protected against predictable IDs, leakage and replay.
Passwords must never be stored in plaintext.
Secrets must never be committed to Git.
Gemini API credentials must remain server-side.
8. Gemini/API privacy
Only send the minimum necessary document data to the AI provider.
Before sending an image/document:
verify that the request is authorized,
avoid unnecessary personal/customer information,
avoid logging raw base64 images,
avoid logging API secrets,
avoid storing provider responses containing sensitive information unnecessarily.
Provider data-retention and training behavior must be verified against the current Google/Gemini service terms and project configuration before making privacy claims.
9. Database migration rules
The current repository uses JSON persistence. PostgreSQL is the target production persistence layer.
When migrating:
do not change business meaning merely to fit a schema,
preserve original document IDs where possible,
preserve audit history,
preserve timestamps,
preserve outlet/entity relationships,
migrate uploaded-document metadata independently from binary object storage,
add database constraints for uniqueness and referential integrity,
use transactions for financial state changes,
implement migrations as versioned, repeatable deployment artifacts.
10. API rules
API changes must document:
endpoint,
HTTP method,
authentication requirement,
authorization scope,
request schema,
response schema,
validation behavior,
error behavior,
audit behavior.
Avoid returning internal stack traces, file-system paths, API keys or sensitive records.
11. Testing rules
Any tax, accounting, OCR-validation, aggregation or authorization change must include tests.
Minimum test categories:
unit tests for calculations,
boundary tests for tax rates/effective dates,
OCR normalization tests,
malformed-document tests,
duplicate detection tests,
authorization tests,
multi-outlet isolation tests,
report reconciliation tests,
migration tests once PostgreSQL is introduced.
For compliance calculations, include known expected examples from official MIRA material.
12. Reporting rules
Reports must distinguish:
source data,
calculated values,
adjustments,
user overrides,
final report values.
Every generated tax report should be reproducible from a defined reporting period and dataset snapshot.
Do not mutate historical transactions merely because a newer tax rule has been introduced.
13. Change-management rules
For every significant change:
Read `ARCHITECTURE.md`.
Read `REGULATORY_SOURCES.md`.
Read `IMPLEMENTATION_STATUS.md`.
Inspect the affected source code and types.
Identify regulatory and data-integrity impact.
Implement the smallest safe change.
Add/update tests.
Run type-check, tests and build.
Update documentation/status.
Review the diff for accidental changes.
14. AI-agent prohibition list
An AI agent must not:
invent MIRA form fields,
invent tax rates,
silently classify ambiguous documents,
delete original evidence,
expose secrets,
bypass authorization,
modify production data without explicit authorization,
claim "MIRA compliant" without evidence,
treat OCR confidence as accounting approval,
replace a verified manual correction with a later OCR result,
change historical tax calculations without an effective-date rule,
introduce a new dependency without checking its security/license/maintenance implications.
15. Definition of done
A compliance-sensitive feature is not complete until:
implementation exists,
validation exists,
tests exist,
authorization is verified,
audit behavior is defined,
regulatory source is recorded,
status is updated,
build/test checks pass.