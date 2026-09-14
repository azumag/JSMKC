import {
  inspectPrismaV7DriverAdapter,
  isSourceCodeIndex,
  stripComments,
} from '../../scripts/prisma-v7-driver-adapter.cjs';

describe('Prisma 7 D1 driver adapter lexical evidence', () => {
  it('does not accept complete adapter wiring that exists only inside a template literal', () => {
    const source = [
      'const migrationExample = `',
      "  import { PrismaD1 } from '@prisma/adapter-d1';",
      "  import { PrismaClient } from '@prisma/client';",
      '  const adapter = new PrismaD1(db);',
      '  const prisma = new PrismaClient({ adapter });',
      '`;',
    ].join('\n');

    const status = inspectPrismaV7DriverAdapter(source);

    expect(status.ready).toBe(false);
    expect(status.adapterLocalName).toBeNull();
    expect(status.adapterInstanceLocalName).toBeNull();
    expect(status.prismaClientLocalName).toBeNull();
    expect(status.checks.importsPrismaD1Adapter).toBe(false);
    expect(status.checks.constructsPrismaD1Adapter).toBe(false);
    expect(status.checks.passesAdapterToPrismaClient).toBe(false);
  });

  it('skips quoted constructor examples before inspecting real client code', () => {
    const status = inspectPrismaV7DriverAdapter(`
      import { PrismaD1 } from '@prisma/adapter-d1';
      import { PrismaClient } from '@prisma/client';

      const migrationExample = 'const adapter = new PrismaD1(db); const prisma = new PrismaClient({ adapter });';
      const prisma = new PrismaClient({ log: ['error'] });
    `);

    expect(status.ready).toBe(false);
    expect(status.adapterLocalName).toBe('PrismaD1');
    expect(status.adapterInstanceLocalName).toBeNull();
    expect(status.prismaClientLocalName).toBe('PrismaClient');
    expect(status.checks.constructsPrismaD1Adapter).toBe(false);
    expect(status.checks.passesAdapterToPrismaClient).toBe(false);
  });

  it('distinguishes quoted matches from executable source after comment masking', () => {
    const code = stripComments(`
      const example = 'new PrismaClient({ adapter })'; // ignored example
      const prisma = new PrismaClient({ adapter });
    `);
    const quotedIndex = code.indexOf('new PrismaClient');
    const executableIndex = code.lastIndexOf('new PrismaClient');

    expect(isSourceCodeIndex(code, quotedIndex)).toBe(false);
    expect(isSourceCodeIndex(code, executableIndex)).toBe(true);
  });
});
