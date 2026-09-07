import { hasNoTemporaryAuditChainOverrides } from '../../scripts/security-audit.js';

describe('temporary security audit exception package overrides', () => {
  it('allows unrelated npm overrides', () => {
    expect(
      hasNoTemporaryAuditChainOverrides({
        overrides: {
          postcss: '^8.5.18',
          parent: { '.': '1.0.0', child: '^2.0.0' },
        },
      }),
    ).toBe(true);
  });

  it.each([
    { 'deepmerge-ts': '8.0.0' },
    { 'deepmerge-ts@<8': '8.0.0' },
    { 'prisma@^6.19.3': '6.20.0' },
    { '@prisma/config@6.19.3': '7.0.0' },
    { parent: { 'deepmerge-ts': '8.0.0' } },
    { parent: { '@prisma/config@6.19.3': '7.0.0' } },
  ])('fails closed when an override can change the temporary exception chain: %p', (overrides) => {
    expect(hasNoTemporaryAuditChainOverrides({ overrides })).toBe(false);
  });

  it.each([null, [], 'invalid', 1, { parent: null }, { parent: [] }])(
    'fails closed when package.json overrides has an unsupported shape: %p',
    (overrides) => {
      expect(hasNoTemporaryAuditChainOverrides({ overrides })).toBe(false);
    },
  );
});
