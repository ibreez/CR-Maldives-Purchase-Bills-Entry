/**
 * Phase 46 — Production Database Health and Readiness Engine
 *
 * Monitors PostgreSQL connectivity, query latency, storage subsystems,
 * and handles health & readiness probe evaluation for orchestrators (Kubernetes / Cloud Run / Docker).
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../db/client.js';
import { logger } from './logger.js';

export type ComponentStatus = 'UP' | 'DOWN' | 'DEGRADED';

export interface DatabaseHealthResult {
  status: ComponentStatus;
  latencyMs: number;
  lastCheckedAt: string;
  database: string;
  error?: string;
}

export interface StorageHealthResult {
  status: ComponentStatus;
  writable: boolean;
  dataPath: string;
  error?: string;
}

export interface ReadinessCheckResult {
  status: 'ready' | 'degraded' | 'not_ready';
  timestamp: string;
  checks: {
    database: ComponentStatus;
    storage: ComponentStatus;
    memory: ComponentStatus;
  };
  details: {
    database: DatabaseHealthResult;
    storage: StorageHealthResult;
    memory: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
    };
  };
  error?: string;
}

export class DatabaseHealthService {
  private static instance: DatabaseHealthService;
  private simulationFailure: boolean = false;
  private simulationFailureReason: string = 'Simulated database failure for readiness probe verification';
  private lastResult: DatabaseHealthResult | null = null;

  private constructor() {}

  public static getInstance(): DatabaseHealthService {
    if (!DatabaseHealthService.instance) {
      DatabaseHealthService.instance = new DatabaseHealthService();
    }
    return DatabaseHealthService.instance;
  }

  /**
   * Enables or disables simulated database failure for readiness endpoint regression testing.
   */
  public setSimulationFailure(enabled: boolean, reason?: string): void {
    this.simulationFailure = enabled;
    if (reason) this.simulationFailureReason = reason;
  }

  public isSimulatingFailure(): boolean {
    return this.simulationFailure;
  }

  /**
   * Executes a lightweight database ping (SELECT 1) and calculates round-trip latency.
   */
  public async checkDatabaseHealth(): Promise<DatabaseHealthResult> {
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

    // 1. Check if simulation failure is active
    if (this.simulationFailure) {
      const result: DatabaseHealthResult = {
        status: 'DOWN',
        latencyMs: -1,
        lastCheckedAt: timestamp,
        database: 'postgresql',
        error: this.simulationFailureReason
      };
      this.lastResult = result;
      return result;
    }

    // 2. Real PostgreSQL ping via Prisma
    try {
      if (!prisma || typeof (prisma as any).$queryRawUnsafe !== 'function') {
        throw new Error('Prisma database client is not properly initialized');
      }

      // Execute ping with timeout
      await Promise.race([
        (prisma as any).$queryRawUnsafe('SELECT 1 AS ping'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database ping timed out after 3000ms')), 3000)
        )
      ]);

      const latencyMs = Date.now() - startTime;
      const status: ComponentStatus = latencyMs > 1000 ? 'DEGRADED' : 'UP';

      const result: DatabaseHealthResult = {
        status,
        latencyMs,
        lastCheckedAt: timestamp,
        database: 'postgresql'
      };
      this.lastResult = result;
      return result;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err?.message || 'Failed to connect to database';
      
      const result: DatabaseHealthResult = {
        status: 'DOWN',
        latencyMs,
        lastCheckedAt: timestamp,
        database: 'postgresql',
        error: errorMessage
      };
      this.lastResult = result;
      return result;
    }
  }

  /**
   * Verifies that the local or mounted persistent storage directory is writable.
   */
  public checkStorageHealth(): StorageHealthResult {
    const dataDir = path.join(process.cwd(), 'data');
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const testFile = path.join(dataDir, `.health-probe-${Date.now()}`);
      fs.writeFileSync(testFile, 'probe');
      fs.unlinkSync(testFile);

      return {
        status: 'UP',
        writable: true,
        dataPath: dataDir
      };
    } catch (err: any) {
      return {
        status: 'DOWN',
        writable: false,
        dataPath: dataDir,
        error: err?.message || 'Storage write test failed'
      };
    }
  }

  /**
   * Performs an overall readiness evaluation.
   */
  public async checkReadiness(): Promise<ReadinessCheckResult> {
    const timestamp = new Date().toISOString();
    const dbResult = await this.checkDatabaseHealth();
    const storageResult = this.checkStorageHealth();

    const memUsage = process.memoryUsage();
    const memoryDetails = {
      heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      rssMb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100
    };

    const isDbHealthy = dbResult.status === 'UP' || dbResult.status === 'DEGRADED';
    const isStorageHealthy = storageResult.status === 'UP';

    let overallStatus: 'ready' | 'degraded' | 'not_ready' = 'ready';
    let errorMessage: string | undefined;

    if (dbResult.status === 'DOWN' || storageResult.status === 'DOWN') {
      overallStatus = 'not_ready';
      errorMessage = dbResult.status === 'DOWN'
        ? `Database unreachable: ${dbResult.error || 'Connection failed'}`
        : `Storage unavailable: ${storageResult.error || 'Write test failed'}`;
    } else if (dbResult.status === 'DEGRADED') {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp,
      checks: {
        database: dbResult.status,
        storage: storageResult.status,
        memory: 'UP'
      },
      details: {
        database: dbResult,
        storage: storageResult,
        memory: memoryDetails
      },
      error: errorMessage
    };
  }
}

export const databaseHealthService = DatabaseHealthService.getInstance();
