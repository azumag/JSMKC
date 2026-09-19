import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('TA qualification setup error fallback contract', () => {
  const source = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const componentStart = source.indexOf('export default function TimeAttackPageClient');
  const start = source.indexOf('const handleSaveSetup = async () => {');
  const end = source.indexOf('// Check if qualification entries exist in each phase', start);
  const block = source.slice(start, end);

  it('keeps SetupSaveError at module scope so React Compiler can optimize the component', () => {
    const classStart = source.indexOf('class SetupSaveError extends Error');
    expect(classStart).toBeGreaterThan(-1);
    expect(componentStart).toBeGreaterThan(classStart);
    expect(block).not.toContain('class SetupSaveError extends Error');
  });

  it('normalizes HTTP response errors without parsing backend error details', () => {
    expect(block).toContain("new SetupSaveError(tc('networkError'), response.status, operation)");
    expect(block).toContain("const userMessage = tc('networkError');");
    expect(block).not.toContain('response.json()');
    expect(block).not.toContain('payload.error');
    expect(block).not.toContain("const msg = err instanceof Error ? err.message : 'Save failed'");
    expect(block).not.toContain('Failed to add players');
    expect(block).not.toContain('Failed to refetch TA entries');
    expect(block).not.toContain('Failed to update TA handicaps');
  });

  it('logs response status and failed operation while keeping transport diagnostics', () => {
    expect(block).toContain("logger.error('Failed to save TA qualification setup:', {");
    expect(block).toContain('message: err.message');
    expect(block).toContain('stack: err.stack');
    expect(block).toContain('status: isSetupSaveError ? err.status : undefined');
    expect(block).toContain("operation: isSetupSaveError ? err.operation : 'request'");
  });

  it('preserves save ordering, payload actions, 404 delete tolerance, and success path', () => {
    const removeIndex = block.indexOf("method: 'DELETE'");
    const addIndex = block.indexOf("method: 'POST'");
    const refetchIndex = block.indexOf('stage=qualification');
    const handicapIndex = block.indexOf("action: 'bulk_update_handicaps'");
    const seedingIndex = block.indexOf("action: 'update_seeding'");
    const partnerIndex = block.indexOf("action: 'set_partner'");
    expect(removeIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeGreaterThan(removeIndex);
    expect(refetchIndex).toBeGreaterThan(addIndex);
    expect(handicapIndex).toBeGreaterThan(refetchIndex);
    expect(seedingIndex).toBeGreaterThan(handicapIndex);
    expect(partnerIndex).toBeGreaterThan(seedingIndex);
    expect(block).toContain('res.status !== 404');
    expect(block).toContain('setIsSetupDialogOpen(false);');
    expect(block).toContain('refetch();');
    expect(block).toContain("toast.success(t('pairsSaved'));");
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);
    expect(messages).toMatch(/"networkError"\s*:\s*"[^"]+"/);
  });
});
