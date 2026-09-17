import fs from 'fs';
import path from 'path';

type BroadcastMessages = Record<string, string>;

const appRoot = path.resolve(__dirname, '..', '..', '..');
const pageSource = fs.readFileSync(
  path.join(appRoot, 'src', 'app', 'tournaments', '[id]', 'broadcast', 'page.tsx'),
  'utf8',
);
const requestSource = fs.readFileSync(path.join(appRoot, 'src', 'i18n', 'request.ts'), 'utf8');

const loadMessages = (locale: 'en' | 'ja') =>
  JSON.parse(
    fs.readFileSync(path.join(appRoot, 'messages', 'broadcast', `${locale}.json`), 'utf8'),
  ) as BroadcastMessages;

describe('broadcast management page localization contract', () => {
  it('registers a broadcast namespace with matching EN/JA keys and distinct primary copy', () => {
    const en = loadMessages('en');
    const ja = loadMessages('ja');

    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(en.title).toBe('Broadcast management');
    expect(ja.title).toBe('配信管理');
    expect(en.currentDisplay).toBe('Current broadcast display');
    expect(ja.currentDisplay).toBe('現在の配信表示');
    expect(en.adjustPositions).toBe('Adjust display positions');
    expect(ja.adjustPositions).toBe('表示位置を調整');
    expect(requestSource).toContain('broadcast: broadcastMessages[locale]');
  });

  it('routes visible broadcast copy through translations without changing API or layout wiring', () => {
    expect(pageSource).toMatch(/const tb = useTranslations\(['"]broadcast['"]\);/);
    expect(pageSource).toMatch(/tb\(['"]title['"]\)/);
    expect(pageSource).toMatch(/tb\(['"]currentDisplay['"]\)/);
    expect(pageSource).toMatch(/tb\(['"]scoreValidation['"]/);
    expect(pageSource).toMatch(/t\(['"]broadcastReflect['"]\)/);
    expect(pageSource).toMatch(/t\(['"]broadcastReflected['"]\)/);
    expect(pageSource).toContain('DEFAULT_OVERLAY_BROADCAST_LAYOUT');
    expect(pageSource).toContain('normalizeOverlayBroadcastLayout(data.layout)');
    expect(pageSource).toContain('`/api/tournaments/${tournamentId}/broadcast`');

    expect(pageSource).not.toContain('>配信管理<');
    expect(pageSource).not.toContain('>現在の配信表示<');
    expect(pageSource).not.toContain('>表示位置を調整<');
    expect(pageSource).not.toMatch(/['"]配信に反映['"]/);
  });
});
