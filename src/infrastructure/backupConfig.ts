/**
 * Phase 46 — Production Database Backup and Point-in-Time Recovery Configuration
 *
 * Configures database backups, retention policies, checksum validation, and recovery runbooks.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface BackupPolicy {
  retentionDailyDays: number;
  retentionWeeklyWeeks: number;
  retentionMonthlyMonths: number;
  compression: 'gzip' | 'zstd' | 'none';
  encryption: 'aes-256-gcm' | 'none';
  targetDirectory: string;
  walArchiveDirectory: string;
}

export interface BackupManifest {
  backupId: string;
  timestamp: string;
  databaseName: string;
  environment: string;
  backupType: 'FULL' | 'INCREMENTAL' | 'WAL_ARCHIVE';
  fileName: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  compression: string;
  schemaVersion: string;
  tablesIncluded: string[];
}

export const DEFAULT_BACKUP_POLICY: BackupPolicy = {
  retentionDailyDays: 7,
  retentionWeeklyWeeks: 4,
  retentionMonthlyMonths: 12,
  compression: 'gzip',
  encryption: 'aes-256-gcm',
  targetDirectory: './data/backups',
  walArchiveDirectory: './data/wal_archives'
};

export class BackupManager {
  private policy: BackupPolicy;

  constructor(policy: Partial<BackupPolicy> = {}) {
    this.policy = { ...DEFAULT_BACKUP_POLICY, ...policy };
  }

  public getPolicy(): BackupPolicy {
    return { ...this.policy };
  }

  /**
   * Generates a structured backup manifest for an exported database archive.
   */
  public createManifest(
    backupId: string,
    fileName: string,
    fileSizeBytes: number,
    sha256Checksum: string,
    options?: {
      databaseName?: string;
      environment?: string;
      backupType?: 'FULL' | 'INCREMENTAL' | 'WAL_ARCHIVE';
      schemaVersion?: string;
      tablesIncluded?: string[];
    }
  ): BackupManifest {
    return {
      backupId,
      timestamp: new Date().toISOString(),
      databaseName: options?.databaseName || 'crmaldives',
      environment: options?.environment || process.env.NODE_ENV || 'production',
      backupType: options?.backupType || 'FULL',
      fileName,
      fileSizeBytes,
      sha256Checksum,
      compression: this.policy.compression,
      schemaVersion: options?.schemaVersion || '20260813000000_init_phase20_schema',
      tablesIncluded: options?.tablesIncluded || [
        'Tenant', 'User', 'Taxpayer', 'Document', 'Invoice', 'Account',
        'AccountingPeriod', 'Journal', 'GSTTransaction', 'NWTTransaction',
        'FixedAsset', 'TaxAdjustment', 'MIRAReturn', 'AuditEvent'
      ]
    };
  }

  /**
   * Verifies the cryptographic integrity and presence of a backup archive.
   */
  public verifyBackupFile(filePath: string, expectedChecksum?: string): {
    valid: boolean;
    fileSizeBytes: number;
    calculatedChecksum: string;
    error?: string;
  } {
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        fileSizeBytes: 0,
        calculatedChecksum: '',
        error: `Backup file does not exist: ${filePath}`
      };
    }

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const calculatedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      if (expectedChecksum && calculatedChecksum !== expectedChecksum) {
        return {
          valid: false,
          fileSizeBytes: fileBuffer.length,
          calculatedChecksum,
          error: `Checksum mismatch! Expected: ${expectedChecksum}, Calculated: ${calculatedChecksum}`
        };
      }

      return {
        valid: true,
        fileSizeBytes: fileBuffer.length,
        calculatedChecksum
      };
    } catch (err: any) {
      return {
        valid: false,
        fileSizeBytes: 0,
        calculatedChecksum: '',
        error: err.message || 'Failed to read backup file'
      };
    }
  }

  /**
   * Cleans up expired backups according to retention policy.
   */
  public pruneOldBackups(backupDir?: string): { retained: number; deleted: number } {
    const dir = backupDir || this.policy.targetDirectory;
    if (!fs.existsSync(dir)) {
      return { retained: 0, deleted: 0 };
    }

    const files = fs.readdirSync(dir);
    const now = Date.now();
    const maxAgeMs = this.policy.retentionDailyDays * 24 * 60 * 60 * 1000;

    let retained = 0;
    let deleted = 0;

    for (const file of files) {
      if (file.endsWith('.sql.gz') || file.endsWith('.dump') || file.endsWith('.json')) {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          deleted++;
        } else {
          retained++;
        }
      }
    }

    return { retained, deleted };
  }
}

export const backupManager = new BackupManager();
