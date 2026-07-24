from pathlib import Path
import re

path = Path('smkc-score-app/__tests__/lib/api-factories/qualification-route.test.ts')
source = path.read_text()


def replace(pattern: str, replacement: str, label: str) -> None:
    global source
    source, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')


replace(
    r"    it\('rejects an unsupported CDM group before deleting an existing qualification', async \(\) => \{.*?^    \}\);\n",
    r'''    it('falls back to the circle schedule for a 13-player group', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        qualificationScheduleMethod: 'cdm',
      });
      const players = Array.from({ length: 13 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        group: 'A',
        seeding: index + 1,
      }));
      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 13 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      (prisma as any).$executeRawUnsafe.mockResolvedValue(91);
      const { POST } = createQualificationHandlers(createMockConfig());

      const response = await POST(
        new NextRequest('http://localhost:3000', { method: 'POST', body: JSON.stringify({ players }) }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(201);
      expect((prisma.bMMatch as any).deleteMany).toHaveBeenCalled();
      expect((prisma.bMQualification as any).deleteMany).toHaveBeenCalled();
      const rows = JSON.parse((prisma as any).$executeRawUnsafe.mock.calls[0][1]);
      expect(rows).toHaveLength(91);
      expect(rows.filter((row: any) => row.isBye)).toHaveLength(13);
    });
''',
    '13-player fallback test',
)

replace(
    r"    it\('rejects a one-player CDM group before deleting an existing qualification', async \(\) => \{.*?^    \}\);\n",
    r'''    it('falls back to the circle schedule for a one-player group', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        qualificationScheduleMethod: 'cdm',
        version: 0,
      });
      (prisma.bMQualification as any).createMany.mockResolvedValue({ count: 1 });
      (prisma.bMQualification as any).findMany.mockResolvedValue([]);
      const { POST } = createQualificationHandlers(createMockConfig());

      const response = await POST(
        new NextRequest('http://localhost:3000', {
          method: 'POST',
          body: JSON.stringify({ players: [{ playerId: 'player-1', group: 'A', seeding: 1 }] }),
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(201);
      expect((prisma.bMMatch as any).deleteMany).toHaveBeenCalled();
      expect((prisma.bMQualification as any).deleteMany).toHaveBeenCalled();
      expect((prisma.bMQualification as any).createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ playerId: 'player-1', group: 'A' })],
      });
      expect((prisma.bMMatch as any).createMany).not.toHaveBeenCalled();
    });
''',
    'one-player fallback test',
)

replace(
    r"    it\('requires unique positive CDM seeds before deleting an existing qualification', async \(\) => \{.*?^    \}\);\n",
    r'''    it('requires unique positive CDM seeds for a 14-player workbook group before deleting existing data', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        qualificationScheduleMethod: 'cdm',
      });
      const players = Array.from({ length: 14 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        group: 'A',
        seeding: index === 13 ? 1 : index + 1,
      }));
      const { POST } = createQualificationHandlers(createMockConfig());

      const response = await POST(
        new NextRequest('http://localhost:3000', { method: 'POST', body: JSON.stringify({ players }) }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        expect.objectContaining({ success: false, code: 'INVALID_CDM_SEED_ORDER' }),
      );
      expect((prisma.bMMatch as any).deleteMany).not.toHaveBeenCalled();
      expect((prisma.bMQualification as any).deleteMany).not.toHaveBeenCalled();
    });
''',
    '14-player seed validation test',
)

old = "        details: { mode: 'qualification', playerCount: 4 },"
new = """        details: {
          mode: 'qualification',
          playerCount: 4,
          scheduleMethodsByGroup: { A: 'circle', B: 'circle' },
        },"""
if source.count(old) != 1:
    raise SystemExit(f'audit expectation: expected one match, found {source.count(old)}')
source = source.replace(old, new, 1)

path.write_text(source)
print('Updated legacy qualification-route expectations for automatic fallback')
