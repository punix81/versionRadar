# VersionRadar

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## 🚀 VersionRadar Scripts

VersionRadar provides two types of scripts to monitor your repositories:

### 1. Fetch Pipeline Versions (Chart.yaml)

Automatically fetch pipeline versions (e.g., `commons-pipeline`, `angular-pipeline`) from `Chart.yaml` files across multiple Bitbucket Server repositories.

**Available Implementations:**
- **TypeScript/Node.js** - `scripts/fetch-pipeline-versions.ts`
- **Python 3** - `scripts/fetch_pipeline_versions.py`

**Configuration:** `config/repositories.json`

### 2. Fetch Package Versions (package.json) 🆕

Automatically fetch **@oblique/oblique** and **@angular/cdk** versions from `package.json` files across Azure DevOps and Bitbucket repositories.

**Available Implementations:**
- **TypeScript/Node.js** - `scripts/fetch-package-versions.ts`
- **Python 3** - `scripts/fetch_package_versions.py`

**Configuration:** `config/package-repositories.json`

## Prerequisites

- **For TypeScript:** Node.js 18+ installed
- **For Python:** Python 3.10+ installed
- Access to Bitbucket Server with credentials
- Configuration files properly set up

### Installation

#### TypeScript/Node.js

1. **Install dependencies:**
```bash
npm install
```

2. **Create a `.env` file** in the project root with your credentials:
```bash
# Bitbucket Server
BITBUCKET_BASE_URL=https://bitbucket.bit.admin.ch
BITBUCKET_USER=your_username
BITBUCKET_TOKEN=your_token_or_password

# Azure DevOps
AZUREDEVOPS_USER=your_azure_username
AZUREDEVOPS_TOKEN=your_azure_pat_token

# Script settings
REQUEST_TIMEOUT_MS=30000
DATE_LOCALE=fr-CH
```

**⚠️ Security Warning:** Never commit `.env` to version control. Add it to `.gitignore`.

3. **Configure repositories** in `config/repositories.json`:
```json
{
  "filePath": "pipeline/Chart.yaml",
  "pipelineNames": ["commons-pipeline", "angular-pipeline"],
  "repositories": [
    {
      "project": "PROJECT_KEY",
      "repo": "repository-slug",
      "name": "Repository Display Name",
      "branch": "main"
    }
  ]
}
```

#### Python 3

1. **Create a virtual environment (recommended):**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

3. **Create a `.env` file** (same as TypeScript version):
```bash
BITBUCKET_BASE_URL=https://bitbucket.bit.admin.ch
BITBUCKET_USER=your_username
BITBUCKET_TOKEN=your_token_or_password
REQUEST_TIMEOUT_MS=30000
DATE_LOCALE=fr-CH
```

**Note:** On Debian/Ubuntu, if you get an error about `python3-venv`, install it:
```bash
sudo apt install python3.12-venv
```

### Usage

#### Fetch Pipeline Versions (Chart.yaml)

**TypeScript/Node.js:**
```bash
npm run fetch-pipelines
# Or directly:
npx ts-node scripts/fetch-pipeline-versions.ts
```

**Python 3:**
```bash
npm run fetch-pipelines:python
# Or directly:
python3 scripts/fetch_pipeline_versions.py
```

#### Fetch Package Versions (package.json) 🆕

**TypeScript/Node.js:**
```bash
npm run fetch-packages
# Or directly:
npx ts-node scripts/fetch-package-versions.ts
```

**Python 3:**
```bash
npm run fetch-packages:python
# Or directly:
python3 scripts/fetch_package_versions.py
```

### Output

Both scripts will:
- ✅ Fetch `Chart.yaml` from each configured repository
- ✅ Extract pipeline versions
- ✅ Display individual results for each repository
- ✅ Show a summary table with all results
- ✅ Display statistics (success/error counts)

### Configuration Files

- **`config/repositories.json`** - List of Bitbucket repositories and pipelines to monitor (for Chart.yaml)
- **`config/package-repositories.json`** 🆕 - List of Azure DevOps and Bitbucket repositories to monitor (for package.json)
- **`config/messages.json`** - Console messages and labels (customizable)
- **`.env`** - Credentials and connection parameters (not tracked in git)
- **`requirements.txt`** - Python dependencies (for Python version only)

### How It Works

#### TypeScript Version
1. Uses Angular signals for reactive state management
2. Repositories are processed **sequentially** using callbacks
3. Each repository's `Chart.yaml` is fetched via HTTPS from Bitbucket Server
4. Pipeline versions are extracted from YAML dependencies
5. Results are aggregated and displayed in a formatted table

#### Python Version
1. Follows PEP 8 and PEP 484 conventions
2. Uses type hints for better code clarity
3. Repositories are processed **sequentially** with callbacks
4. Each repository's `Chart.yaml` is fetched via HTTPS from Bitbucket Server
5. Pipeline versions are extracted from YAML dependencies
6. Results are aggregated and displayed in a formatted table

### Error Handling

- Connection timeouts are handled with a configurable timeout (default: 30s)
- Failed repositories show error messages without exposing sensitive data
- All credentials are kept secure in `.env` and never logged to console

### Example Output

```
🚀 VersionRadar - Fetch Pipeline Versions (via Renovate approach)
📅 Date: 17.02.2026
📁 Fichier recherché: pipeline/Chart.yaml
🔢 Nombre de repositories: 8

⏳ Fetching [1/8] Repository Name...

╔══════════════════════════════════════════════════════════════════════════════╗
║                          📊 Version Summary Report                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Repository         │ commons-pipeline  │ angular-pipeline  │ Status        ║
╠──────────────────────────────────────────────────────────────────────────────╣
║ Repository Name    │ 1.2.3             │ 2.1.0             │ ✅ Success    ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 Summary: 7 success, 1 errors on 8 repositories
```

## Development server
2. Repositories are processed **sequentially** using callbacks
3. Each repository's `Chart.yaml` is fetched via HTTPS from Bitbucket Server
4. Pipeline versions are extracted from YAML dependencies
5. Results are aggregated and displayed in a formatted table

### Error Handling

- Connection timeouts are handled with a configurable timeout (default: 30s)
- Failed repositories show error messages without exposing sensitive data
- All credentials are kept secure in `.env` and never logged to console

### Example Output

```
🚀 VersionRadar - Fetch Pipeline Versions (via Renovate approach)
📅 Date: 17.02.2026
📁 Fichier recherché: pipeline/Chart.yaml
🔢 Nombre de repositories: 8

⏳ Fetching [1/8] Repository Name...

╔══════════════════════════════════════════════════════════════════════════════╗
║                          📊 Version Summary Report                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Repository         │ commons-pipeline  │ angular-pipeline  │ Status        ║
╠──────────────────────────────────────────────────────────────────────────────╣
║ Repository Name    │ 1.2.3             │ 2.1.0             │ ✅ Success    ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 Summary: 7 success, 1 errors on 8 repositories
```

### Choosing Between TypeScript and Python

Both implementations provide identical functionality. Here's a quick comparison:

| Aspect | TypeScript | Python |
|--------|-----------|--------|
| **Startup** | ~1-2s | ~0.5s ⭐ |
| **Memory** | ~50-100MB | ~30-50MB ⭐ |
| **Type Safety** | ✅ Full | ✅ Type hints |
| **Setup** | Simple | Needs venv |
| **Best For** | Node.js environments | Standalone scripts |

**See [TYPESCRIPT_VS_PYTHON.md](./TYPESCRIPT_VS_PYTHON.md) for detailed comparison.**

## Installation & Quick Start

For detailed installation instructions for both versions, see [INSTALLATION.md](./INSTALLATION.md)

## Development server

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
