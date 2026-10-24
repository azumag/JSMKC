// jest.setup.cjs replaces @prisma/client with lightweight fakes for every suite. This
// regression test must exercise the real generated Prisma 7 error class instead, so
// `instanceof` is checked against the class the runtime actually throws.
jest.unmock('@prisma/client');

import { Prisma } from '@prisma/client';
import { isPrismaErrorCode } from '@/lib/prisma-error';

const { PrismaClientKnownRequestError } = Prisma;

describe('isPrismaErrorCode (issue #2993 regression coverage, #3080)', () => {
  it('exercises the real Prisma runtime error class (guards jest.unmock above)', () => {
    const runtime = jest.requireActual<{ PrismaClientKnownRequestError: unknown }>('@prisma/client/runtime/client');
    expect(PrismaClientKnownRequestError).toBe(runtime.PrismaClientKnownRequestError);
  });

  it('returns true for a real Prisma P2002 error', () => {
    const error = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(isPrismaErrorCode(error, 'P2002')).toBe(true);
  });

  it('returns true for a real Prisma P2025 error', () => {
    const error = new PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(isPrismaErrorCode(error, 'P2025')).toBe(true);
  });

  it('returns false for a plain object with a matching code (duck-typed impostor)', () => {
    // The bug #2993 fixed: application code throwing `{ code: 'P2002' }` must
    // NOT be classified as a Prisma unique-constraint violation.
    expect(isPrismaErrorCode({ code: 'P2002', message: 'app error' }, 'P2002')).toBe(false);
    expect(isPrismaErrorCode({ code: 'P2025' }, 'P2025')).toBe(false);
  });

  it('returns false for a plain Error with a code property', () => {
    const error = Object.assign(new Error('db down'), { code: 'P2002' });
    expect(isPrismaErrorCode(error, 'P2002')).toBe(false);
  });

  it('returns false for a real Prisma error with a different code', () => {
    const error = new PrismaClientKnownRequestError('Foreign key failed', {
      code: 'P2003',
      clientVersion: 'test',
    });
    expect(isPrismaErrorCode(error, 'P2002')).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isPrismaErrorCode(null, 'P2002')).toBe(false);
    expect(isPrismaErrorCode(undefined, 'P2002')).toBe(false);
    expect(isPrismaErrorCode('P2002', 'P2002')).toBe(false);
    expect(isPrismaErrorCode(42, 'P2002')).toBe(false);
  });
});
