# 🚩 Feature Flag Management Platform

An AWS-based feature flag platform for managing, evaluating, and delivering tenant-scoped feature flags to applications in realtime.

Built with a TypeScript/OpenFeature SDK, DynamoDB, AWS Lambda, Kafka/MSK, Centrifugo, ECS/Fargate, and OpenTofu, the platform demonstrates an end-to-end feature flag architecture where changes can propagate to connected applications without requiring a redeployment or page refresh.

![CI](https://github.com/dj-berg/feature-flag-management-application/actions/workflows/ci.yml/badge.svg)

---

## 📸 Project Preview

<!--
============================================================
IMAGE 1 OF 4 — FEATURE FLAG MANAGEMENT DASHBOARD

Add a clean screenshot of the operator-facing dashboard
showing several feature flags.

Save as:
docs/images/feature-flag-dashboard.png
============================================================
-->

![Feature Flag Management Dashboard](docs/images/feature-flag-dashboard.png)

*Operator-facing dashboard for viewing and managing application feature flags.*

---

## 🎯 Project Overview

Modern applications often need to enable, disable, or modify features without requiring a new deployment. This project demonstrates an end-to-end platform designed around that problem.

Operators manage feature flags through the platform, while consuming applications evaluate those flags through a reusable TypeScript SDK and OpenFeature integration.

Flag state is stored in DynamoDB, while changes propagate through an event-driven realtime pipeline using DynamoDB Streams, AWS Lambda, Kafka/MSK, and Centrifugo.

Connected browser applications can receive tenant-scoped updates and react to feature changes without requiring a page refresh.

This repository is a standalone portfolio implementation and architectural demonstration rather than a production-certified hosted service.

---

## ✨ Key Features

- 🚩 **Feature Flag Management** — Create and modify application feature flags through a centralized API.
- 🔐 **Tenant-Scoped Authentication** — Isolates feature flag access and realtime updates between consumers.
- ⚡ **Realtime Updates** — Propagates flag changes to connected applications without page refreshes.
- 📦 **TypeScript SDK** — Provides applications with a reusable interface for consuming and evaluating flags.
- 🔌 **OpenFeature Integration** — Supports standards-based feature flag evaluation.
- ⚛️ **React & Next.js Integration** — Includes React entry points and a Next.js/OpenFeature example.
- ☁️ **AWS Infrastructure** — Uses serverless and containerized AWS services to support the platform.
- 🏗️ **Infrastructure as Code** — OpenTofu defines and validates the cloud infrastructure.
- 🔄 **Automated CI** — GitHub Actions validates builds, integrations, infrastructure, dependencies, and repository security.

---

## 🏗️ Architecture

<!--
============================================================
IMAGE 2 OF 4 — ARCHITECTURE DIAGRAM

Create a diagram showing approximately:

Operator / Dashboard
        ↓
Feature Flag API
        ↓
DynamoDB
        ↓
DynamoDB Streams
        ↓
Lambda Stream Publisher
        ↓
Kafka / Amazon MSK
        ↓
Centrifugo on ECS/Fargate
        ↓
Consumer Application

Save as:
docs/images/architecture.png
============================================================
-->

![Feature Flag Platform Architecture](docs/images/architecture.png)

The platform uses an event-driven architecture to move feature flag changes from management to consuming applications.

```text
Operator / Dashboard
        │
        ▼
Feature Flag API
        │
        ▼
     DynamoDB
        │
        ▼
 DynamoDB Streams
        │
        ▼
 Lambda Publisher
        │
        ▼
   Kafka / MSK
        │
        ▼
    Centrifugo
        │
        ▼
Consumer Application
```

Feature flag state is persisted in DynamoDB. Changes captured through DynamoDB Streams are processed by a Lambda publisher and sent through Kafka.

Centrifugo then distributes tenant-scoped realtime updates to connected clients.

The platform's API, authentication claims, DynamoDB schema, Kafka topics, Centrifugo channels, and AWS resource behavior form its primary runtime contracts.

---

## 🔄 End-to-End Feature Flag Flow

1. An operator creates or modifies a feature flag through the feature flag API.
2. The API stores the current flag state in DynamoDB.
3. DynamoDB Streams captures the change.
4. A Lambda stream publisher publishes the event to Kafka.
5. The Centrifugo bridge receives the tenant-scoped event.
6. Centrifugo distributes the update to connected browser clients.
7. The consuming application responds to the new flag state without requiring a page refresh.

This architecture separates **flag management**, **flag evaluation**, and **realtime propagation** while allowing applications to consume flags through a reusable SDK.

---

## 🖥️ Consumer Application

<!--
============================================================
IMAGE 3 OF 4 — CONSUMER APPLICATION

Add a screenshot of the consumer application demonstrating
a feature being controlled by a feature flag.

Save as:
docs/images/consumer-app.png
============================================================
-->

![Feature Flag Consumer Application](docs/images/consumer-app.png)

*Example consumer demonstrating how application behavior can be controlled through feature flags.*

Applications can integrate with the platform through the TypeScript SDK or OpenFeature provider rather than implementing the platform's underlying API and realtime behavior directly.

The repository includes several integration examples:

- `consumer-app/` — consumer application demonstration
- `test-consumer/` — minimal SDK integration consumer
- `examples/next-openfeature/` — Next.js application using OpenFeature

---

## ⚡ Realtime Feature Updates

<!--
============================================================
IMAGE 4 OF 4 — REALTIME DEMO GIF

Recommended recording:

1. Show dashboard and consumer side-by-side.
2. Change or toggle a feature flag.
3. Show the consumer automatically reacting.
4. Do not refresh the consumer browser.

Save as:
docs/images/realtime-feature-flags.gif
============================================================
-->

![Realtime Feature Flag Demo](docs/images/realtime-feature-flags.gif)

*Feature flag changes propagate to connected consumers without requiring a page refresh.*

Realtime delivery is tenant-scoped so connected consumers receive updates intended for their application context.

The realtime infrastructure uses Kafka/MSK as part of the event path and Centrifugo on ECS/Fargate for client delivery.

---

## 🛠️ Technology Stack

| Area | Technologies |
|---|---|
| **Application** | Node.js, JavaScript, TypeScript, React, Next.js |
| **Feature Flags** | OpenFeature, Custom TypeScript SDK |
| **Cloud** | AWS |
| **AWS Services** | Lambda, DynamoDB, DynamoDB Streams, IAM, ECS/Fargate |
| **Realtime** | Kafka / Amazon MSK, Centrifugo, WSS |
| **Infrastructure** | OpenTofu |
| **Build Tooling** | npm, TypeScript, Babel |
| **CI/CD** | GitHub Actions |
| **Security & Validation** | Gitleaks, npm audit, automated repository checks |
| **Version Control** | Git, GitHub |

---

## 📁 Repository Structure

```text
feature-flag-management-application/
│
├── .github/
│   └── workflows/              # GitHub Actions CI
│
├── consumer-app/               # Consumer application demonstration
├── consumer-sdk/               # TypeScript SDK and OpenFeature integration
│
├── docs/                       # Architecture and operational documentation
│
├── examples/
│   └── next-openfeature/       # Next.js/OpenFeature integration example
│
├── functions/                  # API, authorization, and stream Lambda packages
│
├── infra/
│   └── centrifugo/             # Centrifugo ECS/Fargate infrastructure
│
├── local-app/                  # Operator-facing local dashboard
├── scripts/                    # Repository validation and utility scripts
├── shared/                     # Shared platform components
├── test-consumer/              # Minimal SDK consumer
├── tofu/                       # Core AWS OpenTofu infrastructure
│
├── CONTRIBUTING.md
├── SECURITY.md
├── package.json
└── README.md
```

### Major Components

**`functions/`**  
Contains the API, authorization, and DynamoDB Stream-to-Kafka Lambda packages.

**`consumer-sdk/`**  
Contains the TypeScript SDK along with its React and OpenFeature entry points.

**`local-app/`**  
Provides an operator-facing demonstration for working with feature flags.

**`consumer-app/`**  
Demonstrates how an application can respond to feature flag state.

**`test-consumer/`**  
Provides a minimal example of integrating directly with the SDK.

**`examples/next-openfeature/`**  
Demonstrates integration from a Next.js application through OpenFeature.

**`tofu/`**  
Defines the core API, Lambda, DynamoDB, IAM, and stream infrastructure.

**`infra/centrifugo/`**  
Defines the Centrifugo ECS/Fargate and MSK-related infrastructure.

---

## 🚀 Getting Started

### Prerequisites

Install:

- Node.js 20+
- npm
- OpenTofu
- Git

Clone the repository:

```sh
git clone https://github.com/dj-berg/feature-flag-management-application.git
cd feature-flag-management-application
```

Install project dependencies:

```sh
npm run setup
```

The setup process uses the committed package lockfiles and does not deploy AWS resources.

---

## 🔐 Environment Configuration

Environment templates are provided for the applications.

For example:

```sh
cp local-app/.env.example local-app/.env
cp consumer-app/.env.example consumer-app/.env
```

Populate the required values for your environment before starting the applications.

For the minimal SDK consumer:

```sh
cp test-consumer/.env.example test-consumer/.env
```

Configure the required consumer credentials and API URL before running the application.

> Never commit `.env` files, credentials, private keys, state files, or environment-specific secrets.

---

## ▶️ Running the Applications

Start the operator-facing dashboard:

```sh
npm run dev:local
```

Default address:

```text
http://localhost:3000
```

Start the consumer demonstration:

```sh
npm run dev:consumer
```

Default address:

```text
http://localhost:3001
```

Start the minimal SDK consumer:

```sh
npm run dev:test-consumer
```

Default address:

```text
http://localhost:3002
```

The live demonstrations require reachable API and realtime services. Running the local applications alone does not deploy the underlying AWS infrastructure.

---

## 📦 SDK & OpenFeature Integration

The platform includes a reusable TypeScript SDK that allows consuming applications to interact with feature flags without implementing the platform's underlying API and realtime behavior themselves.

The SDK includes:

- TypeScript interfaces
- Feature flag evaluation
- React integration
- OpenFeature provider support
- Browser-compatible build artifacts

For integration details, see:

- [`consumer-sdk/README.md`](consumer-sdk/README.md)
- [`docs/consumer-integration.md`](docs/consumer-integration.md)
- [`examples/next-openfeature/README.md`](examples/next-openfeature/README.md)

---

## 🧪 Testing & Validation

The repository includes credential-free validation that can be run without deploying infrastructure or contacting AWS.

Run the complete repository check:

```sh
npm run check
```

Additional checks:

```sh
npm run lint
npm run format
npm run security
```

The aggregate validation covers:

- TypeScript SDK builds
- SDK type checking
- SDK tests
- Consumer smoke tests
- Local application builds
- Next.js/OpenFeature example validation
- OpenTofu formatting
- OpenTofu configuration validation
- Locked dependency auditing

Infrastructure stacks can also be validated independently:

```sh
npm run check:tofu:main
npm run check:tofu:centrifugo
```

These commands initialize the required providers with the backend disabled and perform validation only.

They do not plan, apply, mutate state, or deploy infrastructure.

---

## 🔄 Continuous Integration

GitHub Actions automatically validates repository changes.

```text
Checkout Repository
        │
        ▼
Configure Node.js
        │
        ▼
Install + Build SDK
        │
        ▼
Package SDK
        │
        ▼
Install Application Dependencies
        │
        ▼
Install OpenTofu
        │
        ▼
Run Deterministic Checks
        │
        ▼
Audit Dependencies
```

A separate security job scans the repository for accidentally committed secrets.

Current repository validation includes:

- ✅ Repository checks
- ✅ SDK build validation
- ✅ Consumer integration checks
- ✅ Local application build validation
- ✅ OpenTofu validation
- ✅ Dependency auditing
- ✅ Secret scanning

---

## 🔒 Security

The repository is designed to keep environment-specific and sensitive artifacts outside version control.

Do not commit:

```text
.env
node_modules/
dist/
*.tfstate
*.tfplan
generated Lambda archives
private keys
credentials
environment-specific configuration
```

Infrastructure credentials and cryptographic material must be supplied through an appropriate secret-aware mechanism.

See [`SECURITY.md`](SECURITY.md) for additional security guidance.

---

## 📚 Documentation

Detailed technical and operational documentation is available under `docs/`.

### Architecture

[`docs/current-architecture.md`](docs/current-architecture.md)

Describes the current system architecture and runtime contracts.

### Consumer Integration

[`docs/consumer-integration.md`](docs/consumer-integration.md)

Covers SDK installation, OpenFeature evaluation, authentication, API usage, and realtime behavior.

### Realtime Reliability

[`docs/realtime-reliability-validation.md`](docs/realtime-reliability-validation.md)

Provides validation and testing guidance for the realtime event pipeline.

### Production Readiness

[`docs/production-readiness.md`](docs/production-readiness.md)

Documents staging, security, operational, monitoring, rollback, and production-readiness considerations.

### Publication Checklist

[`docs/publication-checklist.md`](docs/publication-checklist.md)

Documents checks for reviewing the standalone portfolio implementation before publication.

---

## 💡 Engineering Highlights

This project demonstrates experience across several areas of modern software engineering:

- Cloud application architecture
- Event-driven systems
- Feature flag platform design
- SDK development
- API integration
- Tenant-scoped authentication
- Realtime messaging
- React and Next.js integration
- OpenFeature
- Infrastructure as Code
- AWS serverless architecture
- Containerized cloud services
- CI/CD
- Dependency management
- Automated security scanning
- Technical documentation

One of the project's primary engineering goals is to demonstrate the complete path between **managing a feature**, **persisting its state**, **propagating its change**, and **allowing another application to consume it**.

---

## ⚠️ Project Context

This repository is a **standalone portfolio implementation** demonstrating feature flag platform architecture and software engineering practices.

It is intended as an architectural and engineering demonstration rather than a production-certified hosted service.

Deployment requires environment-specific security, infrastructure, reliability, and operational review.

The public repository contains only the standalone implementation and should not contain proprietary infrastructure, production credentials, private environment configuration, or other sensitive deployment artifacts.

---

## 📖 Additional Resources

- [Current Architecture](docs/current-architecture.md)
- [Consumer Integration Guide](docs/consumer-integration.md)
- [SDK Documentation](consumer-sdk/README.md)
- [Next.js + OpenFeature Example](examples/next-openfeature/README.md)
- [Realtime Reliability Validation](docs/realtime-reliability-validation.md)
- [Production Readiness](docs/production-readiness.md)
- [Publication Checklist](docs/publication-checklist.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## 📄 License

This project is provided as a portfolio and educational software engineering demonstration.
