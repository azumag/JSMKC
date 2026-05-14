describe('TC-1033 deterministic TA entry ordering', () => {
  it('keeps TC-1033 grouped after boundary sudden-death coverage in the TA suite', async () => {
    const taSuite = await import('../../e2e/tc-ta.js') as {
      getSuite: () => { tests: Array<{ name: string }> };
    };

    const names = taSuite.getSuite().tests.map((test) => test.name);

    expect(names.indexOf('TC-1033')).toBeGreaterThan(names.indexOf('TC-815'));
    expect(names.indexOf('TC-1033')).toBeLessThan(names.indexOf('TC-817'));
  });
});
