# VersionRadar Agent Instructions

## Project

VersionRadar is an Angular 21 dashboard that monitors package versions, lockfile dependencies, NPM malware indicators, and CI/CD pipeline versions across Azure DevOps and Bitbucket repositories.

The repository contains an Angular frontend in `src/app`, a local Node/Express configuration server in `server/`, TypeScript and Python fetching scripts in `scripts/`, repository definitions in `config/`, and generated dashboard data in `src/assets/data/`.

Read the relevant skill in `.agents/skills/` before working in its area. Skills supplement this file; this file is the source of truth for shared rules.

## General rules

Before changing code:

1. Inspect the relevant implementation and tests.
2. Search for existing components, services, utilities, and patterns before adding an abstraction.
3. Keep the change small, focused, and backwards compatible.
4. Do not refactor unrelated code or reformat broad areas of the project.
5. Update or add focused tests when observable behaviour or business logic changes.

## Angular and TypeScript

- Use standalone Angular APIs, `inject()`, strict TypeScript, typed reactive forms, and `ChangeDetectionStrategy.OnPush` for new components where practical.
- Prefer `input()` and `output()` for new component APIs, signals for local state, `computed()` for derived state, and Angular native control flow.
- Avoid `any`, direct DOM manipulation, nested subscriptions, duplicated services, and business logic in templates.
- Keep parsing, version comparison, and security decisions independently testable outside UI components.
- Do not introduce another UI framework, package manager, or state-management library without an explicit need.

## Configuration and generated data

- Repository definitions belong in `config/package-repositories.json` and `config/repositories.json`; never hardcode them in Angular components.
- `src/assets/data/repositories.json` and `src/assets/data/pipelines.json` are generated/synchronised data. Understand `scripts/` and `server/config-server.ts` before changing them manually.
- Preserve the configuration server's synchronisation behaviour when changing configuration schemas.

## Security

- Never commit credentials, tokens, passwords, private credential-bearing URLs, `.env`, or real sensitive repository data.
- Read secrets from environment variables only; do not log tokens or full authenticated request headers.
- Treat remote repository content, CSV, JSON, YAML, and HTTP error content as untrusted input.
- Avoid unsafe shell execution and validate inputs that influence commands, paths, URLs, or configuration writes.

## Validation

Run the relevant checks after changes:

```bash
npm test -- --run
npx tsc --project tsconfig.app.json --noEmit
npx tsc --project tsconfig.scripts.json --noEmit
npm run build
```

Run `npm run lint` when linting changes or before a broad handoff. Do not remove tests merely to make checks pass. Report baseline failures separately from new ones, and state explicitly if a check cannot run.

## Agent workflow

1. Inspect and explain the intended scoped change.
2. Implement the smallest viable change.
3. Add or update tests.
4. Run proportionate validation.
5. Report changed files, validation results, and remaining risks.
