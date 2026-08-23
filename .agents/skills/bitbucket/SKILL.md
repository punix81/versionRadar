---
name: bitbucket
description: Maintain Bitbucket Server repository retrieval in VersionRadar safely.
---

# Bitbucket retrieval

Use this skill when changing Bitbucket repository configuration, API requests, pipeline retrieval, or authentication.

- Read `BITBUCKET_USER`, `BITBUCKET_TOKEN`, `BITBUCKET_BASE_URL`, and optional `BITBUCKET_AUTH_SCHEME` from environment variables only.
- The default authentication scheme is bearer; use Basic only when the deployed token explicitly requires it. Do not log either form of the authorization header.
- Raw files are retrieved from the Bitbucket Server REST endpoint using configured project, repository, path, and optional branch. Preserve URL encoding and validate untrusted values before they influence a URL.
- `Chart.yaml` is untrusted YAML; parse only the fields required for pipeline monitoring and handle malformed or unexpected structures as errors.
- Do not expose remote response bodies in errors, because they can contain internal details.

Use mocked HTTP requests for automated tests; a live Bitbucket call needs explicit user authorisation and valid environment configuration.
