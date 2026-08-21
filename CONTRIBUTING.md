# Contributing

## Scope

Keep changes focused and preserve the existing runtime contracts. Do not change Lambda handlers, Express behavior, SDK runtime behavior, JWT claims, API contracts, DynamoDB/Kafka/Centrifugo connections, or infrastructure resource behavior as part of repository-quality work.

## Setup

Use Node.js 20 or newer. Each package is independent and has its own lockfile; install dependencies in the package you are working on with `npm ci` (or `npm install` when developing a package without a lockfile).

The root commands are credential-free unless explicitly noted:

```sh
npm run check       # static checks, SDK tests, smoke tests, example checks, OpenTofu validation
npm run lint        # JavaScript syntax checks
npm run format      # OpenTofu formatting check
npm run security    # lockfile dependency audit
```

Live apps and acceptance flows require environment configuration and deployed services. They are not part of the default root check.

## Pull Requests

- Explain the user or maintenance problem and the scope of the change.
- Include validation commands and note any checks that could not run.
- Do not commit `.env` files, credentials, OpenTofu state, plans, generated archives, or build output.
- Keep generated artifacts out of commits unless a specific deployment process requires them.

## Infrastructure

Validate stacks independently with `npm run check:tofu:main` and `npm run check:tofu:centrifugo`. Do not run `plan` or `apply` from CI, and do not commit state or plan output.
