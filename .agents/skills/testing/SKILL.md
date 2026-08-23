---
name: testing
description: Create, maintain, and execute automated tests for VersionRadar.
---

# Testing

VersionRadar uses Vitest. Prefer existing `*.spec.ts` files and test observable behaviour, parsing, validation, version extraction, and error handling rather than private implementation details.

- Update an existing test when it already owns the behaviour.
- Add a regression test for each bug fix and new tests for changed business logic.
- Keep remote calls, environment access, and browser storage deterministic through mocks or test seams.
- Never delete or weaken a failing test only to make CI pass.

Run:

```bash
npm test -- --run
```

For script or server changes, also type-check `tsconfig.scripts.json` or `tsconfig.server.json` as applicable.
