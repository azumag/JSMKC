import { readFileSync } from 'node:fs';

import {
  extractPrismaClientOptions,
  findNamedImportLocalName,
  formatPrismaV7DriverAdapter,
  inspectPrismaV7DriverAdapter,
  stripComments,
} from '../../scripts/prisma-v7-driver-adapter.cjs';

describe('Prisma 7 D1 driver adapter readiness', () => {
  const readySource = `
    import { PrismaD1 as D1Adapter } from '@prisma/adapter-d1';
    import { PrismaClient as DatabaseClient } from './generated/prisma/client';

    const adapter = new D1Adapter(db);
    const prisma = new DatabaseClient({
      adapter,
      log: ['error'],
      omit: { player: { password: true } },
    });
  `;

  it('accepts explicit D1 adapter construction and PrismaClient adapter wiring', () => {
    const status = inspectPrismaV7DriverAdapter(readySource);

    expect(status).toEqual({
      ready: true,
      adapterLocalName: 'D1Adapter',
      prismaClientLocalName: 'DatabaseClient',
      checks: {
        importsPrismaD1Adapter: true,
        constructsPrismaD1Adapter: true,
        passesAdapterToPrismaClient: true,
      },
    });
  });

  it('does not treat an installed or imported adapter as sufficient when PrismaClient omits it', () => {
    const status = inspectPrismaV7DriverAdapter(`
      import { PrismaD1 } from '@prisma/adapter-d1';
      import { PrismaClient } from '@prisma/client';

      const adapter = new PrismaD1(db);
      const prisma = new PrismaClient({ log: ['error'] });
    `);

    expect(status.ready).toBe(false);
    expect(status.checks.importsPrismaD1Adapter).toBe(true);
    expect(status.checks.constructsPrismaD1Adapter).toBe(true);
    expect(status.checks.passesAdapterToPrismaClient).toBe(false);
  });

  it('does not accept adapter-shaped examples that exist only in comments', () => {
    const status = inspectPrismaV7DriverAdapter(`
      // import { PrismaD1 } from '@prisma/adapter-d1';
      import { PrismaClient } from '@prisma/client';
      /*
       * const adapter = new PrismaD1(db);
       * const old = new PrismaClient({ adapter });
       */
      const prisma = new PrismaClient({ log: ['error'] });
    `);

    expect(status.ready).toBe(false);
    expect(status.adapterLocalName).toBeNull();
    expect(status.checks.constructsPrismaD1Adapter).toBe(false);
    expect(status.checks.passesAdapterToPrismaClient).toBe(false);
  });

  it('keeps the current repository D1 client path ready for the Prisma 7 adapter requirement', () => {
    const source = readFileSync('src/lib/prisma.ts', 'utf8');
    const status = inspectPrismaV7DriverAdapter(source);

    expect(status.ready).toBe(true);
    expect(status.adapterLocalName).toBe('PrismaD1');
    expect(status.prismaClientLocalName).toBe('PrismaClient');
  });

  it('parses named-import aliases and PrismaClient options conservatively', () => {
    const code = stripComments(readySource);

    expect(findNamedImportLocalName(code, 'PrismaD1', '@prisma/adapter-d1')).toBe('D1Adapter');
    expect(findNamedImportLocalName(code, 'PrismaClient')).toBe('DatabaseClient');
    expect(extractPrismaClientOptions(code, 'DatabaseClient')).toContain('adapter,');
    expect(extractPrismaClientOptions(code, 'MissingClient')).toBeNull();
  });

  it('formats the result as read-only migration evidence', () => {
    const output = formatPrismaV7DriverAdapter(inspectPrismaV7DriverAdapter(readySource));

    expect(output).toContain('Driver adapter wiring: `ready`');
    expect(output).toContain('| passesAdapterToPrismaClient | ready |');
    expect(output).toContain('read-only probe');
  });
});
