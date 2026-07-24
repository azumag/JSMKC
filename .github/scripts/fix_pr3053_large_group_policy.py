from pathlib import Path

ROOT = Path('smkc-score-app')

qualification_test = ROOT / '__tests__/lib/api-factories/qualification-route.test.ts'
source = qualification_test.read_text()

old = "    it('uses the shared CDM fixture for MR courses and GP cups for 14+ player groups', async () => {"
new = "    it('uses the shared CDM fixture for MR courses and GP cups for 14-20 player groups', async () => {"
if source.count(old) != 1:
    raise SystemExit(f'CDM fixture test title: expected 1 occurrence, found {source.count(old)}')
source = source.replace(old, new, 1)

old = "      expect(resolveQualificationScheduleMethodForGroup('cdm', 21)).toBe('circle');"
new = "      expect(resolveQualificationScheduleMethodForGroup('cdm', 21)).toBe('cdm');"
if source.count(old) != 1:
    raise SystemExit(f'21-player boundary expectation: expected 1 occurrence, found {source.count(old)}')
source = source.replace(old, new, 1)

anchor = """    it('should fail explicitly instead of falling back to createMany for unsupported large raw insert modes', async () => {
"""
large_group_test = """    it('rejects a 21-player CDM group instead of silently falling back to circle', async () => {
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        qualificationScheduleMethod: 'cdm',
      });
      const players = Array.from({ length: 21 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        group: 'A',
        seeding: index + 1,
      }));
      const { POST } = createQualificationHandlers(createMockConfig());

      const response = await POST(
        new NextRequest('http://localhost:3000', { method: 'POST', body: JSON.stringify({ players }) }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        expect.objectContaining({ success: false, code: 'UNSUPPORTED_CDM_GROUP_SIZE' }),
      );
      expect((prisma.bMMatch as any).deleteMany).not.toHaveBeenCalled();
      expect((prisma.bMQualification as any).deleteMany).not.toHaveBeenCalled();
    });

"""
if source.count(anchor) != 1:
    raise SystemExit(f'qualification test insertion anchor: expected 1 occurrence, found {source.count(anchor)}')
source = source.replace(anchor, large_group_test + anchor, 1)
qualification_test.write_text(source)

reconciliation_test = ROOT / '__tests__/lib/cdm-qualification-reconciliation.test.ts'
source = reconciliation_test.read_text()
anchor = """  it('rejects duplicate competitive player pairs before producing a mutation plan', () => {
"""
reconciliation_large_group_test = """  it('rejects a group above the RR workbook ceiling instead of silently using circle', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 21);

    expect(() => buildCdmQualificationReconciliationPlan(input)).toThrow('received 21');
  });

"""
if source.count(anchor) != 1:
    raise SystemExit(f'reconciliation test insertion anchor: expected 1 occurrence, found {source.count(anchor)}')
source = source.replace(anchor, reconciliation_large_group_test + anchor, 1)
reconciliation_test.write_text(source)

print('Updated PR 3053 so only groups of 13 or fewer fall back to circle')
