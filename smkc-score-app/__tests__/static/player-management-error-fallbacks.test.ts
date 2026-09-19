import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

function extractBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
}

describe('player management admin mutation error fallback contract', () => {
  const source = readAppFile('src', 'app', 'players', 'page.tsx');
  const updateBlock = extractBlock(source, 'const handleUpdate = async', 'const handleDelete = async');
  const deleteBlock = extractBlock(source, 'const handleDelete = async', 'const handleResetPassword = async');
  const resetPasswordBlock = extractBlock(source, 'const handleResetPassword = async', 'const selectTemporaryPassword');

  it('keeps duplicate nickname localization while hiding arbitrary update error detail', () => {
    expect(updateBlock).toContain('data.code === PLAYER_ERROR_CODES.DUPLICATE_NICKNAME');
    expect(updateBlock).toContain("? t('duplicateNickname')");
    expect(updateBlock).toContain(": t('failedToUpdate')");
    expect(updateBlock).not.toContain('data.error');
    expect(updateBlock).not.toContain("data.error || t('failedToUpdate')");
    expect(updateBlock).toContain("logger.error('Player update API returned error status', {");
    expect(updateBlock).toContain('status: response!.status');
    expect(updateBlock).toContain('playerId: editingPlayerId');
  });

  it('does not parse or display delete response bodies on HTTP failure', () => {
    expect(deleteBlock).toContain("alert(t('failedToDelete'));");
    expect(deleteBlock).not.toContain('response!.text()');
    expect(deleteBlock).not.toContain('JSON.parse');
    expect(deleteBlock).not.toContain('data.error');
    expect(deleteBlock).toContain("logger.error('Player delete API returned error status', {");
    expect(deleteBlock).toContain('status: response!.status');
    expect(deleteBlock).toContain('playerId: id');
  });

  it('does not parse or display reset-password response bodies on HTTP failure', () => {
    expect(resetPasswordBlock).toContain("alert(t('failedToResetPassword'));");
    expect(resetPasswordBlock).not.toContain('response!.text()');
    expect(resetPasswordBlock).not.toContain('JSON.parse');
    expect(resetPasswordBlock).not.toContain('data.error');
    expect(resetPasswordBlock).toContain("logger.error('Player reset-password API returned error status', {");
    expect(resetPasswordBlock).toContain('status: response!.status');
    expect(resetPasswordBlock).toContain('playerId');
  });
});
