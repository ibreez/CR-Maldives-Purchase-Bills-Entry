Regulatory Sources
Project: CR Maldives Purchase Bills Entry  
Purpose: Central register of authoritative Maldives regulatory sources used by the application  
Last reviewed: 2026-08-13
> This file records source material and implementation implications. It is not legal or tax advice. MIRA publications can change; developers must re-check the current official source before implementing a new compliance rule.
1. Primary authority
Maldives Inland Revenue Authority (MIRA)
Official website:
https://www.mira.gov.mv/
Use MIRA as the primary source for:
tax Acts and Regulations,
tax forms,
filing instructions,
tax rates,
tax rulings/notices,
taxpayer guidance.
2. GST sources
2.1 Goods and Services Tax Act
Official source:  
https://www.mira.gov.mv/Legislations/View/Goods-And-Services-Act-consolidated
Relevant areas include:
GST return information,
input tax,
tax invoices,
receipts,
credit/debit notes,
record keeping.
The Act specifies that GST returns include, among other information, the taxable period, output tax, input tax allowed and tax payable after adjustments.
It also specifies required tax-invoice particulars such as seller/purchaser information, invoice number/date, goods/services details, value before tax, tax charged and tax-inclusive total.
2.2 GST Regulation
Official source:  
https://www.mira.gov.mv/Files/GetFile/4cf95112-918e-48b4-a594-cb91378100a9
The consolidated regulation contains operational requirements including supporting documents for GST returns and Input Tax Statements.
2.3 Current Input Tax Statement
Official source:  
https://www.mira.gov.mv/Forms/View/input-tax-statement-v.25.1
MIRA states that an Input Tax Statement must be submitted with the GST Return when input tax is claimed.
Implementation requirement:
The application must keep the Input Tax Statement schema/version configurable and must not assume that an old Excel column layout remains current indefinitely.
2.4 Tax invoice guidance
Official source:  
https://mira.gov.mv/Pages/View/gsttaxinvoice
Use this page when validating the expected tax-invoice fields and invoice presentation.
3. Income Tax sources
3.1 Income Tax Act
Official source:  
https://www.mira.gov.mv/Legislations/View/Incometaxact
The Act governs income tax in Maldives and includes requirements concerning filing of tax returns and payments.
Implementation requirement:
Income-tax calculations must be based on the effective law for the relevant tax year/accounting period.
3.2 Income Tax Regulation
Official source:  
https://www.mira.gov.mv/Legislations/View/Income-Tax-Regulation
The consolidated regulation contains detailed rules for administration of income tax.
Relevant areas include:
Income Tax Return,
MIRA 604,
financial statements,
filing requirements,
presentation currency,
accounting periods,
tax administration procedures.
The regulation identifies MIRA 604 as the standard Income Tax Return form, subject to specified exceptions.
3.3 MIRA Income Tax filing guidance
Official source:  
https://mira.gov.mv/Pages/View/ictindividualshowtofile
Use the current MIRA guidance for:
filing method,
MIRA 604,
applicable submission requirements,
supporting documents,
online filing requirements.
4. Tax administration and records
4.1 Tax Administration Regulation
Official source:  
https://www.mira.gov.mv/Legislations/View/Tax-Administration-Regulation-consolidated
The regulation requires sufficient records to ascertain income, expenditure, capital allowances, tax credits, output tax, input tax, GST adjustments and other tax obligations.
It includes records such as:
assets and liabilities,
day-to-day money received/expended,
invoices and receipts,
payment vouchers,
credit/debit notes,
journals and ledgers.
Implementation requirement:
The system must be designed as a record-management system, not merely an OCR export tool.
5. Important historical source
Documents submitted with GST return — historical/repealed ruling
Official source:  
https://www.mira.gov.mv/Legislations/View/Document-submission-with-GST-return-G28
This ruling is marked by MIRA as repealed.
It may be useful for understanding the historical evolution of Input/Output Tax Statement requirements, but it must not be treated as the current compliance rule when a newer Act, Regulation, form or instruction exists.
6. Source governance
Every tax rule implemented in code should have:
```text
rule_id
tax_type
description
effective_from
effective_to
source_title
source_url
source_section
verified_on
implementation_status
```
Example:
```text
rule_id: GST.INPUT_TAX_STATEMENT
tax_type: GST
source_title: Input Tax Statement v25.1
source_url: MIRA official form page
verified_on: 2026-08-13
```
7. Regulatory change procedure
When MIRA changes a form, rate, threshold or rule:
Add the new official source.
Record the effective date.
Identify affected calculations.
Identify affected reports/templates.
Add regression tests.
Preserve historical behavior for prior periods.
Update the tax-rule version.
Update `IMPLEMENTATION_STATUS.md`.
Reconcile generated output against the current MIRA form.
8. Compliance boundaries
The application may:
capture source documents,
extract information,
validate information,
classify transactions,
calculate supporting figures,
generate reports/exports,
highlight potential compliance issues.
The application must not claim that a generated report is legally accepted by MIRA unless the current filing format and submission process have been explicitly verified.