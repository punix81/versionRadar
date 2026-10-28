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
- Manage repositories, tokens, script settings, and the malicious package CSV from the admin (Configuration Administration) page.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the local config server and Angular app:

```bash
npm start
```

Open:

```text
http://localhost:4200/
```

On first use, follow the on-screen flow: add your repositories and enter your Azure DevOps / Bitbucket tokens under **Configuration → Tokens & Settings**. Tokens are write-only in the UI: once stored, the app only reports whether they are configured, never their value.

## Configuration

All configuration is edited in the app under **Configuration Administration** (reachable from the cog icon in the top toolbar).

### Tokens & Settings

Azure DevOps and Bitbucket credentials, the Bitbucket base URL, request timeout, date locale, and advanced connection overrides are entered under **Configuration → Tokens & Settings** and saved with the **Save .env** button. The local config server persists them to the external credential file (`~/.config/opencode/versionRadar.env`, permissions 600), which the fetch scripts and the MCP server load at startup. The file lives outside the repository and is never committed.

The two Azure tokens are used as follows:

- `AZUREDEVOPS_TOKEN` — normal collections such as `DefaultCollection`.
- `AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18` — used automatically for repositories whose `collection` is `DefaultCollection18`.

`BITBUCKET_AUTH_SCHEME=bearer` is the default for current Bitbucket tokens; only switch to `basic` if your token explicitly requires Basic Auth.

`HOST_IP_OVERRIDES` is optional but useful when Node.js cannot reliably resolve internal DNS names. It keeps the real host name for TLS and HTTP headers while connecting to the configured IP. It can be set from the same **Tokens & Settings** tab or added directly to the credential file.

Never commit the credential file, and never paste its contents in a chat or an issue.

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
  "project": "EXAMPLE_PROJECT",
  "repo": "example-repo",
  "name": "Example repository",
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
path/to/malicious-packages.csv
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

The dashboard **Refresh** re-runs the fetch scripts for the configured repositories and reloads the displayed data. A malicious package CSV is optional and not required for the refresh to work.

### Python versions from the command line

The same fetchers are also available as Python scripts and can be run directly from the terminal:

```bash
npm run fetch-packages:python
npm run fetch-pipelines:python
```

or:

```bash
python scripts/fetch_package_versions.py
python scripts/fetch_pipeline_versions.py
```

On Windows, use `python` (not `python3`). Install the Python dependencies once with:

```bash
python -m pip install -r requirements.txt
```

The Python scripts read the same `config/*.json` and credential file, and write to the same `src/assets/data/*.json` files, so the results are identical to the TypeScript versions.

## Data separation (public repository)

VersionRadar is published as source code only. Operational data stays local:

| Content | Tracked in Git | Location |
| --- | --- | --- |
| Application and server code | yes | `src/`, `server/`, `scripts/` |
| Anonymised examples and fixtures | yes | `config/*.example.json`, `scripts/test/fixtures.ts` |
| Monitored repository inventory | **no** (gitignored) | `config/repositories.json`, `config/package-repositories.json` |
| Real scan results | **no** (gitignored) | `src/assets/data/repositories.json`, `src/assets/data/pipelines.json` |
| Scan metadata | **no** (gitignored) | `src/assets/data/scan-metadata.json` |
| Credentials | **no** (outside the repository) | `~/.config/opencode/versionRadar.env` |

On a fresh clone, empty local files are seeded from the examples:

```bash
npm run data:init   # also runs automatically before npm start
```

Existing files are never overwritten. Configure your repositories from the admin
UI, then run a scan. `scan_status` reports `lastScanAt: null` until a complete
scan has succeeded.

## Output Files

Fetched data is written to:

```text
src/assets/data/repositories.json
src/assets/data/pipelines.json
```

The Angular dashboard reads these files to display package, pipeline, and NPM Worm scan results.

## MCP server (OpenCode terminal)

VersionRadar exposes its data through a local MCP server (stdio transport, no web
server, no Angular, no Express). It reads the generated JSON assets and never
triggers a network call unless `refresh_versions` is explicitly enabled.

```bash
npm run mcp:build   # compiles to dist-mcp/
npm run mcp         # build + run over stdio (for manual testing)
```

Credentials come from a single file outside the repository:

```text
~/.config/opencode/versionRadar.env   (chmod 600, directory 700)
```

`.env.example` documents the variables with placeholders only. The server reports
which credentials are present (`check_credentials`) and never returns their values.

The server is registered in the global OpenCode V2 configuration under
`mcp.servers.versionradar`. Available tools: `scan_status`, `list_repositories`,
`get_repository`, `query_dependencies`, `find_package_usage`, `list_pipelines`,
`get_pipeline`, `compare_versions`, `check_credentials`.

`refresh_versions` is **disabled by default**. It is only registered when the
server is started with `VERSIONRADAR_MCP_ALLOW_REFRESH=1`, and it then applies one
of two authorization modes.

### Strict mode (default)

A local single-use consent file created by the human operator is required:

```bash
npm run mcp:allow-refresh -- --target all
```

No token is transmitted to the model: the consent file itself is the authorization.
It expires (10 minutes by default), is consumed by the next refresh call, and a
confirmation in the chat is not accepted as consent. This stays the default for
unknown clients.

### OpenCode local mode (explicit opt-in)

For a local OpenCode installation, the per-call approval can be delegated to
OpenCode's permission prompt instead of a consent file. Enable it explicitly in
the **private** local configuration (`~/.config/opencode/opencode.json`), never in
a shared or Marketplace default:

```jsonc
{
  "mcp": {
    "servers": {
      "versionradar": {
        "type": "local",
        "command": ["node", "/path/to/versionRadar/dist-mcp/mcp/server.js"],
        "environment": {
          "VERSIONRADAR_ENV_FILE": "~/.config/opencode/versionRadar.env",
          "VERSIONRADAR_MCP_ALLOW_REFRESH": "1",
          "VERSIONRADAR_MCP_APPROVAL_MODE": "opencode"
        }
      }
    }
  },
  "permissions": [
    { "action": "versionradar_refresh_versions", "resource": "*", "effect": "ask" }
  ]
}
```

`VERSIONRADAR_MCP_ALLOW_REFRESH=1` is still required: the mode only replaces the
consent file, it never registers the tool on its own. An unknown
`VERSIONRADAR_MCP_APPROVAL_MODE` value falls back to `strict`.

The `permissions` rule is not optional. OpenCode's default policy allows every
action, so without an explicit `ask` rule the tool would run unattended. The action
name is the MCP tool name prefixed with the server name, as documented in the
OpenCode V2 permissions guide.

**Security limits of this mode.** An OpenCode permission rule is a client-side
control, not authentication of the MCP server. It only protects calls made through
this OpenCode host: any other local client or process that can start
`dist-mcp/mcp/server.js` with the same environment bypasses it. The mode therefore
delegates trust to the local host. It never disables TLS validation, credential
handling, input validation, repository/path limits or error handling, and it never
grants a generic shell tool. Choosing **Allow always** in OpenCode saves a durable
`allow` rule outside the server's control; the server cannot enforce a single
execution per approval, only the client can.

Each successful retrieval records its real date in
`src/assets/data/scan-metadata.json`. `scan_status` exposes `lastScanAt` (null when
unknown) separately from the file modification time.

The usage guide for models is `.agents/skills/versionradar-mcp/SKILL.md`.

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
HOST_IP_OVERRIDES=bitbucket.example.internal=<ip>,devops.example.internal=<ip>
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
