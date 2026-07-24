from pathlib import Path
import re

ROOT = Path("smkc-score-app")


def replace_exact(path: Path, old: str, new: str, label: str, count: int = 1) -> None:
    source = path.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f"{label}: expected {count} occurrence(s), found {actual}")
    path.write_text(source.replace(old, new, count))


# Remove the schedule selector and its form state. The server now owns the policy.
page = ROOT / "src/app/tournaments/page.tsx"
replace_exact(
    page,
    "    qualificationScheduleMethod: 'circle' as 'circle' | 'cdm',\n",
    "",
    "initial form schedule state",
)
replace_exact(
    page,
    "          qualificationScheduleMethod: 'circle',\n",
    "",
    "success reset schedule state",
)
replace_exact(
    page,
    "                    qualificationScheduleMethod: 'circle',\n",
    "",
    "dialog reset schedule state",
)
replace_exact(
    page,
    """                  <div className=\"space-y-2 pt-2\">\n                    <Label htmlFor=\"qualificationScheduleMethod\">{t('qualificationScheduleMethod')}</Label>\n                    <select\n                      id=\"qualificationScheduleMethod\"\n                      value={formData.qualificationScheduleMethod}\n                      onChange={(event) =>\n                        setFormData({\n                          ...formData,\n                          qualificationScheduleMethod: event.target.value as 'circle' | 'cdm',\n                        })\n                      }\n                      className=\"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm\"\n                    >\n                      <option value=\"circle\">{t('qualificationScheduleCircle')}</option>\n                      <option value=\"cdm\">{t('qualificationScheduleCdm')}</option>\n                    </select>\n                    <p className=\"text-xs text-muted-foreground\">{t('qualificationScheduleMethodHelp')}</p>\n                  </div>\n""",
    "",
    "schedule selector UI",
)

# Make the creation API authoritative: every genuinely new tournament is CDM.
route = ROOT / "src/app/api/tournaments/route.ts"
replace_exact(
    route,
    """      taBattleRoyaleMode,\n      debugMode,\n      qualificationScheduleMethod,\n""",
    """      taBattleRoyaleMode,\n      debugMode,\n""",
    "request schedule destructuring",
)
replace_exact(
    route,
    """    if (qualificationScheduleMethod !== undefined && !['circle', 'cdm'].includes(qualificationScheduleMethod)) {\n      return handleValidationError(\n        'qualificationScheduleMethod must be \"circle\" or \"cdm\"',\n        'qualificationScheduleMethod',\n      );\n    }\n\n""",
    "",
    "request schedule validation",
)
replace_exact(
    route,
    "        ...(qualificationScheduleMethod !== undefined && { qualificationScheduleMethod }),\n",
    "        qualificationScheduleMethod: 'cdm',\n",
    "forced CDM create value",
)
replace_exact(
    route,
    """          debugMode: debugMode === true,\n          taBattleRoyaleMode: taBattleRoyaleMode === true,\n""",
    """          debugMode: debugMode === true,\n          taBattleRoyaleMode: taBattleRoyaleMode === true,\n          qualificationScheduleMethod: 'cdm',\n""",
    "audit schedule method",
)

# Keep the schema's deployed legacy fallback documented accurately. The API writes
# `cdm` explicitly; archive restoration may still restore historical `circle` rows.
schema = ROOT / "prisma/schema.prisma"
replace_exact(
    schema,
    '  qualificationScheduleMethod      String    @default("circle") // circle (legacy) or cdm (RR 2025 Start fixture)\n',
    '  qualificationScheduleMethod      String    @default("circle") // Legacy DB fallback/restores; new tournament API always writes cdm\n',
    "schema schedule comment",
)

# Update API tests to assert the invariant, including stale clients that still send circle.
test = ROOT / "__tests__/app/api/tournaments/route.test.ts"
replace_exact(
    test,
    """            taBattleRoyaleMode: true,\n            debugMode: false,\n""",
    """            taBattleRoyaleMode: true,\n            qualificationScheduleMethod: 'cdm',\n            debugMode: false,\n""",
    "default create expectation",
)
source = test.read_text()
pattern = re.compile(
    r"    it\('persists an explicitly selected CDM qualification schedule', async \(\) => \{.*?^    \}\);\n",
    re.MULTILINE | re.DOTALL,
)
replacement = """    it('always creates new tournaments with the CDM qualification schedule', async () => {\n      jest.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });\n      (sanitizeMock.sanitizeInput as jest.Mock).mockReturnValue({\n        name: 'CDM Tournament',\n        date: '2024-01-01',\n        // A stale client may still submit the removed legacy field. It must not\n        // be able to create a new circle-scheduled tournament.\n        qualificationScheduleMethod: 'circle',\n      });\n      (prisma.tournament.create as jest.Mock).mockResolvedValue(mockTournament);\n\n      await tournamentsRoute.POST(\n        new NextRequest('http://localhost:3000/api/tournaments', {\n          method: 'POST',\n          body: JSON.stringify({\n            name: 'CDM Tournament',\n            date: '2024-01-01',\n            qualificationScheduleMethod: 'circle',\n          }),\n        }),\n      );\n\n      expect(prisma.tournament.create).toHaveBeenCalledWith(\n        expect.objectContaining({ data: expect.objectContaining({ qualificationScheduleMethod: 'cdm' }) }),\n      );\n    });\n"""
updated, matches = pattern.subn(replacement, source, count=1)
if matches != 1:
    raise SystemExit(f"CDM schedule test replacement: expected 1 match, found {matches}")
test.write_text(updated)

print("Applied CDM-only new tournament changes")
