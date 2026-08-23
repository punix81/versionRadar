---
name: version-radar
description: Maintain VersionRadar repository scanning, generated data, and domain rules.
---

# VersionRadar domain

Use this skill for repository scan behaviour, package and pipeline data, malicious NPM package matching, scripts, configuration, or generated dashboard assets.

## Data flow

`config/package-repositories.json` configures `package.json` and sibling `package-lock.json` retrieval. `scripts/fetch-package-versions.ts` writes package results to `src/assets/data/repositories.json`.

`config/repositories.json` configures `Chart.yaml` retrieval. The pipeline script extracts configured dependency/container image versions and writes `src/assets/data/pipelines.json`.

`server/config-server.ts` owns admin configuration writes and synchronises asset stubs when repository configuration changes.

## Rules

- Model failed retrieval, missing files, malformed data, and pending results explicitly; do not turn them into successful scans.
- Preserve lockfile compatibility: `packages` is used by newer npm lockfiles and recursive `dependencies` by older lockfiles.
- Malicious-package CSV headers may be `package`, `package_name`, `name`, `npm_package`, or `npm`; version fields may be `version`, `package_version`, `versions`, or `malicious_version`. Comma and semicolon separators are supported.
- Do not edit `src/assets/data/repositories.json` or `pipelines.json` casually; they are generated or synchronised outputs. Prefer changing their source configuration or generator and regenerate only with authorised credentials.
- Keep repository metadata in `config/`, not Angular source.

Run the relevant Vitest suite and TypeScript checks after changes.
