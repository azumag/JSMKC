/**
 * TC-2786 / TC-2787: @prisma/client mock exposes error classes at module top level
 *
 * jest.setup.js mocks @prisma/client and puts PrismaClientKnownRequestError and
 * PrismaClientValidationError inside the Prisma namespace only.
 * TC-2786 / TC-2787 guard against regression where direct named imports
 * (`import { PrismaClientKnownRequestError } from '@prisma/client'`) would
 * silently resolve to `undefined` instead of the mock class.
 *
 * This is a drift-guard: the real assertion is that the classes are constructable
 * from the top-level mock so future code can use either import style.
 */

// Note: @prisma/client is mocked by jest.setup.js for all test files.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prismaClient = require('@prisma/client');

describe('TC-2786: PrismaClientKnownRequestError is exported at the top level of the @prisma/client mock', () => {
  it('is a constructor function accessible from the module root', () => {
    // TC-2786: top-level named-import style must resolve to the mock class
    expect(typeof prismaClient.PrismaClientKnownRequestError).toBe('function');
  });

  it('constructs an instance that is instanceof itself', () => {
    const { PrismaClientKnownRequestError } = prismaClient;
    const err = new PrismaClientKnownRequestError('test error', { code: 'P2002', clientVersion: '5.0.0' });
    expect(err).toBeInstanceOf(PrismaClientKnownRequestError);
    expect(err.code).toBe('P2002');
    expect(err.message).toBe('test error');
    expect(err.name).toBe('PrismaClientKnownRequestError');
  });

  it('is the same reference as Prisma.PrismaClientKnownRequestError', () => {
    // Both import paths must point to the same class so instanceof checks work
    // regardless of which form the consuming code uses.
    expect(prismaClient.PrismaClientKnownRequestError).toBe(
      prismaClient.Prisma.PrismaClientKnownRequestError
    );
  });
});

describe('TC-2787: PrismaClientValidationError is exported at the top level of the @prisma/client mock', () => {
  it('is a constructor function accessible from the module root', () => {
    // TC-2787: top-level named-import style must resolve to the mock class
    expect(typeof prismaClient.PrismaClientValidationError).toBe('function');
  });

  it('constructs an instance that is instanceof itself', () => {
    const { PrismaClientValidationError } = prismaClient;
    const err = new PrismaClientValidationError('validation error');
    expect(err).toBeInstanceOf(PrismaClientValidationError);
    expect(err.message).toBe('validation error');
    expect(err.name).toBe('PrismaClientValidationError');
  });

  it('is the same reference as Prisma.PrismaClientValidationError', () => {
    expect(prismaClient.PrismaClientValidationError).toBe(
      prismaClient.Prisma.PrismaClientValidationError
    );
  });
});
