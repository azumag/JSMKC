import fs from 'fs';
import path from 'path';

type DebugFillMessages = {
  title: string;
  button: string;
  busyButton: string;
  running: string;
  success: string;
  failure: string;
};

const appRoot = path.resolve(__dirname, '..', '..', '..');
const componentSource = fs.readFileSync(path.join(appRoot, 'src/components/tournament/debug-fill-button.tsx'), 'utf8');
const requestSource = fs.readFileSync(path.join(appRoot, 'src/i18n/request.ts'), 'utf8');

const loadMessages = (locale: 'en' | 'ja') =>
  JSON.parse(fs.readFileSync(path.join(appRoot, 'messages/debug-fill', `${locale}.json`), 'utf8')) as DebugFillMessages;

describe('DebugFillButton localization contract', () => {
  it('registers matching EN/JA debugFill message catalogs', () => {
    const en = loadMessages('en');
    const ja = loadMessages('ja');

    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(en.button).toBe('Auto-fill qualification scores');
    expect(en.running).toBe('Running…');
    expect(ja.button).toBe('予選スコア自動入力');
    expect(ja.running).toBe('実行中…');
    expect(requestSource).toContain('debugFill: debugFillMessages[locale]');
  });

  it('uses the debugFill namespace instead of fixed Japanese UI strings', () => {
    expect(componentSource).toContain("const tDebugFill = useTranslations('debugFill');");
    expect(componentSource).toContain("setStatusText(tDebugFill('running'))");
    expect(componentSource).toContain("tDebugFill('success', { filled, skipped })");
    expect(componentSource).toContain("tDebugFill('failure', { message })");
    expect(componentSource).toContain("title={tDebugFill('title', { mode: mode.toUpperCase() })}");
    expect(componentSource).toContain('role="status"');
    expect(componentSource).not.toContain("setStatusText('実行中…')");
    expect(componentSource).not.toContain("{busy ? '自動入力中…' : '予選スコア自動入力'}");
  });
});
