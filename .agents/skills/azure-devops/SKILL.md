---
name: azure-devops
description: Maintain Azure DevOps repository retrieval in VersionRadar safely.
---

# Azure DevOps retrieval

Use this skill when changing Azure repository configuration, API requests, or authentication in fetching scripts.

- Azure repository definitions use `platform: "azure"` and may set `collection`. The default collection is `DefaultCollection`.
- Read `AZUREDEVOPS_USER` and `AZUREDEVOPS_TOKEN` from the environment. Use `AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18` only for configured `DefaultCollection18` repositories.
- Azure retrieval uses the Git items API with an encoded, validated repository path and a Basic authorization header built in memory.
- Never hardcode collection hosts, credentials, PATs, or a token in config, generated output, errors, or logs.
- Treat HTTP 401 and 404 as non-sensitive status results. Azure can conceal an authorisation issue as a 404, so do not expose extra details.

Test configuration selection and request construction without contacting a live Azure DevOps instance unless the user explicitly authorises it.
