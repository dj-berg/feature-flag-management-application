# Portfolio Publication Readiness

This document records the checks and limitations for the standalone portfolio
tree. The public repository must be initialized without copying source history.
The existing development repository is not itself the publication source because
earlier commits contained environment-specific artifacts and internal process
files.

## Findings And Disposition

| Finding | Disposition |
| --- | --- |
| OpenTofu JWT key placeholders | Fixed: deployable keys require explicit secret-aware configuration. |
| DynamoDB recovery protection absent | Fixed: point-in-time recovery is enabled for both tables. |
| Centrifugo HTTP/WS fallback | Fixed: public deployment requires an ACM certificate and redirects HTTP to HTTPS. Local applications may use local HTTP/WS endpoints. |
| Anonymous consumer authentication | Intentional: `/consumer/auth` must be reachable before a bearer token exists and verifies client credentials. Rate limiting and edge protection remain required before deployment. |
| Consumer onboarding | Fixed to fail closed when `onboarding_api_key` is empty. Rate limiting and edge protection remain required before deployment. |
| JWT decode findings | Reviewed: decoded claims are inspected only before constrained `RS256` verification. Consumer verification enforces issuer and audience; Cognito verification selects a JWKS key by `kid` and then verifies the signature. |
| Demo DOM XSS findings | Fixed: local JSX is compiled at build time and served as a static JavaScript asset; browsers no longer fetch and execute source transformed at runtime. |
| Express file-serving rate-limit findings | Accepted as local-demo risk; deployable services require edge rate limiting and bounded request controls. |
| `elliptic` dependency findings | Two low-severity findings remain in `jwk-to-pem`; npm reports no available fix. Revisit when the dependency chain provides an upgrade. |

## Secret Handling

Never commit `.env` files, private keys, tokens, OpenTofu state, plans, generated
archives, or deployment configuration. If a real secret is found, revoke or
rotate it immediately and remove the affected file before publication.

## Validation Record

- `npm run check` passed: SDK build/tests, consumer smoke tests, example checks,
  and both OpenTofu validations completed.
- `npm run security` passed for primary packages.
- Gitleaks current-tree scan found no leaks.
- Snyk Centrifugo IaC scan found no issues.
- Snyk Code findings remain in the documented demo/JWT review categories.
- The gateway-authorizer dependency audit reports two low-severity findings with
  no available fix.
- WAF configuration, live staging validation, and production IAM review are out
  of scope for this portfolio version and must be completed before deployment.
- Staging validation requires deployment-specific credentials and infrastructure
  and is intentionally not performed by this portfolio repository check.
