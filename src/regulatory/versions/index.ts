import { RegulatoryVersion } from '../types';

export const MIRA_REGULATORY_VERSIONS: Record<string, RegulatoryVersion> = {
  VERSION_2020_1: {
    versionId: 'REG-VER-2020-1',
    versionNumber: 'v20.1',
    effectiveTaxYear: 2020,
    releaseDate: '2020-01-01',
    description: 'Initial Income Tax Act implementation and legacy GST rates (General 6%, Tourism 12%)',
    status: 'DEPRECATED'
  },
  VERSION_2023_1: {
    versionId: 'REG-VER-2023-1',
    versionNumber: 'v23.1',
    effectiveTaxYear: 2023,
    releaseDate: '2023-01-01',
    description: 'GST rate update (General 8%, Tourism 16%), Income Tax brackets',
    status: 'DEPRECATED'
  },
  VERSION_2024_1: {
    versionId: 'REG-VER-2024-1',
    versionNumber: 'v24.1',
    effectiveTaxYear: 2024,
    releaseDate: '2024-01-01',
    description: 'MIRA 604 v25.1 form framework, individual 5.5% bracket alignment, corporate threshold MVR 500k',
    miraNoticeReference: 'MIRA-CIRCULAR-2024-01',
    status: 'ACTIVE'
  },
  VERSION_2025_1: {
    versionId: 'REG-VER-2025-1',
    versionNumber: 'v25.1',
    effectiveTaxYear: 2025,
    releaseDate: '2025-07-01',
    description: 'Tourism GST increased to 17% effective 1 July 2025',
    miraNoticeReference: 'Act No. 12/2024',
    status: 'ACTIVE'
  }
};
