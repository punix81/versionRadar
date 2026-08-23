---
name: security
description: Review security-sensitive code and NPM malware scanning in VersionRadar.
---

# Security

VersionRadar processes repository credentials and scans untrusted dependency data against a user-provided malicious-package CSV.

Always review changes for:

- secrets in source, fixtures, generated data, logs, URLs, or error messages;
- unsafe command execution, path traversal, URL construction, or configuration writes;
- untrusted CSV, JSON, YAML, package manifest, and lockfile input;
- token handling for Azure DevOps and Bitbucket;
- incorrect security status or version-match logic.

Secrets must come from environment variables. Do not print authentication headers, tokens, or raw remote error bodies. Use anonymised fixtures only. Treat a malformed or ambiguous security feed as an explicit error/unknown state rather than silently claiming that a repository is secure.
