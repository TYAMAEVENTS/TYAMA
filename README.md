# ТЯМА

Closed working Pilot for Свят Галюк. This repository is the active source of truth for application code, migrations, tests, and deployment configuration.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres/Auth/Storage
- Vercel
- OpenAI API server-side only and non-blocking

## Local setup

1. Copy `.env.example` to `.env.local` and provide values from the clean `tyama-pilot` project.
2. Apply the reviewed migrations in `supabase/migrations/`.
3. Create Свят's Auth user manually; no signup UI exists.
4. Run `npm run dev`.

Never commit `.env.local`, service/secret keys, passwords, or raw public capability tokens.

## Deployment

- Vercel project: `tyama`
- Production branch: `main`
- Git repository: `TYAMAEVENTS/TYAMA`
