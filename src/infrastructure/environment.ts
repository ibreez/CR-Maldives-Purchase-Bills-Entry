/**
 * Phase 46 — Production Infrastructure Environment Configuration
 *
 * Manages environment-specific configuration across Development, Staging, and Production.
 * Enforces validation, safe fallbacks, and prevents development-only assumptions.
 */

export type EnvironmentName = 'development' | 'staging' | 'production' | 'test';

export interface EnvironmentConfig {
  env: EnvironmentName;
  port: number;
  databaseUrl: string;
  databasePoolMin: number;
  databasePoolMax: number;
  databaseTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  appUrl: string;
  corsOrigin: string;
  sessionSecret: string;
  geminiApiKey?: string;
  backupStorageDir: string;
  backupRetentionDays: number;
  requestTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

/**
 * Validates and resolves environment configuration from process.env or explicit overrides.
 */
export function resolveEnvironmentConfig(overrides?: Record<string, string | undefined>): EnvironmentConfig {
  const envVars = overrides || process.env;

  const rawEnv = (envVars.NODE_ENV || 'development').toLowerCase();
  const env: EnvironmentName =
    rawEnv === 'production' || rawEnv === 'staging' || rawEnv === 'test'
      ? rawEnv
      : 'development';

  const isProduction = env === 'production';
  const isStaging = env === 'staging';
  const isDevelopment = env === 'development';
  const isTest = env === 'test';

  const port = parseInt(envVars.PORT || '3000', 10);

  // Database URL resolution
  let databaseUrl = envVars.DATABASE_URL;
  if (!databaseUrl) {
    if (isProduction || isStaging) {
      // In production/staging, a real database URL must be configured
      throw new Error(`[Configuration Error] DATABASE_URL must be defined in ${env} environment.`);
    }
    // Safe local default for dev/test
    databaseUrl = 'postgresql://postgres:postgres@localhost:5432/crmaldives?schema=public';
  }

  // Database Connection Pool settings
  const databasePoolMin = parseInt(envVars.DATABASE_POOL_MIN || (isProduction ? '5' : '1'), 10);
  const databasePoolMax = parseInt(envVars.DATABASE_POOL_MAX || (isProduction ? '20' : '5'), 10);
  const databaseTimeoutMs = parseInt(envVars.DATABASE_TIMEOUT_MS || '10000', 10);

  // Logging level
  let logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
  if (envVars.LOG_LEVEL) {
    const rawLevel = envVars.LOG_LEVEL.toLowerCase();
    if (rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error') {
      logLevel = rawLevel;
    }
  } else if (isDevelopment || isTest) {
    logLevel = 'debug';
  }

  // Session & Security secrets
  let sessionSecret = envVars.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) {
      throw new Error('[Configuration Error] SESSION_SECRET must be defined in production.');
    }
    sessionSecret = 'dev-insecure-session-secret-change-in-production';
  }

  const appUrl = envVars.APP_URL || (isProduction ? 'https://app.crmaldives.com' : `http://localhost:${port}`);
  const corsOrigin = envVars.CORS_ORIGIN || (isProduction ? appUrl : '*');
  const geminiApiKey = envVars.GEMINI_API_KEY;

  const backupStorageDir = envVars.BACKUP_STORAGE_DIR || './data/backups';
  const backupRetentionDays = parseInt(envVars.BACKUP_RETENTION_DAYS || '30', 10);
  const requestTimeoutMs = parseInt(envVars.REQUEST_TIMEOUT_MS || '30000', 10);
  const rateLimitWindowMs = parseInt(envVars.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const rateLimitMaxRequests = parseInt(envVars.RATE_LIMIT_MAX_REQUESTS || (isProduction ? '100' : '1000'), 10);

  return {
    env,
    port,
    databaseUrl,
    databasePoolMin,
    databasePoolMax,
    databaseTimeoutMs,
    logLevel,
    appUrl,
    corsOrigin,
    sessionSecret,
    geminiApiKey,
    backupStorageDir,
    backupRetentionDays,
    requestTimeoutMs,
    rateLimitWindowMs,
    rateLimitMaxRequests,
    isProduction,
    isStaging,
    isDevelopment,
    isTest
  };
}

/**
 * Returns a sanitized copy of configuration safe for logging or diagnostics (masks secrets).
 */
export function getSanitizedConfig(config: EnvironmentConfig): Record<string, any> {
  return {
    env: config.env,
    port: config.port,
    databaseUrl: maskDatabaseUrl(config.databaseUrl),
    databasePoolMin: config.databasePoolMin,
    databasePoolMax: config.databasePoolMax,
    databaseTimeoutMs: config.databaseTimeoutMs,
    logLevel: config.logLevel,
    appUrl: config.appUrl,
    corsOrigin: config.corsOrigin,
    sessionSecret: '[REDACTED]',
    hasGeminiKey: Boolean(config.geminiApiKey),
    backupStorageDir: config.backupStorageDir,
    backupRetentionDays: config.backupRetentionDays
  };
}

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'postgresql://[REDACTED]';
  }
}

// Global active instance
let activeConfig: EnvironmentConfig | null = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!activeConfig) {
    activeConfig = resolveEnvironmentConfig();
  }
  return activeConfig;
}

export function setEnvironmentConfig(config: EnvironmentConfig): void {
  activeConfig = config;
}
