from pathlib import Path

path = Path('smkc-score-app/__tests__/app/api/tournaments/[id]/bm/route.test.ts')
source = path.read_text()

old_single = "        details: { mode: 'qualification', playerCount: 2 },"
new_single = """        details: {
          mode: 'qualification',
          playerCount: 2,
          scheduleMethodsByGroup: { A: 'circle' },
        },"""
if source.count(old_single) != 1:
    raise SystemExit(f'single-group BM audit expectation: found {source.count(old_single)}')
source = source.replace(old_single, new_single, 1)

old_multi = """      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        details: { mode: 'qualification', playerCount: 4 }
      }));"""
new_multi = """      expect(auditLogMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          details: {
            mode: 'qualification',
            playerCount: 4,
            scheduleMethodsByGroup: { A: 'circle', B: 'circle' },
          },
        }),
      );"""
if source.count(old_multi) != 1:
    raise SystemExit(f'multi-group BM audit expectation: found {source.count(old_multi)}')
source = source.replace(old_multi, new_multi, 1)

path.write_text(source)
print('Updated BM route audit expectations for per-group schedule policy')
