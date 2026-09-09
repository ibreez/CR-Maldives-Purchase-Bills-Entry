# Phase 46 — Production Infrastructure Specification & Operations Guide

## 1. Overview & Architecture

This document defines the deployment, environments, PostgreSQL persistence, telemetry, and operations architecture for the **Maldives Multi-Outlet Purchase Bills Entry & Statutory Tax Compliance Platform**.

The architecture adheres to zero-downtime deployment principles, strict statutory auditability, and defense-in-depth security standards.

---

## 2. Environments Topology

| Specification | Development | Staging (Pre-Prod) | Production |
| :--- | :--- | :--- | :--- |
| **Target Runtime** | Local Node.js / tsx dev server | Containerized Cloud Run / K8s | Clustered Containerized Cloud Run / K8s |
| **Node Environment** | `NODE_ENV=development` | `NODE_ENV=staging` | `NODE_ENV=production` |
| **Database Engine** | Local PostgreSQL 16 / Docker | Managed Cloud SQL PostgreSQL 16 | High-Availability Clustered Cloud SQL |
| **Connection Pool** | Min: 1, Max: 5 | Min: 5, Max: 15 | Min: 5, Max: 20 |
| **Log Level** | `debug` | `info` | `info` (or `warn` in high-throughput) |
| **Error Handling** | Full stack traces returned in API | Sanitized errors; correlation logged | Sanitized errors; correlation logged |
| **Backup Cadence** | On-demand snapshots | Daily automated snapshot (14d) | Continuous WAL archiving + Daily (30d) |
| **SSL / TLS** | Optional (HTTP localhost) | Enforced TLS 1.3 | Enforced TLS 1.3 + HSTS |

### 2.1 Development Environment
- Focused on developer ergonomics and instant feedback.
- Uses Vite HMR / middleware proxying via `tsx server.ts`.
- Local directory persistence fallback for quick prototyping.

### 2.2 Staging Environment
- Mirrors production infrastructure, configuration flags, and container build.
- Exercises live PostgreSQL migrations, read/write failover simulations, and integration gatekeeping.
- Pre-filing packages and MIRA returns generated with official test taxpayer profiles.

### 2.3 Production Environment
- High-availability container execution behind an ingress reverse proxy.
- Direct database credentials forbidden; secrets injected via cloud secret managers.
- Zero-downtime blue/green or rolling container replacement with health/readiness probe validation.

---

## 3. Environment Variables Dictionary

All variables must be documented in `.env.example`. **Production credentials must never be committed to the code repository.**

| Variable | Required In | Type | Description / Constraints |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | All | Enum | `development`, `staging`, `production`, `test` |
| `PORT` | All | Number | Hardcoded to `3000` for ingress proxy routing |
| `DATABASE_URL` | Staging / Prod | String (URI) | PostgreSQL connection string (`postgresql://user:pass@host:5432/db?sslmode=require`) |
| `DATABASE_POOL_MIN` | Production | Number | Minimum pooled connections per container (default: `5`) |
| `DATABASE_POOL_MAX` | Production | Number | Maximum pooled connections per container (default: `20`) |
| `DATABASE_TIMEOUT_MS` | Production | Number | Connection timeout in milliseconds (default: `10000`) |
| `SESSION_SECRET` | Staging / Prod | String | 32+ character high-entropy secret for cookie/session signing |
| `LOG_LEVEL` | All | Enum | `debug`, `info`, `warn`, `error` |
| `APP_URL` | Staging / Prod | String (URL) | Canonical root URL (e.g. `https://app.crmaldives.com`) |
| `CORS_ORIGIN` | Production | String | Whitelisted CORS origin or comma-separated origins |
| `GEMINI_API_KEY` | Optional | String | Secret API key for Gemini OCR extraction (server-side only) |
| `BACKUP_STORAGE_DIR`| Production | String | Path to persistent volume for database dump archives |
| `BACKUP_RETENTION_DAYS`| Production | Number | Daily backup retention window (default: `30`) |

---

## 4. PostgreSQL Persistence & Schema Management

The database layer utilizes **PostgreSQL 16** managed through **Prisma ORM** (`src/db/schema.prisma`).

### 4.1 Schema Scope
The database schema encompasses all 14 statutory modules:
- Multi-tenancy (`Tenant`, `User`, `UserTenant`, `Role`, `Permission`)
- Financial documents & purchase bills (`Document`, `Invoice`, `Supplier`, `BillRecord`)
- Accounting General Ledger (`Account`, `AccountingPeriod`, `Journal`, `JournalEntry`, `PeriodLock`)
- GST Subledgers (`GSTTransaction`, `GSTPeriod`)
- Non-Resident Withholding Tax (`NWTTransaction`, `NWTPeriod`)
- Capital Allowances & Fixed Assets (`FixedAsset`, `LegacyFixedAsset`)
- Statutory Income Tax & Losses (`TaxAdjustment`, `TaxLoss`, `TaxCalculation`, `MIRAReturn`)
- Statutory Audit & Traceability (`AuditEvent`, `OCRFieldEvidence`, `Reconciliation`)

### 4.2 Database Migrations & Versioning
- Migrations reside under `src/db/migrations/<timestamp>_<name>/migration.sql`.
- Each migration is tracked with an immutable SHA-256 checksum in `migrationRunner.ts`.
- Deployment command:
  ```bash
  npm run db:migrate
  ```
- Verification status command:
  ```bash
  npm run db:status
  ```

---

## 5. Health & Readiness Probes (Ingress & Orchestration)

The server exposes dedicated endpoints adhering to standard container orchestration probe specifications:

### 5.1 Liveness Probe: `GET /api/health` and `GET /health`
- **Purpose**: Verifies that the Node.js process is active, responding to HTTP requests, and the event loop is healthy.
- **Probe Interval**: 15s; timeout 5s; retries: 3.
- **Response**: HTTP 200 OK
  ```json
  {
    "status": "ok",
    "liveness": "UP",
    "uptimeSeconds": 142,
    "timestamp": "2026-09-04T07:25:00.000Z",
    "version": "1.0.0",
    "environment": "production"
  }
  ```

### 5.2 Readiness Probe: `GET /api/ready` and `GET /ready`
- **Purpose**: Verifies downstream dependencies before routing incoming user traffic:
  1. PostgreSQL database connectivity via `SELECT 1` ping.
  2. Persistent storage volume writeability (`data/` directory).
  3. Memory consumption thresholds.
- **Healthy Response**: HTTP 200 OK
  ```json
  {
    "status": "ready",
    "timestamp": "2026-09-04T07:25:00.000Z",
    "checks": {
      "database": "UP",
      "storage": "UP",
      "memory": "UP"
    }
  }
  ```
- **Degraded / Failing Response**: HTTP 503 Service Unavailable
  ```json
  {
    "status": "not_ready",
    "timestamp": "2026-09-04T07:25:00.000Z",
    "checks": {
      "database": "DOWN",
      "storage": "UP",
      "memory": "UP"
    },
    "error": "Database unreachable: connection timed out"
  }
  ```

---

## 6. Structured Logging & Telemetry

Production logging uses **RFC-5424 structured JSON lines** streamed to `process.stdout` and `process.stderr`.

### 6.1 Format Specification
```json
{
  "timestamp": "2026-09-04T07:25:00.123Z",
  "level": "info",
  "message": "HTTP POST /api/filing/package/ready-for-filing",
  "service": "cr-maldives-tax-engine",
  "correlationId": "req-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tenantId": "TENANT-001",
  "durationMs": 48,
  "http": {
    "method": "POST",
    "path": "/api/filing/package/ready-for-filing",
    "statusCode": 200,
    "clientIp": "192.168.1.100"
  }
}
```

### 6.2 Sensitive Data Redaction
The logger automatically masks fields matching sensitive patterns (`password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`) with `[REDACTED]` to prevent credential or PII leaks.

---

## 7. Request Correlation IDs

Every inbound HTTP request is tagged with an end-to-end correlation ID:
- Inspected from incoming `X-Correlation-ID` or `X-Request-ID` headers.
- If absent, generated automatically using `req-${crypto.randomUUID()}`.
- Propagated to:
  - `req.correlationId`
  - Response headers: `X-Correlation-ID: req-xxxx` and `X-Request-ID: req-xxxx`
  - All downstream structured log entries and audit events
  - All client error responses

---

## 8. Centralized Error Handling & Security Sanitization

- **Middleware**: `centralizedErrorHandler` in `src/infrastructure/errorHandler.ts`.
- In `development`, error responses provide full debug stack traces and error metadata.
- In `staging` and `production`, server errors (HTTP 500) are sanitized into a generic message:
  ```json
  {
    "success": false,
    "error": "An unexpected internal error occurred. Please contact support with the correlation ID.",
    "correlationId": "req-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "statusCode": 500
  }
  ```
  Internal database connection strings, SQL table names, and server file paths are completely hidden from API consumers.

---

## 9. Containerization & Docker Configuration

The production image uses a **multi-stage build** (`Dockerfile`):

1. **Builder Stage (`node:22-alpine`)**:
   - Installs build tools and dependencies.
   - Generates Prisma client bindings.
   - Compiles frontend assets with Vite.
   - Bundles backend server with esbuild into a standalone CommonJS bundle `dist/server.cjs`.

2. **Runner Stage (`node:22-alpine`)**:
   - Strips development dependencies.
   - Runs as non-root user `nodejs` (UID 1001).
   - Bundles `dumb-init` for proper Linux signal forwarding (PID 1).
   - Enforces container healthcheck.

### 9.1 Local Staging Stack (`docker-compose.yml`)
Run the full production-like topology locally with:
```bash
docker compose up --build
```
This boots both the PostgreSQL 16 container and the production-built application container.

---

## 10. Database Backup & Disaster Recovery

### 10.1 Automated Backup Script
Run automated backups via:
```bash
npm run db:backup
```
- Performs `pg_dump` with gzip compression (`.sql.gz`).
- Computes SHA-256 cryptographic digest.
- Emits a JSON manifest detailing backup ID, timestamp, size, checksum, and table scope.
- Automatically purges snapshots exceeding the retention policy (default: 30 days).

### 10.2 Retention Tiering
- **Daily**: Retained for 7 days.
- **Weekly**: Retained for 4 weeks.
- **Monthly**: Retained for 12 months.

---

## 11. Zero-Downtime Migration Deployment Runbook

### Pre-Deployment
1. Validate migration scripts in staging against a recent database snapshot.
2. Confirm backward-compatibility (expand-and-contract pattern: add columns/tables first, deprecate old columns after deployment).

### Deployment Steps
1. Execute schema migrations:
   ```bash
   npm run db:migrate
   ```
2. Verify migration status:
   ```bash
   npm run db:status
   ```
3. Deploy new application container revision with health and readiness checks active.
4. Orchestrator routes traffic to new container only after `/api/ready` returns HTTP 200.
5. Terminate old container revision cleanly after active connections drain.
