import {
  inspectPrismaV7EnvLoading,
  withoutCommentOnlyLines,
} from '../../scripts/prisma-v7-env-loading.cjs';

describe('Prisma 7 environment-loading lexical evidence', () => {
  it('does not let comment delimiters inside strings erase the config-evaluation boundary', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        import { config } from 'dotenv';
        import { defineConfig } from 'prisma/config';
        const opener = '/* not a comment';
        export default defineConfig({});
        const closer = '*/ still not a comment';
        config();
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('does not treat a side-effect import written inside a template literal as readiness evidence', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const example = \`
          import 'dotenv/config';
        \`;
        export default {};
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('does not treat a named dotenv import written inside a template literal as import evidence', () => {
    expect(
      inspectPrismaV7EnvLoading(`
        const example = \`
          import { config as loadEnv } from 'dotenv';
        \`;
        import { defineConfig } from 'prisma/config';
        const loadEnv = () => undefined;
        loadEnv();
        export default defineConfig({});
      `),
    ).toEqual({ ready: false, mode: null });
  });

  it('masks real comments without changing source length or quoted comment delimiters', () => {
    const source = "const marker = '/* quoted */'; /* real comment */ config(); // line comment\n";
    const masked = withoutCommentOnlyLines(source);

    expect(masked).toHaveLength(source.length);
    expect(masked).toContain("'/* quoted */'");
    expect(masked).not.toContain('real comment');
    expect(masked).not.toContain('line comment');
    expect(masked).toContain('config();');
  });
});
