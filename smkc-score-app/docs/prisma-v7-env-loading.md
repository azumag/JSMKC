# Prisma 7 environment loading readiness

Prisma ORM 7 no longer loads `.env` files automatically for Prisma CLI commands. A migration can therefore appear structurally complete while commands that depend on `DATABASE_URL` stop seeing the same environment values they used under Prisma 6.

JSMKC already loads environment files explicitly in `prisma.config.ts`:

1. `.env.local`
2. `.env`

That ordering is intentional and must be preserved during the Prisma 7 migration unless the deployment/environment strategy is deliberately changed.

## Read-only probe

Run from `smkc-score-app`:

```bash
node scripts/prisma-v7-env-loading.cjs
```

The probe accepts the Prisma upgrade-guide side-effect import:

```ts
import 'dotenv/config';
```

It also accepts explicit `dotenv` `config()` calls, including JSMKC's current named-import pattern. Imports that never invoke `config()` and commented examples do not count as readiness evidence.

The probe does not edit `prisma.config.ts`, `.env*` files, dependency versions, the lockfile, Prisma schema, generated client code, D1 configuration, or the temporary #3114 security-audit exception.

## Regression coverage

`__tests__/scripts/prisma-v7-env-loading.test.ts` verifies both supported loading styles and reads the repository's actual `prisma.config.ts`. If a future Prisma 7 migration rewrite accidentally removes explicit environment loading, the normal unit-test suite will fail before that change can be merged.

This is migration-readiness evidence only. It does not authorize changing environment precedence, introducing new secrets, or changing Cloudflare runtime bindings.
