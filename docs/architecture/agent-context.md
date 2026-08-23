# VersionRadar: agent context

This document gives agents a concise architecture map. Project-wide working rules
are in [`AGENTS.md`](../../AGENTS.md); task-specific guidance is in
`.agents/skills/`.

## Runtime shape

```text
Angular dashboard (src/app)
        │ HTTP on localhost:3001
        ▼
Configuration server (server/config-server.ts)
        │ reads/writes
        ├── config/*.json
        ├── .env (local only)
        └── src/assets/data/*.json (synchronised stubs)

Fetch scripts (scripts/)
        │ authenticated read-only requests
        ▼
Azure DevOps / Bitbucket Server
        │ parsed package.json, package-lock.json, Chart.yaml
        ▼
src/assets/data/repositories.json and pipelines.json
        │ static dashboard reads
        ▼
Angular dashboard
```

## Ownership boundaries

| Area | Owns | Must not own |
| --- | --- | --- |
| `src/app` | Presentation, local UI state, display and user interaction | Credentials or hard-coded repository definitions |
| `server/` | Local admin configuration API and asset synchronisation | Remote repository parsing rules duplicated from scripts |
| `scripts/` | Authenticated retrieval, parsing, and generated scan output | Browser UI state |
| `config/` | Monitored repository and package/pipeline definitions | Credentials |
| `src/assets/data/` | Generated/synchronised read model for the dashboard | Hand-authored source-of-truth configuration |

## Important data contracts

- Package configuration is `config/package-repositories.json`; pipeline
  configuration is `config/repositories.json`.
- Package scanning retrieves `package.json` and, when available, sibling
  `package-lock.json`. Its generated result is `repositories.json`.
- Pipeline scanning retrieves `Chart.yaml`, extracting configured dependency or
  container-image versions. Its generated result is `pipelines.json`.
- The NPM malware CSV is selected by the user in the admin UI and persisted in
  browser storage; repository content and CSV data are untrusted.
- `.env` is a local credential store and must never be committed, displayed, or
  included in test fixtures.

## Change guidance

When a configuration schema changes, update the owner that reads it, the server
synchronisation behaviour, affected tests, and any relevant generated-data
contract. Do not manually patch generated asset data unless reproducing a
controlled test scenario and clearly identify it as such.
