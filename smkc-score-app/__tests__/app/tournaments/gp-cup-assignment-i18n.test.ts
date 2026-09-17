import fs from 'fs';
import path from 'path';

type LocaleMessages = {
  finals: {
    cupDetailsResolution: string;
    keepCupDetails: string;
    clearCupDetails: string;
    cancelCupChange: string;
  };
};

type GpCupAssignmentMessages = {
  saveCupAssignment: string;
};

const appRoot = path.resolve(__dirname, '..', '..', '..');
const pageSource = fs.readFileSync(path.join(appRoot, 'src/app/tournaments/[id]/gp/page-client.tsx'), 'utf8');
const requestSource = fs.readFileSync(path.join(appRoot, 'src/i18n/request.ts'), 'utf8');

const loadLocale = (locale: 'en' | 'ja') =>
  JSON.parse(fs.readFileSync(path.join(appRoot, 'messages', `${locale}.json`), 'utf8')) as LocaleMessages;

const loadGpCupAssignment = (locale: 'en' | 'ja') =>
  JSON.parse(
    fs.readFileSync(path.join(appRoot, 'messages/gp-cup-assignment', `${locale}.json`), 'utf8'),
  ) as GpCupAssignmentMessages;

describe('GP qualification cup assignment localization', () => {
  it('uses the composed localized namespace instead of fixed English UI strings', () => {
    expect(pageSource).toContain("const tCupAssignment = useTranslations('gpCupAssignment');");
    expect(pageSource).toContain("aria-label={tCupAssignment('cupDetailsResolution')}");
    expect(pageSource).toContain("{tCupAssignment('keepCupDetails')}");
    expect(pageSource).toContain("{tCupAssignment('clearCupDetails')}");
    expect(pageSource).toContain("{tCupAssignment('cancelCupChange')}");
    expect(pageSource).toContain("{tCupAssignment('saveCupAssignment')}");

    expect(pageSource).not.toContain('aria-label="Cup detail resolution"');
    expect(pageSource).not.toContain('>Keep entered details<');
    expect(pageSource).not.toContain('>Clear entered details<');
    expect(pageSource).not.toContain('>Cancel cup change<');
    expect(pageSource).not.toContain('>Save cup assignment<');
  });

  it('reuses the existing finals resolution translations and only adds the GP-specific save label', () => {
    expect(requestSource).toContain('cupDetailsResolution: messages.finals.cupDetailsResolution');
    expect(requestSource).toContain('keepCupDetails: messages.finals.keepCupDetails');
    expect(requestSource).toContain('clearCupDetails: messages.finals.clearCupDetails');
    expect(requestSource).toContain('cancelCupChange: messages.finals.cancelCupChange');
    expect(requestSource).toContain('...gpCupAssignmentMessages[locale]');

    expect(loadLocale('en').finals).toMatchObject({
      cupDetailsResolution: 'Existing cup details',
      keepCupDetails: 'Keep details (label only)',
      clearCupDetails: 'Clear cup/race details',
      cancelCupChange: 'Cancel change',
    });
    expect(loadLocale('ja').finals).toMatchObject({
      cupDetailsResolution: '保存済みカップ詳細',
      keepCupDetails: '詳細を保持（表示のみ変更）',
      clearCupDetails: 'カップ／レース詳細をクリア',
      cancelCupChange: '変更を中止',
    });
    expect(loadGpCupAssignment('en')).toEqual({ saveCupAssignment: 'Save cup assignment' });
    expect(loadGpCupAssignment('ja')).toEqual({ saveCupAssignment: 'カップ割り当てを保存' });
  });
});
