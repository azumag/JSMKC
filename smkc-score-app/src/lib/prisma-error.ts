import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Type-safe Prisma error-code checks (issue #2993). Route handlers used to
 * duck-type with `'code' in error`, which would misclassify an arbitrary
 * `{ code: 'P2002' }` object thrown by application code as a unique-constraint
 * violation. `instanceof PrismaClientKnownRequestError` is the same pattern
 * already used in finals-phase-manager.ts and battle-royale-start-conflict.ts.
 */
export function isPrismaErrorCode(error: unknown, code: 'P2002' | 'P2025' | 'P2003'): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === code;
}
