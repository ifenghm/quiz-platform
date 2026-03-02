# QuizPlatform

A full-stack quiz platform built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and Supabase.

Users can create quizzes with four question types (binary, rank, scale, string), control who can take or edit them via granular permissions, and view analytics on responses.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Next.js 14 (App Router), React 18 |
| Styling   | Tailwind CSS                      |
| Charts    | Recharts                          |
| Backend   | Supabase (Postgres + Auth + RLS)  |
| Language  | TypeScript                        |

---

## Project Structure

```
quiz-platform/
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── auth/             # Login, register, OAuth callback
│   │   ├── dashboard/        # User dashboard
│   │   └── quizzes/
│   │       ├── create/       # Quiz creation
│   │       └── [id]/         # Take / Edit / Analyze tabs
│   ├── components/
│   │   ├── layout/           # Navbar
│   │   └── quiz/             # Forms, analytics, question types
│   ├── lib/supabase/         # Browser + server Supabase clients
│   ├── middleware.ts          # Auth route protection
│   └── types/index.ts        # Shared TypeScript types
└── supabase/
    └── migrations/
        └── 001_schema.sql    # Full DB schema + RLS policies
```

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [npm](https://npmjs.com) (comes with Node)
- A [Supabase](https://supabase.com) project (free tier works fine)

---

## 1. Supabase Setup

### 1a. Create a project

Go to [supabase.com](https://supabase.com), create a new project, and wait for it to provision.

### 1b. Run the migration

In the Supabase dashboard, open **SQL Editor** and paste the contents of:

```
supabase/migrations/001_schema.sql
```

Run it. This creates all tables, RLS policies, indexes, and the trigger that auto-creates a `user_accounts` row on signup.

### 1c. Copy your API keys

In your Supabase project go to **Settings → API** and copy:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 2. Environment Variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

`.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> These two variables are the only ones required. The `NEXT_PUBLIC_` prefix makes them available in the browser — the anon key is safe to expose because Supabase RLS enforces all access rules on the server.

---

## 3. Install Dependencies

```bash
npm install
```

---

## 4. Development

```bash
npm run dev
```

The app runs at **http://localhost:3000**.

Next.js will hot-reload on file changes. Supabase requests go directly to your cloud project — there is no local Supabase instance needed.

### Useful dev notes

- **Auth emails** — Supabase sends a confirmation email on register. In development you can disable email confirmation in your Supabase project under **Authentication → Providers → Email → Confirm email**.
- **RLS** — All data access is enforced by Postgres Row Level Security. If a query returns no data unexpectedly, check that the logged-in user has the right permission.
- **Logs** — Supabase query logs are available in your dashboard under **Logs → Postgres**.

---

## 5. Production Build

### 5a. Build

```bash
npm run build
```

Next.js compiles and statically analyses every page. TypeScript errors and missing env vars will surface here. Fix all errors before deploying.

### 5b. Run the production server locally (optional smoke test)

```bash
npm start
```

Runs the compiled output at **http://localhost:3000**. Use this to verify the production build before pushing.

---

## 6. Deploying to Production

Vercel is the simplest path because it was built for Next.js.

```bash
npm install -g vercel
vercel
```

Or connect your Git repo at [vercel.com](https://vercel.com) and it will deploy automatically on every push to `main`.

**Set environment variables** in the Vercel dashboard under **Project → Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## 7. Supabase Auth Redirect URL

For email confirmation links to work in production, add your production domain to Supabase's allowed redirect URLs:

**Supabase dashboard → Authentication → URL Configuration**

```
Site URL:          https://your-domain.com
Redirect URLs:     https://your-domain.com/auth/callback
```

---

## 8. Scripts Reference

| Command                       | Description                                            |
|-------------------------------|--------------------------------------------------------|
| `npm run dev`                 | Start development server with hot reload               |
| `npm run build`               | Compile and optimise for production                    |
| `npm start`                   | Run the compiled production build                      |
| `npm run lint`                | Run ESLint across the project                          |
| `npm run typecheck`           | Type-check with `tsc --noEmit` (fast, no output files) |
| `npm run ci`                  | typecheck + lint + build in sequence                   |
| `./scripts/check-build.sh`    | Same as `ci` with step-by-step output and stub env vars|
| `npm run sync-migrations`     | Generate a migration from type changes (see below)     |
| `npm run sync-migrations:dry` | Preview what the migration would look like             |

### Syncing migrations from types

`scripts/sync-migrations.mjs` keeps `supabase/migrations/` in sync with `src/types/index.ts`. Run it after editing the types file.

**What it detects:**

| Change in `types/index.ts` | Generated SQL |
|---|---|
| Value added/removed from a union type | Rebuilds the `CHECK (… IN (…))` constraint |
| Field added to a row interface | `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` |
| Field removed from a row interface | Commented-out `DROP COLUMN` with a warning (requires manual review) |
| `AnswerType` changed | Rebuilds the `answer_type_matches_value` compound constraint |

```bash
# Preview without writing anything
npm run sync-migrations:dry

# Write a new numbered file to supabase/migrations/
npm run sync-migrations
```

Running the command when no changes are detected prints:

```
✅ Schema is already in sync — no migration needed.
```

The script maps TypeScript names to SQL identifiers via `ENUM_MAPPINGS` and `INTERFACE_MAPPINGS` at the top of the file. Add entries there when introducing new tracked types.

### Checking types without a full build

`npm run typecheck` is the fastest way to catch type errors — it runs the TypeScript compiler without emitting any files, so it's much faster than `npm run build`:

```bash
npm run typecheck
```

### Running all checks before pushing

```bash
./scripts/check-build.sh
```

This stubs the Supabase env vars automatically (no `.env.local` needed) so it works in CI with no setup.

---

## 9. Data Model Quick Reference

```
quizzes
  └── questions[]          (ordered by order_index)
  └── quiz_permissions[]   (read | write | analyze grants per user)

answers
  ├── BinaryAnswer      — boolean     (true / false proportion)
  ├── RankAnswer        — integer     (discrete 1–N scale)
  ├── ScaleAnswer       — float       (continuous min–max slider)
  ├── StringAnswer      — text        (free-form input)
  └── MultiChoiceAnswer — text/JSON   (single or multi-select choices)
```

Access is enforced at the database level via Postgres RLS — the application never filters data manually.
