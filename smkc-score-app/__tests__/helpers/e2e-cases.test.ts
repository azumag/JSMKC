import { callExpressionWithArguments } from './e2e-cases';

describe('E2E case helpers', () => {
  it('finds required arguments on the same call expression', () => {
    const source = `
      throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_PAGE_ROLE_LOOKUPS);
      throwUnexpectedMockCall('dialog.locator', selector, EXPECTED_SELECTORS);
    `;

    expect(callExpressionWithArguments(source, 'throwUnexpectedMockCall', [
      "'page.getByRole'",
      'roleLookup(_role, name)',
      'EXPECTED_PAGE_ROLE_LOOKUPS',
    ])).toContain('roleLookup(_role, name)');
  });

  it('rejects required arguments split across different calls', () => {
    const source = `
      throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_SELECTORS);
      throwUnexpectedMockCall('dialog.locator', selector, EXPECTED_PAGE_ROLE_LOOKUPS);
    `;

    expect(() => callExpressionWithArguments(source, 'throwUnexpectedMockCall', [
      "'page.getByRole'",
      'roleLookup(_role, name)',
      'EXPECTED_PAGE_ROLE_LOOKUPS',
    ])).toThrow(
      "call expression not found: throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_PAGE_ROLE_LOOKUPS)",
    );
  });
});
