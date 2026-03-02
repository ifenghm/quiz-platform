#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# check-build.sh
#
# Runs all compile-time checks without needing a live Supabase connection.
# Safe to run in CI or locally before pushing.
#
# Usage:
#   chmod +x scripts/check-build.sh
#   ./scripts/check-build.sh
# ──────────────────────────────────────────────────────────────────────────────

set -e  # exit immediately on any error

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "▶ Step 1/3 — TypeScript type check"
echo "────────────────────────────────────"
npx tsc --noEmit
echo "✓ No TypeScript errors"

echo ""
echo "▶ Step 2/3 — ESLint"
echo "────────────────────────────────────"
npx next lint
echo "✓ No lint errors"

echo ""
echo "▶ Step 3/3 — Next.js production build"
echo "────────────────────────────────────"
# Stub env vars so Next.js doesn't abort at config-read time
# (no real Supabase calls happen during build)
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder-anon-key" \
npx next build
echo "✓ Build succeeded"

echo ""
echo "══════════════════════════════════════"
echo "  All checks passed."
echo "══════════════════════════════════════"
