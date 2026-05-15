# Theque

Personal visual library — capture URLs from desktop and mobile, enrich them into browseable shelf cards powered by Next.js and Supabase.

**Production:** https://theque.vercel.app (after Vercel project rename; custom domain later)

See `docs/product-brief.md` and `docs/data-model.md` for product and schema details.

## Setup

Copy `.env.local.example` to `.env.local` and fill Supabase keys from [the dashboard](https://supabase.com/dashboard).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign-in uses email magic links (configure redirect URLs for `/auth/callback` in Supabase Auth settings).

Optional demo data:

```bash
npm run seed
```

Requires `SEED_USER_ID` (your Supabase `auth.users` UUID) in `.env.local`.

## Chrome extension

See `docs/chrome-extension.md`. Default API base for production: `https://theque.vercel.app`

## Scripts

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Development server |
| `npm run build` | Production build (includes extension) |
| `npm test` | Vitest unit tests |
| `npm run seed` | Insert sample rows |

## Learn More

- [Next.js documentation](https://nextjs.org/docs)
