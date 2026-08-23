---
name: angular-development
description: Implement and refactor Angular frontend functionality in VersionRadar.
---

# Angular development

Use this skill for Angular components, templates, styles, routes, and frontend services.

- Inspect `src/app` and search for a component or service with the same responsibility before creating one.
- Keep presentation separate from parsing, version comparison, and security decisions. Put reusable domain logic in testable TypeScript functions/services.
- Use standalone components, `inject()`, strict types, signals where they simplify local state, typed reactive forms, and native `@if`/`@for` for new code.
- Prefer OnPush-compatible patterns. Avoid `any`, direct DOM work, and unnecessary or nested RxJS subscriptions.
- Reuse the existing Angular Material, SCSS, and dashboard patterns; do not add a second component or styling framework.

After frontend behaviour changes, run:

```bash
npm test -- --run
npx tsc --project tsconfig.app.json --noEmit
```
