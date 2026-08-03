#!/usr/bin/env bash
# Привязка уже купленного домена к проекту madlib.
# Покупка: npx vercel domains buy chepuha.dev  (только интерактивно у вас)
set -euo pipefail
DOMAIN="${1:-chepuha.dev}"
PROJECT="${2:-madlib}"
echo "Adding $DOMAIN to $PROJECT…"
npx vercel domains add "$DOMAIN" "$PROJECT"
npx vercel domains verify "$DOMAIN" || true
echo "Done. Check https://vercel.com → madlib → Settings → Domains"
