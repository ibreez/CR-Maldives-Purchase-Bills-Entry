# Regulatory Change Protocol

**Project**: CR Maldives Purchase Bills Entry & Tax Compliance Engine  
**Standard**: Maldives Inland Revenue Authority (MIRA) Statutory Change Governance  
**Authority**: Institute of Chartered Accountants of the Maldives (CA Maldives) Guidelines  

---

## 1. Statutory Change Governance Workflow

To preserve statutory accuracy, backward compatibility, and audit integrity, no tax rate, bracket, formula, or schedule mapping may ever be modified by directly mutating a static constant (e.g. changing \`const GST_RATE = 0.17;\`).

All regulatory changes published by MIRA must strictly traverse the following 11-stage protocol:

```text
1. MIRA publishes change (Gazette / Tax Ruling / Circular / Form Update)
        ↓
2. Regulatory analyst reviews official source & legal citations
        ↓
3. Create RegulatoryChange record in version control
        ↓
4. Determine statutory effective date (e.g., 2025-07-01 for TGST 17%)
        ↓
5. Determine affected tax years and transitional cut-off rules
        ↓
6. Create new RegulatoryRule version (preserve historical rules)
        ↓
7. Create targeted regression tests for new rate/rule
        ↓
8. Run historical tests to verify past periods remain 100% invariant
        ↓
9. Run future-period tests to verify new behavior activates precisely on effective date
        ↓
10. Accredited accountant / licensed MIRA Tax Agent review & approval
        ↓
11. Activate rule in production engine
```

---

## 2. Invariant Rules for Developers & AI Agents

1. **Effective-Date Gating**:
   Every rate calculation must inspect the transaction date or invoice accounting date against the statutory effective date. For example:
   - **Tourism GST**: 16% for transactions dated prior to 1 July 2025; 17% for transactions dated on or after 1 July 2025.
   - **General GST**: 6% for transactions dated prior to 1 January 2023; 8% for transactions dated on or after 1 January 2023.
   - **Non-Resident Withholding Tax**: 10% for technical services / royalties; 5% for contractor agreements under Section 55.

2. **Historical Preservability**:
   Historical tax returns (MIRA 205, MIRA 206, MIRA 602, MIRA 604) must remain strictly reproducible. Filing an amended return for a prior period must evaluate according to the law in effect for that period.

3. **Form Schema Versioning**:
   When MIRA updates a statutory form (e.g. from v24.1 to v25.1), the new schema must be implemented as a separate versioned module under \`src/regulatory/forms/\`. Old schemas must remain accessible for prior tax years.

4. **Human Review Mandate**:
   Rules cannot be deployed to production without formal sign-off from a licensed MIRA Tax Agent or certified member of CA Maldives.
