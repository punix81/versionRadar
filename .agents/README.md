# VersionRadar agent skills

`AGENTS.md` contains the project-wide rules and takes precedence over every skill in this directory. Skills provide focused context for a working area; they are intentionally short so they remain maintainable and useful across IDEs and models.

Use the skill that matches the task:

- `angular-development`: Angular components, services, routing, templates, and styles.
- `testing`: Vitest tests and validation strategy.
- `security`: secrets, untrusted input, and security-scanning behaviour.
- `version-radar`: repository scanning, generated data, and domain rules.
- `azure-devops`: Azure DevOps retrieval and authentication.
- `bitbucket`: Bitbucket Server retrieval and authentication.

When multiple areas are involved, read each relevant skill. Do not duplicate project-wide rules here; amend `AGENTS.md` instead.
