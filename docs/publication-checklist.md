# Public Repository Publication Checklist

Use this checklist immediately before sending this project to a personal account
or creating a public GitHub repository.

## Current Verification Status

**TECHNICALLY SAFE TO SEND. HUMAN OWNERSHIP APPROVAL IS STILL REQUIRED.**

Verified on 2026-08-21:

- [x] `npm run check` passes.
- [x] `npm run security` passes for the audited packages.
- [x] Gitleaks current-tree and Git-history scans report no leaks.
- [x] No credential, private-key, AWS account ID, ARN containing an account ID, or private IP was found in the reviewed source tree.
- [x] Snyk Code reported no high-severity findings.
- [x] Snyk Centrifugo IaC scan reported no findings.
- [x] Browser-facing examples no longer recommend `NEXT_PUBLIC_FF_CLIENT_SECRET`.
- [x] The sendable copy has a fresh Git history with no prior commits.
- [x] Ignored generated files and directories have been excluded from the sendable copy.
- [ ] Employer, client, and policy authorization has been confirmed by the owner.

The final status becomes **SAFE TO SEND** after the remaining authorization item
is confirmed by the owner.

## Portfolio Privacy Review

- [x] Replace employer, client, school, department, team, product, and internal project names with neutral names.
- [x] Remove internal URLs, hostnames, VPN names, domain names, repository URLs, and service-discovery names.
- [x] Remove personal names, email addresses, usernames, home-directory paths, and employee identifiers.
- [x] Remove AWS account IDs, organization IDs, real ARNs, VPC IDs, subnet IDs, security group IDs, hosted zone IDs, and environment-specific resource names.
- [x] Replace private IP addresses with documentation-only ranges such as `203.0.113.10/32`.
- [x] Remove tenant names, customer names, real flag names, real application IDs, and production data.
- [x] Remove screenshots, logs, exports, copied tickets, and diagrams containing restricted information.
- [x] Remove internal planning documents, meeting notes, task instructions, agent instructions, and deployment history.
- [x] Remove generated Lambda archives, OpenTofu plans, state files, local databases, caches, and build artifacts.
- [x] Remove all real `.env` files; retain only sanitized `.env.example` templates.
- [x] Confirm no private key, certificate, token, password, API key, client secret, or signing material remains.

## Safe Replacement Examples

- [ ] Replace `https://api.private.example` with `https://api.example.com`.
- [ ] Replace a real Kafka ARN with `arn:aws:kafka:us-east-1:000000000000:cluster/example`.
- [ ] Replace `vpc-0123456789abcdef` with `vpc-REPLACE_ME`.
- [ ] Replace `employee@private.example` with `maintainer@example.com`.
- [ ] Replace real tenant data with `demo-account`, `demo-application`, and `checkout-v2`.
- [ ] Replace real secrets with empty values or `REPLACE_ME`; never use realistic-looking credentials.
- [x] Replace employer-specific terms with `Example Organization`, `Demo Consumer Application`, and `Feature Flag Platform`.

## Portfolio Scope Review

- [x] Retain the core application source and SDK implementation.
- [x] Retain Lambda handlers and infrastructure structure with placeholders.
- [x] Retain tests, CI configuration, architecture diagrams, API contracts, and integration examples.
- [x] Retain security guidance, contribution guidance, limitations, and production-readiness documentation.
- [x] Remove features that exist only for internal operations, deployment convenience, or environment debugging.
- [x] Confirm the repository requires explicit user-supplied credentials and infrastructure identifiers before deployment.
- [x] Confirm a clean clone does not contact AWS, Kafka, Centrifugo, or production endpoints by default.
- [x] Confirm the README describes this as a portfolio architecture demonstration, not an employer system or hosted production service.

## Final Human Review

- [x] Read every Markdown file as an external employer would.
- [x] Review every diagram label and code comment for internal terminology.
- [x] Review every example configuration value for accidental realism.
- [x] Review the complete sendable file tree, including hidden files.
- [ ] Confirm the repository owner has permission to publish the work.
- [ ] Confirm no confidentiality, intellectual-property, employment, client, or school policy prohibits publication.
- [ ] Obtain explicit approval from the appropriate owner when policy or ownership is unclear.

## Authorization To Publish

- [ ] Confirm the work may be copied to a personal account under the applicable employer, client, school, and contract policies.
- [ ] Confirm no employer-owned source code, credentials, customer data, private documentation, or proprietary designs are included.
- [ ] Confirm the repository name, description, screenshots, and documentation do not identify restricted systems or internal environments.

## Source Tree Review

- [ ] Review every file that will be copied, including hidden files and generated files.
- [ ] Remove `.env` files and keep only sanitized `.env.example` files.
- [ ] Remove private keys, certificates, tokens, passwords, API keys, SSH material, and credential files.
- [ ] Remove Terraform/OpenTofu state, plans, variable files, generated archives, deployment packages, and build output.
- [ ] Remove `node_modules`, `dist`, `build`, caches, logs, screenshots, exports, and local database files.
- [ ] Remove internal `AGENTS.md`, `SKILL.md`, planning notes, meeting notes, tickets, and private architecture documents unless explicitly approved.
- [ ] Remove employer names, internal project names, internal URLs, account IDs, VPC IDs, subnet IDs, security group IDs, hosted zone IDs, and private IP addresses.
- [ ] Replace real infrastructure identifiers with obvious placeholders such as `REPLACE_ME` or documentation ranges.
- [ ] Confirm examples use fake credentials and non-routable example values only.

## Secret And History Review

- [ ] Run `gitleaks detect --source . --redact` on the final source tree.
- [ ] If the source came from an existing repository, run a history scan before deciding whether history can be shared.
- [ ] Treat any prior secret exposure as compromised; revoke or rotate the credential before publication.
- [ ] Do not copy the existing `.git` directory when prior history contains internal files or deployment artifacts.
- [ ] Create a fresh repository history from the reviewed source tree when history is not approved for publication.
- [ ] Confirm no real credential has ever been used in the new repository history.

## Credential Handling

- [ ] Confirm all secrets are supplied through environment variables or a secret manager.
- [ ] Confirm no secret is named with `NEXT_PUBLIC_` or another browser-exposed prefix.
- [ ] Confirm browser code receives tokens only when the design explicitly requires it.
- [ ] Confirm client secrets remain server-side in server-bootstrap examples.
- [ ] Confirm OpenTofu secret variables have no usable defaults and fail closed when required.
- [ ] Confirm onboarding is disabled or protected when its API key is empty.

## Quality And Security Checks

- [ ] Install dependencies from committed lockfiles with `npm run setup` or the documented package commands.
- [ ] Run `npm run check` successfully.
- [ ] Run `npm run security` successfully.
- [ ] Run `gitleaks detect --source . --redact` successfully.
- [ ] Run Snyk Code scanning if available.
- [ ] Run Snyk IaC scans for every Terraform/OpenTofu stack if available.
- [ ] Review every high or critical dependency, code, and IaC finding; do not suppress findings without documenting the decision.
- [ ] Run `git diff --check` successfully.
- [ ] Confirm CI runs checks without requiring personal or employer credentials.
- [ ] Confirm tests and examples do not contact real AWS, Kafka, Centrifugo, or production endpoints by default.

## Documentation Review

- [ ] README explains the project purpose, architecture, repository map, prerequisites, setup, local run commands, tests, and limitations.
- [ ] README clearly states whether the project is a portfolio demonstration or production service.
- [ ] README links to architecture, integration, security, contribution, and production-readiness documentation.
- [ ] README explains what credentials are required and where they must be supplied.
- [ ] README warns users never to commit credentials, state, plans, archives, or build output.
- [ ] README includes the fresh-repository publication rule when existing history is not approved.
- [ ] Documentation distinguishes validated behavior from planned or unvalidated behavior.
- [ ] Documentation contains no real secrets, internal links, restricted names, or unsupported claims.
- [ ] Code examples are copyable, use safe placeholders, and do not teach insecure secret handling.

## Fresh Repository Verification

- [ ] Copy only the reviewed files into a new empty directory.
- [ ] Confirm the new directory has no copied `.git` directory.
- [ ] Initialize a new Git repository.
- [ ] Review `git status --short --ignored` before staging.
- [ ] Review `git diff --cached --stat` and `git diff --cached` before the first commit.
- [ ] Run the full checks again from the new repository.
- [ ] Run the secret scan again from the new repository.
- [ ] Inspect the GitHub repository preview after pushing, including the file tree, README rendering, and Actions configuration.
- [ ] Confirm the repository is private or unlisted until final approval.
- [ ] Only make the repository public after all checks are complete and the owner has explicitly approved publication.

## Final Decision

- [ ] All required checks pass.
- [ ] No unresolved credential, privacy, ownership, or policy concern remains.
- [ ] No unapproved historical content is present.
- [ ] The final repository can be marked **SAFE TO SEND**.
