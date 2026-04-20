import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma CLI commands must bypass Supabase's pooler and use the direct connection.
    url: env('DIRECT_URL'),
  },
});
