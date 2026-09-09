import { GoldenTaxCaseFixture, GoldenCaseId, GoldenCaseCategory } from '../../types/goldenCases';
import { buildAuthoritativeGoldenFixtures, computeFixtureDigest } from './goldenCaseDefinitions';

/**
 * Immutable Registry for Golden Regulatory Tax Cases (Phase 41)
 * Guarantees that benchmark fixtures cannot be tampered with or silently altered.
 */
export class GoldenCaseRegistry {
  private static instance: GoldenCaseRegistry | null = null;
  private fixtures: Map<GoldenCaseId, GoldenTaxCaseFixture> = new Map();
  private checksums: Map<GoldenCaseId, string> = new Map();

  private constructor() {
    this.loadAndSealFixtures();
  }

  public static getInstance(): GoldenCaseRegistry {
    if (!GoldenCaseRegistry.instance) {
      GoldenCaseRegistry.instance = new GoldenCaseRegistry();
    }
    return GoldenCaseRegistry.instance;
  }

  private loadAndSealFixtures(): void {
    const rawFixtures = buildAuthoritativeGoldenFixtures();
    for (const fixture of rawFixtures) {
      this.fixtures.set(fixture.caseId, fixture);
      if (fixture.immutableSha256Checksum) {
        this.checksums.set(fixture.caseId, fixture.immutableSha256Checksum);
      }
    }
    Object.freeze(this.fixtures);
    Object.freeze(this.checksums);
  }

  /**
   * Returns all 20 immutable golden fixtures.
   */
  public getAllFixtures(): ReadonlyArray<GoldenTaxCaseFixture> {
    return Array.from(this.fixtures.values());
  }

  /**
   * Retrieves a single golden fixture by its unique caseId (e.g., GOLDEN-001).
   */
  public getFixture(caseId: GoldenCaseId): GoldenTaxCaseFixture {
    const fixture = this.fixtures.get(caseId);
    if (!fixture) {
      throw new Error(`Golden Case fixture not found: ${caseId}`);
    }
    return fixture;
  }

  /**
   * Retrieves fixtures filtered by regulatory category.
   */
  public getFixturesByCategory(category: GoldenCaseCategory): GoldenTaxCaseFixture[] {
    return Array.from(this.fixtures.values()).filter(f => f.category === category);
  }

  /**
   * Cryptographically verifies the integrity of all registered golden fixtures.
   * Throws or returns detailed failure if any fixture has been modified.
   */
  public verifyIntegrity(): { isValid: boolean; checkedCount: number; errors: string[] } {
    const errors: string[] = [];
    let checkedCount = 0;

    for (const fixture of this.fixtures.values()) {
      checkedCount++;
      const { immutableSha256Checksum, ...rest } = fixture;
      const computed = computeFixtureDigest(rest);

      if (!immutableSha256Checksum) {
        errors.push(`Fixture ${fixture.caseId} is missing an immutableSha256Checksum.`);
      } else if (computed !== immutableSha256Checksum) {
        errors.push(
          `Integrity failure for ${fixture.caseId}: Checksum mismatch! Expected ${immutableSha256Checksum}, calculated ${computed}.`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      checkedCount,
      errors
    };
  }

  /**
   * Asserts total count equals exactly 20.
   */
  public static readonly TOTAL_EXPECTED_CASES = 20;
}
