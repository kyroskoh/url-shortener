# Contributing

## Development

Requirements: Node.js 22+, Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

Local packages (from repo root):

```bash
npm install
npm run dev -w @blink/api
npm run dev -w @blink/web
```

## Checks

```bash
npm run lint
npm run typecheck
npm run test -w @blink/api
npm run smoke
npm audit
```

## Schema migrations

SQL migrations live under `apps/api/drizzle/` and run on API startup. To regenerate from the Drizzle schema (optional):

```bash
npm run db:generate -w @blink/api
```

That invokes `npx drizzle-kit` (not a locked workspace dependency) so audit stays clean.

## Guidelines

- Follow the Phase roadmap in [PRD.md](PRD.md); do not implement Phase 1–4 features in ad-hoc PRs without updating the PRD acceptance lists
- No debug leftover logs; use structured logging in the API
- Prefer small PRs with tests for API behavior
- Never commit secrets (`.env`, Cloudflare tokens, passwords)
- Keep `npm audit` at 0 when changing dependencies

## License

By contributing, you agree your contributions are licensed under the MIT License ([LICENSE.md](LICENSE.md)).
