import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-349 listener cleanup', () => {
  const tcAll = readRepoFile('smkc-score-app', 'e2e', 'tc-all.js');

  it('documents the failure-path listener cleanup regression', () => {
    const section = e2eCaseSection('TC-349');

    expect(section).toContain('issue #1028');
    expect(section).toContain('issue #1649');
    expect(section).toContain("page.off('pageerror', onErr)");
    expect(section).toContain("page.off('response', onResponse)");
    expect(section).toContain('失敗時にも解除');
    expect(section).toContain('TC-349 cleanup 専用マーカー');
  });

  it('removes the TC-349 listeners through a finally block', () => {
    const tc349Runner = sectionBetween(
      tcAll,
      '// TC-349: Responsive',
      '// TC-350:',
    );

    expect(tc349Runner).toContain('finally {');

    const cleanup = sectionBetween(
      tc349Runner,
      '// TC-349 cleanup start',
      '// TC-349 cleanup end',
    );

    expect(cleanup).not.toContain('} else {');
    expect(cleanup).toContain("page.off('pageerror', onErr)");
    expect(cleanup).toContain("page.off('response', onResponse)");
    expect(cleanup).toContain('page.setViewportSize({ width: 1280, height: 720 })');

    const catchBlock = sectionBetween(
      tc349Runner,
      '} catch (err) {',
      '} finally {',
    );

    expect(catchBlock).not.toContain('page.setViewportSize({ width: 1280, height: 720 })');
    expect(catchBlock).not.toContain("page.off('pageerror', onErr)");
    expect(catchBlock).not.toContain("page.off('response', onResponse)");
  });
});
