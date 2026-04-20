# NestJS Auth Template

Simple NestJS template with JWT authentication, Prisma, and PostgreSQL.

## Stack

- NestJS
- Prisma
- PostgreSQL
- JWT authentication
- Docker

## Run With Docker

```bash
docker compose up --build
```

API will be available at `http://localhost:3000`.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create an `.env` file:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chat_autigest?schema=public
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/chat_autigest?schema=public
JWT_SECRET=change-me-in-production
PORT=3000
```

For Supabase, use the pooled connection in `DATABASE_URL` for the app runtime and the direct connection in `DIRECT_URL` for Prisma CLI commands such as `migrate` and `db push`.

3. Generate Prisma client and sync the database:

```bash
npx prisma generate
npx prisma db push
```

4. Start the app:

```bash
npm run start:dev
```

## Available Scripts

```bash
npm run build
npm run start:dev
npm run start:prod
npx prisma generate
npx prisma db push
```

## Auth Routes

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

## Request Example

```json
{
  "username": "test",
  "password": "123456"
}
```
