import { PrismaClient } from '@prisma/client';
import {
  SEEDED_REGULATORY_RULES,
  MIRA_REGULATORY_VERSIONS
} from '../regulatory';

/**
 * Seeds MIRA regulatory rules and versions into the PostgreSQL database via Prisma.
 */
export async function seedRegulatoryDatabase(prisma?: PrismaClient): Promise<{
  rulesCount: number;
  versionsCount: number;
}> {
  const db = prisma ?? new PrismaClient();

  let versionsCount = 0;
  for (const verKey of Object.keys(MIRA_REGULATORY_VERSIONS)) {
    const ver = MIRA_REGULATORY_VERSIONS[verKey];
    await db.regulatoryVersion.upsert({
      where: { versionId: ver.versionId },
      update: {
        versionNumber: ver.versionNumber,
        effectiveTaxYear: ver.effectiveTaxYear,
        releaseDate: ver.releaseDate,
        description: ver.description,
        miraNoticeReference: ver.miraNoticeReference || null,
        status: ver.status
      },
      create: {
        versionId: ver.versionId,
        versionNumber: ver.versionNumber,
        effectiveTaxYear: ver.effectiveTaxYear,
        releaseDate: ver.releaseDate,
        description: ver.description,
        miraNoticeReference: ver.miraNoticeReference || null,
        status: ver.status
      }
    });
    versionsCount++;
  }

  let rulesCount = 0;
  for (const rule of SEEDED_REGULATORY_RULES) {
    await db.regulatoryRule.upsert({
      where: { ruleId: rule.ruleId },
      update: {
        taxType: rule.taxType,
        ruleCode: rule.ruleCode,
        description: rule.description,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        taxYear: rule.taxYear,
        version: rule.version,
        legalReference: rule.legalReference,
        sourceURL: rule.sourceURL,
        parametersJson: JSON.stringify(rule.parameters),
        status: rule.status,
        sector: rule.sector || null,
        taxpayerType: rule.taxpayerType || null,
        jurisdiction: rule.jurisdiction || 'MV'
      },
      create: {
        ruleId: rule.ruleId,
        taxType: rule.taxType,
        ruleCode: rule.ruleCode,
        description: rule.description,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        taxYear: rule.taxYear,
        version: rule.version,
        legalReference: rule.legalReference,
        sourceURL: rule.sourceURL,
        parametersJson: JSON.stringify(rule.parameters),
        status: rule.status,
        sector: rule.sector || null,
        taxpayerType: rule.taxpayerType || null,
        jurisdiction: rule.jurisdiction || 'MV'
      }
    });
    rulesCount++;
  }

  return { rulesCount, versionsCount };
}

if (process.env.RUN_SEED === 'true') {
  const prisma = new PrismaClient();
  seedRegulatoryDatabase(prisma)
    .then((res) => {
      console.log(`[Seed] Successfully seeded ${res.versionsCount} regulatory versions and ${res.rulesCount} rules.`);
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error('[Seed Error] Failed to seed database:', err);
      process.exit(1);
    });
}
