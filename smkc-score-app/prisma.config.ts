import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load .env.local first, then .env as fallback
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  engine: 'classic',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` runs during CI install without DATABASE_URL. Prisma's
    // config env() helper throws while loading every CLI command, even ones
    // that do not need a datasource, so keep this optional until a DB command
    // actually needs the URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
