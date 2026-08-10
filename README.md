# VersionRadar

VersionRadar is an Angular dashboard for monitoring package, pipeline, and NPM lockfile security data across Azure DevOps and Bitbucket repositories.

## Features

- Fetch pipeline versions from Bitbucket `Chart.yaml` files.
- Fetch package versions and dependencies from Azure DevOps and Bitbucket `package.json` files.
- Fetch `package-lock.json` dependencies when available.
- Scan lockfile packages against a CSV list of confirmed malicious NPM packages.
- Show NPM Worm scan results by project:
  - project name
  - total packages found in `package-lock.json`
  - contaminated package count
  - secure / not secure status
- Manage repositories, tokens, script settings, and the malicious package CSV from the dashboard admin panel.

## Quick Start

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example` and fill in the credentials:

```bash
cp .env.example .env
```

Start the local config server and Angular app:

```bash
npm start
```

Open:

```text
http://localhost:4200/
```

## Configuration

Most configuration can be edited in the dashboard under `Configuration Administration`.

### Tokens & Settings

The app uses `.env` for credentials and runtime settings:

```bash
# Azure DevOps
AZUREDEVOPS_TOKEN=your_azure_devops_token_here
AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18=your_defaultcollection18_azure_devops_token_here
AZUREDEVOPS_USER=your_azure_username

# Bitbucket
BITBUCKET_USER=your_bitbucket_username
BITBUCKET_TOKEN=your_bitbucket_token_here
BITBUCKET_BASE_URL=https://bitbucket.bit.admin.ch
BITBUCKET_AUTH_SCHEME=bearer

# Script settings
REQUEST_TIMEOUT_MS=30000
DATE_LOCALE=fr-CH
HOST_IP_OVERRIDES=bitbucket.bit.admin.ch=10.176.71.49,devops-server.admin.ch=10.222.11.225
```

`AZUREDEVOPS_TOKEN` is used for normal Azure DevOps collections such as `DefaultCollection`.

`AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18` is used automatically for Azure repositories configured with:

```json
"collection": "DefaultCollection18"
```

`BITBUCKET_AUTH_SCHEME=bearer` is the default for current Bitbucket tokens. Set it to `basic` only if your Bitbucket token explicitly requires Basic Auth.

`HOST_IP_OVERRIDES` is optional but useful in environments where Node.js cannot resolve internal DNS names reliably. It keeps the real host name for TLS and HTTP headers while connecting to the configured IP.

Never commit `.env`.

### Package Repositories

Package repositories are configured in:

```text
config/package-repositories.json
```

The package fetch script reads each configured `package.json` and, when present, the sibling `package-lock.json`.

Example Azure repository:

```json
{
  "platform": "azure",
  "collection": "DefaultCollection18",
  "project": "Seco_NLR",
  "repo": "Seco_NLR_UI",
  "name": "Seco_NLR_UI",
  "path": "package.json",
  "branch": "dev"
}
```

Example Bitbucket repository:

```json
{
  "platform": "bitbucket",
  "project": "BJBOHREG",
  "repo": "bj_bo_hreg_ui",
  "name": "BJ BO HREG",
  "path": "package.json"
}
```

### Pipeline Repositories

Pipeline repositories are configured in:

```text
config/repositories.json
```

The pipeline fetch script reads the configured `Chart.yaml` path and extracts configured pipeline dependency versions.

## NPM Worm Security Scan

The malicious package CSV is configured in the admin panel:

```text
Configuration Administration > Security
```

Add the CSV file, for example:

```text
/home/punix81/Downloads/malicious-packages.csv
```

Supported CSV columns:

- `package`, `package_name`, `name`, `npm_package`, or `npm`
- `version`, `package_version`, `versions`, or `malicious_version`

Comma and semicolon separators are supported.

The scan compares the CSV against packages found in `package-lock.json` data. Results are shown by project with:

- total lockfile packages found
- contaminated packages
- security status

The CSV is stored in browser `localStorage`, so it remains available after page reloads. Clear it from the `Security` admin tab when needed.

## Running Fetch Scripts

Fetch package and lockfile data:

```bash
npm run fetch-packages
```

Fetch pipeline data:

```bash
npm run fetch-pipelines
```

Fetch both from the UI:

```text
Dashboard > Refresh
```

The refresh button requires a malicious package CSV to be configured first, because the NPM Worm scan is part of the refresh workflow.

## Output Files

Fetched data is written to:

```text
src/assets/data/repositories.json
src/assets/data/pipelines.json
```

The Angular dashboard reads these files to display package, pipeline, and NPM Worm scan results.

## Troubleshooting

### Bitbucket returns HTTP 401

Check:

- `BITBUCKET_TOKEN` is current.
- `BITBUCKET_AUTH_SCHEME=bearer` for new bearer-style tokens.
- The token has read access to the project and repository.

### Azure DevOps returns HTTP 401

Check:

- `AZUREDEVOPS_TOKEN` has access to the collection/project/repo.
- Repositories in `DefaultCollection18` require `AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18`.
- The PAT has code read permissions.

### Azure DevOps returns HTTP 404

Check:

- `collection`, `project`, `repo`, and `path` in `config/package-repositories.json`.
- The repo or file path may be wrong.
- Azure may also hide missing permissions as a not-found response in some cases.

### Node.js DNS errors

If scripts show `EAI_AGAIN` for internal hosts, configure:

```bash
HOST_IP_OVERRIDES=bitbucket.bit.admin.ch=10.176.71.49,devops-server.admin.ch=10.222.11.225
```

Update the IPs if the internal endpoints change.

## Development

Run the application:

```bash
npm start
```

Run tests:

```bash
npm test -- --run
```

Type-check the Angular app:

```bash
npx tsc --project tsconfig.app.json --noEmit
```

Type-check scripts:

```bash
npx tsc --project tsconfig.scripts.json --noEmit
```

Build:

```bash
npm run build
```

Note: the current production build may fail on Angular style budgets if existing component SCSS exceeds the configured budget.
