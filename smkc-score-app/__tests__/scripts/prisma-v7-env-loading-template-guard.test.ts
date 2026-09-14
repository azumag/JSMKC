import fs from 'node:fs';

import {
  findTemplateInterpolationRanges,
  inspectPrismaV7EnvLoadingTemplateGuard,
} from '../../scripts/prisma-v7-env-loading-template-guard.cjs';

describe('Prisma 7 environment-loading template interpolation guard', () => {
  it('rejects a named defineConfig call inside template interpolation', () => {
    const source = [
      "import { defineConfig as makeConfig } from 'prisma/config';",
      'const rendered = `${makeConfig({})}`;',
    ].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toMatchObject({
      ready: false,
      findingCount: 1,
      findings: [{ kind: 'direct', binding: 'makeConfig' }],
    });
  });

  it('rejects a CommonJS defineConfig alias inside template interpolation', () => {
    const source = [
      "const { defineConfig: makeConfig } = require('prisma/config');",
      'const rendered = `${makeConfig({})}`;',
    ].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toMatchObject({
      ready: false,
      findingCount: 1,
      findings: [{ kind: 'direct', binding: 'makeConfig' }],
    });
  });

  it('rejects an ESM Prisma config namespace call inside template interpolation without duplicating it', () => {
    const source = [
      "import * as prismaConfig from 'prisma/config';",
      'const rendered = `${prismaConfig.defineConfig({})}`;',
    ].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toMatchObject({
      ready: false,
      findingCount: 1,
      findings: [{ kind: 'namespace', binding: 'prismaConfig' }],
    });
  });

  it('rejects a CommonJS Prisma config namespace call inside template interpolation', () => {
    const source = [
      "const prismaConfig = require('prisma/config');",
      'const rendered = `${prismaConfig.defineConfig({})}`;',
    ].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toMatchObject({
      ready: false,
      findingCount: 1,
      findings: [{ kind: 'namespace', binding: 'prismaConfig' }],
    });
  });

  it('does not confuse a member method with an imported direct binding', () => {
    const source = [
      "import { defineConfig as makeConfig } from 'prisma/config';",
      'const wrapper = { makeConfig: () => undefined };',
      'const rendered = `${wrapper.makeConfig({})}`;',
      'export default makeConfig({});',
    ].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toEqual({
      ready: true,
      findingCount: 0,
      findings: [],
    });
  });

  it('ignores raw template text, quoted text, comments, and regex literals', () => {
    const source = [
      "import { defineConfig } from 'prisma/config';",
      'const templateExample = `defineConfig({})`;',
      "const quotedExample = 'defineConfig({})';",
      '// `${defineConfig({})}`',
      'const matcher = /`${defineConfig\\(\\{\\}\\)}`/;',
      'export default defineConfig({});',
    ].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toEqual({
      ready: true,
      findingCount: 0,
      findings: [],
    });
  });

  it('ignores unrelated defineConfig identifiers that are not imported from prisma/config', () => {
    const source = ['const defineConfig = () => undefined;', 'const rendered = `${defineConfig({})}`;'].join('\n');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toEqual({
      ready: true,
      findingCount: 0,
      findings: [],
    });
  });

  it('tracks nested template interpolations without losing the outer range', () => {
    const source = 'const rendered = `outer ${foo(`inner ${bar()}`)}`;';
    const ranges = findTemplateInterpolationRanges(source);

    expect(ranges).toHaveLength(2);
    expect(ranges.map(({ start }) => source.slice(start, start + 3))).toEqual(expect.arrayContaining(['foo', 'bar']));
  });

  it('keeps the repository prisma.config.ts within the guarded invariant', () => {
    const source = fs.readFileSync('prisma.config.ts', 'utf8');

    expect(inspectPrismaV7EnvLoadingTemplateGuard(source)).toEqual({
      ready: true,
      findingCount: 0,
      findings: [],
    });
  });
});
