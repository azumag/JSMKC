import { buildQualificationScheduleDiagnostics } from '@/lib/qualification-schedule-diagnostics';

describe('buildQualificationScheduleDiagnostics', () => {
  it('reports effective policy per populated group and mode', () => {
    const result = buildQualificationScheduleDiagnostics('cdm', {
      bm: [
        ...Array.from({ length: 14 }, () => ({ group: 'A' })),
        ...Array.from({ length: 13 }, () => ({ group: 'B' })),
      ],
      mr: Array.from({ length: 20 }, () => ({ group: 'C' })),
      gp: [],
    });

    expect(result).toEqual({
      bm: [
        {
          group: 'A',
          configuredMethod: 'cdm',
          playerCount: 14,
          effectiveMethod: 'cdm',
          reason: 'cdm-requested',
        },
        {
          group: 'B',
          configuredMethod: 'cdm',
          playerCount: 13,
          effectiveMethod: 'circle',
          reason: 'cdm-small-group-legacy-circle',
        },
      ],
      mr: [
        {
          group: 'C',
          configuredMethod: 'cdm',
          playerCount: 20,
          effectiveMethod: 'cdm',
          reason: 'cdm-requested',
        },
      ],
      gp: [],
    });
  });

  it('keeps explicitly configured circle tournaments on circle for every group', () => {
    const result = buildQualificationScheduleDiagnostics('circle', {
      bm: Array.from({ length: 20 }, () => ({ group: 'B' })),
      mr: [],
      gp: [],
    });

    expect(result.bm).toEqual([
      {
        group: 'B',
        configuredMethod: 'circle',
        playerCount: 20,
        effectiveMethod: 'circle',
        reason: 'configured-circle',
      },
    ]);
  });
});
