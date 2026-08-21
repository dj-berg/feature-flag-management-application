# 🚩 Real-Time Cloud Feature Flag Platform

An AWS-based feature flag platform for managing, evaluating, and delivering tenant-scoped feature flags to applications in real time.

Built with **TypeScript, OpenFeature, AWS Lambda, DynamoDB, Kafka/MSK, Centrifugo, ECS/Fargate, and OpenTofu**, the platform demonstrates an end-to-end architecture where application functionality can be controlled independently from application deployments.

![CI](https://github.com/dj-berg/real-time-cloud-feature-flag-platform/actions/workflows/ci.yml/badge.svg)

---

## 📸 Project Preview

The operator-facing **Feature Flag Control** dashboard provides a centralized interface for viewing and managing application feature flags.

In the example below, the `fraud-alerts` flag changes from **disabled** to **enabled**. The dashboard simultaneously updates from **7 enabled / 1 disabled** to **8 enabled / 0 disabled**.

### Before — Flag Disabled

![Feature Flag Dashboard with Fraud Alerts Disabled](docs/images/dashboard-flag-disabled.png)

### After — Flag Enabled

![Feature Flag Dashboard with Fraud Alerts Enabled](docs/images/dashboard-flag-enabled.png)

The management interface supports flag creation, deletion, search, filtering, sorting, and enable/disable controls while displaying the current application and environment scope.

---

## 🎯 Project Overview

Modern applications often need to release, hide, test, or modify functionality without requiring a new deployment.

This project demonstrates a cloud-based feature flag platform designed around that problem.

Operators manage feature flags through a centralized platform while consuming applications evaluate those flags through a reusable **TypeScript SDK** and **OpenFeature integration**.

Feature flag state is persisted in **Amazon DynamoDB**. Changes can then propagate through an event-driven real-time pipeline using **DynamoDB Streams, AWS Lambda, Kafka/MSK, and Centrifugo** before reaching connected applications.

The platform separates:

- **Feature management** — controlling the state of application features
- **Persistence** — maintaining flag state and metadata
- **Evaluation** — allowing applications to determine whether features are enabled
- **Real-time propagation** — distributing flag changes to connected consumers
- **Application integration** — providing reusable SDK and OpenFeature interfaces

The result is a system where application functionality can be controlled independently from application deployment cycles.

> **Project Scope:** This repository is a standalone portfolio implementation and architectural demonstration. It is not presented as a production-certified hosted service.

---

## ✨ Key Features

- 🚩 **Feature Flag Management** — Create, view, enable, disable, and delete application feature flags.
- ⚡ **Real-Time Flag Delivery** — Propagate flag changes to connected applications without requiring a page refresh.
- 🔐 **Tenant-Scoped Authentication** — Scope feature flag access and real-time communication between consumers.
- 📦 **TypeScript SDK** — Provide consuming applications with a reusable interface for feature flag evaluation.
- 🔌 **OpenFeature Integration** — Support standards-based feature flag evaluation through OpenFeature.
- ⚛️ **React & Next.js Integration** — Include React entry points and a Next.js/OpenFeature example.
- 🗄️ **Persistent Flag Storage** — Store feature flag state and metadata in DynamoDB.
- 📡 **Event-Driven Architecture** — Propagate changes through DynamoDB Streams, Lambda, Kafka/MSK, and Centrifugo.
- ☁️ **AWS Infrastructure** — Use serverless and containerized AWS services to support the platform.
- 🏗️ **Infrastructure as Code** — Define and validate cloud infrastructure using OpenTofu.
- 🔄 **Automated CI** — Validate builds, integrations, infrastructure configuration, dependencies, and repository security through GitHub Actions.

---

## 🏗️ System Architecture

The platform separates feature management, persistent storage, event propagation, real-time delivery, and application consumption.

```text
                    ┌──────────────────────┐
                    │   Operator / Admin   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Feature Flag Control │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Feature Flag API   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      DynamoDB        │
                    └──────────┬───────────┘
                               │
                       DynamoDB Streams
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Lambda Publisher    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Kafka / MSK       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Centrifugo       │
                    │    ECS / Fargate     │
                    └──────────┬───────────┘
                               │
                         WebSocket / WSS
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Consumer Application │
                    └──────────────────────┘
```

Feature flag state is persisted in DynamoDB. DynamoDB Streams captures changes to that state, which are processed by a Lambda publisher and sent through Kafka.

Centrifugo provides the real-time delivery layer for connected clients, allowing tenant-scoped changes to reach consuming applications.

The platform's API behavior, authentication claims, DynamoDB schema, Kafka topics, Centrifugo channels, and AWS resource behavior form its primary runtime contracts.

---

## 🔄 End-to-End Feature Flag Flow

A feature flag change follows this general path through the platform:

1. An operator creates or modifies a feature flag.
2. The Feature Flag API processes the request.
3. The current flag state is persisted in DynamoDB.
4. DynamoDB Streams captures the data change.
5. A Lambda stream publisher publishes the change to Kafka.
6. The Centrifugo bridge processes the tenant-scoped event.
7. Centrifugo delivers the update to connected clients.
8. The consuming application evaluates the updated flag state.
9. Application behavior changes according to the new state.

```text
Manage Feature
      │
      ▼
 Persist State
      │
      ▼
Publish Change
      │
      ▼
Realtime Delivery
      │
      ▼
 Evaluate Flag
      │
      ▼
Change Application Behavior
```

This architecture allows application functionality to be controlled independently from application deployments.

---

## ⚡ Feature Flags in Action

The repository includes consumer implementations demonstrating how another application can use the feature flag platform.

The example below demonstrates the effect of the `fraud-alerts` feature flag.

### Before — Feature Disabled

When `fraud-alerts` is disabled, **Fraud Alerts is not available** in the consumer application.

![Consumer Application Before Feature Flag Change](docs/images/consumer-flag-disabled.png)

### After — Feature Enabled

After the flag is enabled, **Fraud Alerts becomes available** to the consumer.

![Consumer Application After Feature Flag Change](docs/images/consumer-flag-enabled.png)

This demonstrates the core purpose of the platform:

> **Application functionality can be controlled through feature flag state rather than requiring a new application deployment.**

The demonstration application also contains flags controlling functionality such as instant transfers, mobile check deposit, credit score features, spending insights, and virtual cards.

---

## 🔍 Under the Hood

The visible application behavior is backed by persistent feature flag records and a real-time client connection.

### 🗄️ DynamoDB Feature Flag Storage

Feature flags are persisted as structured records in DynamoDB.

![Feature Flag Records Stored in DynamoDB](docs/images/dynamodb-feature-flags.png)

Flag records contain information such as:

- Flag key
- Enabled/disabled state
- Application scope
- Account scope
- Environment
- Description
- Record type
- Schema version
- Creation metadata

This allows the platform to maintain persistent feature state while distinguishing flags across application, tenant, and environment contexts.

---

### 📡 Real-Time Client Connection

Connected browser applications establish a persistent real-time connection for receiving updates.

![Active WebSocket Connection](docs/images/websocket-connection.png)

The browser network trace demonstrates a successful WebSocket protocol upgrade with HTTP status **101** and a persistent connection.

The consuming application uses the Centrifugo client as part of the real-time delivery layer.

Together, these demonstrations show several layers of the platform working together:

```text
Management Interface
        │
        ▼
Feature Flag State
        │
        ▼
Persistent Storage
        │
        ▼
Event Pipeline
        │
        ▼
Realtime Connection
        │
        ▼
Consumer Evaluation
        │
        ▼
Application Behavior
```

---

## 📦 TypeScript SDK

The platform includes a reusable TypeScript SDK so consuming applications do not need to independently implement the underlying feature flag API and evaluation behavior.

The SDK includes support for:

- TypeScript interfaces
- Feature flag evaluation
- React integration
- OpenFeature provider integration
- Browser-compatible build artifacts
- Consumer integration patterns

Applications can therefore integrate at the SDK/OpenFeature layer rather than directly coupling application code to the platform's underlying infrastructure.

For additional integration details, see:

- [`consumer-sdk/README.md`](consumer-sdk/README.md)
- [`docs/consumer-integration.md`](docs/consumer-integration.md)
- [`examples/next-openfeature/README.md`](examples/next-openfeature/README.md)

---

## 🔌 OpenFeature Integration

The platform includes an **OpenFeature provider**, allowing applications to use a standardized feature flag evaluation interface.

A Next.js integration example is provided under:

```text
examples/next-openfeature/
```

This demonstrates how an application can consume the platform through OpenFeature rather than depending directly on platform-specific evaluation logic.

---

## 🛠️ Technology Stack

| Area | Technologies |
| --- | --- |
| **Application** | Node.js, JavaScript, TypeScript, React, Next.js |
| **Feature Flags** | OpenFeature, Custom TypeScript SDK |
| **Cloud Platform** | AWS |
| **Compute** | AWS Lambda, ECS/Fargate |
| **Storage** | DynamoDB, DynamoDB Streams |
| **Messaging** | Kafka / Amazon MSK |
| **Realtime Delivery** | Centrifugo, WebSockets / WSS |
| **Authentication** | JWT-based application and tenant scoping |
| **Infrastructure as Code** | OpenTofu |
| **Build Tooling** | npm, TypeScript, Babel |
| **CI/CD** | GitHub Actions |
| **Security & Validation** | Gitleaks, npm audit |
| **Version Control** | Git, GitHub |

---

## 📁 Repository Structure

```text
real-time-cloud-feature-flag-platform/
│
├── .github/
│   └── workflows/               # GitHub Actions CI
│
├── consumer-app/                # Consumer application demonstration
├── consumer-sdk/                # TypeScript SDK + OpenFeature integration
│
├── docs/
│   ├── images/                  # Project demonstration screenshots
│   └── ...                      # Architecture and operational documentation
│
├── examples/
│   └── next-openfeature/        # Next.js/OpenFeature integration example
│
├── functions/                   # API, authorization, and stream Lambda packages
│
├── infra/
│   └── centrifugo/              # Centrifugo ECS/Fargate infrastructure
│
├── local-app/                   # Feature Flag Control dashboard
├── scripts/                     # Repository validation and utility scripts
├── shared/                      # Shared platform components
├── test-consumer/               # Minimal SDK consumer
├── tofu/                        # Core AWS OpenTofu infrastructure
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

Provides the operator-facing Feature Flag Control dashboard for managing and monitoring feature flags.

**`consumer-app/`**

Demonstrates how application functionality can respond to feature flag state.

**`test-consumer/`**

Provides a minimal example of integrating an application with the SDK.

**`examples/next-openfeature/`**

Demonstrates integration from a Next.js application using OpenFeature.

**`tofu/`**

Defines the API, Lambda, DynamoDB, IAM, and stream infrastructure.

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
git clone https://github.com/dj-berg/real-time-cloud-feature-flag-platform.git
cd real-time-cloud-feature-flag-platform
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

> **Never commit `.env` files, credentials, private keys, state files, or environment-specific secrets.**

For OpenTofu deployments, required cryptographic and environment-specific values must be provided through an appropriate secret-aware variable mechanism.

The infrastructure configuration intentionally does not provide usable key defaults.

---

## ▶️ Running the Demonstrations

### Feature Flag Control

Start the operator-facing dashboard:

```sh
npm run dev:local
```

Default address:

```text
http://localhost:3000
```

### Consumer Application

Start the consumer demonstration:

```sh
npm run dev:consumer
```

Default address:

```text
http://localhost:3001
```

### Minimal SDK Consumer

Start the minimal SDK integration:

```sh
npm run dev:test-consumer
```

Default address:

```text
http://localhost:3002
```

The live demonstrations require reachable API and real-time services.

Running the applications locally does not itself deploy the underlying AWS infrastructure.

---

## 🧪 Testing & Validation

The repository includes credential-free validation that can be run without deploying infrastructure or contacting AWS.

Run the complete repository validation:

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

Repository validation includes:

- ✅ Repository checks
- ✅ SDK build validation
- ✅ Consumer integration checks
- ✅ Local application build validation
- ✅ OpenTofu formatting and validation
- ✅ Dependency auditing
- ✅ Secret scanning

---

## 🔒 Security

The repository is designed to keep sensitive and environment-specific artifacts outside version control.

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

The repository also includes automated secret scanning and dependency auditing as part of its validation process.

See [`SECURITY.md`](SECURITY.md) for additional security guidance.

---

## 📚 Documentation

Detailed technical and operational documentation is available under `docs/`.

### Current Architecture

[`docs/current-architecture.md`](docs/current-architecture.md)

Describes the current system architecture and runtime contracts.

### Consumer Integration

[`docs/consumer-integration.md`](docs/consumer-integration.md)

Covers SDK installation, OpenFeature evaluation, authentication, API usage, and real-time behavior.

### Realtime Reliability

[`docs/realtime-reliability-validation.md`](docs/realtime-reliability-validation.md)

Provides validation and testing guidance for the real-time event pipeline.

### Production Readiness

[`docs/production-readiness.md`](docs/production-readiness.md)

Documents staging, security, monitoring, rollback, operational, and production-readiness considerations.

### Publication Checklist

[`docs/publication-checklist.md`](docs/publication-checklist.md)

Documents checks for reviewing the standalone portfolio implementation before publication.

---

## 💡 Engineering Highlights

This project demonstrates experience across multiple areas of modern software engineering:

- Cloud application architecture
- Event-driven systems
- Feature flag platform design
- REST API development
- SDK development
- OpenFeature integration
- Tenant-scoped authentication
- Real-time messaging
- WebSocket communication
- React and Next.js integration
- DynamoDB data modeling
- AWS Lambda
- Kafka / Amazon MSK
- ECS/Fargate
- Infrastructure as Code
- OpenTofu
- CI/CD
- Dependency management
- Automated security scanning
- Technical documentation

A central engineering goal of the project is demonstrating the complete path between:

```text
Manage a Feature
       │
       ▼
Persist its State
       │
       ▼
Propagate its Change
       │
       ▼
Evaluate the Flag
       │
       ▼
Change Consumer Behavior
```

Rather than representing only a management interface, the repository demonstrates the surrounding platform required to **store, distribute, evaluate, and consume feature flags across applications**.

---

## ⚠️ Project Context

This repository is a **standalone portfolio implementation** demonstrating real-time feature flag platform architecture and software engineering practices.

It is intended as an architectural and engineering demonstration rather than a production-certified hosted service.

Deployment requires environment-specific security, infrastructure, reliability, and operational review.

The public repository should contain only the standalone implementation and should not contain production credentials, private environment configuration, proprietary infrastructure, or other sensitive deployment artifacts.

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
