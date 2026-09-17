import fs from 'fs';
import path from 'path';

type TournamentLayoutMessages = {
  sectionsNavLabel: string;
  broadcastManagement: string;
};

const appRoot = path.resolve(__dirname, '..', '..', '..');
const layoutSource = fs.readFileSync(path.join(appRoot, 'src', 'app', 'tournaments', '[id]', 'layout.tsx'), 'utf8');
const requestSource = fs.readFileSync(path.join(appRoot, 'src', 'i18n', 'request.ts'), 'utf8');

const loadMessages = (locale: 'en' | 'ja') =>
  JSON.parse(
    fs.readFileSync(path.join(appRoot, 'messages', 'tournament-layout', `${locale}.json`), 'utf8'),
  ) as TournamentLayoutMessages;

describe('tournament layout localization contract', () => {
  it('registers a locale-specific tournamentLayout namespace with matching EN/JA keys', () => {
    const en = loadMessages('en');
    const ja = loadMessages('ja');

    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(en).toEqual({
      sectionsNavLabel: 'Tournament sections',
      broadcastManagement: 'Broadcast management',
    });
    expect(ja).toEqual({
      sectionsNavLabel: '大会セクション',
      broadcastManagement: '配信管理',
    });
    expect(requestSource).toContain('tournamentLayout: tournamentLayoutMessages[locale]');
  });

  it('uses translated navigation and admin-tab labels without changing the hydration guard', () => {
    expect(layoutSource).toContain("const tLayout = useTranslations('tournamentLayout');");
    expect(layoutSource).toContain("aria-label={tLayout('sectionsNavLabel')}");
    expect(layoutSource).toContain("{ href: 'broadcast', labelKey: 'broadcastManagement' }");
    expect(layoutSource).toContain('{tLayout(tab.labelKey)}');
    expect(layoutSource).toContain("data-tournament-tabs-hydrated={tabsHydrated ? 'true' : 'false'}");
    expect(layoutSource).not.toContain('aria-label="Tournament sections"');
    expect(layoutSource).not.toContain("label: '配信管理'");
  });
});
