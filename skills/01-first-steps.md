---
name: nestjs/first-steps
description: >
  CLI setup, NestFactory, bootstrap, platforms (Express/Fastify), main.ts structure,
  running (start/start:dev/start:prod), linting, and formatting.
disable-model-invocation: false
user-invocable: true
---

# First Steps — CLI Setup & Application Bootstrap

> **Senior developer context**: This section covers the mechanics of creating and launching a NestJS application. Everything here is foundational — use `nest new` for scaffolding and always include `enableShutdownHooks()` in `main.ts`.

---

## CLI Setup

```bash
# Install Nest CLI globally
npm i -g @nestjs/cli

# Scaffold a new project (TypeScript by default)
nest new project-name

# Scaffold with strict TypeScript mode
nest new project-name --strict
```

The CLI creates a complete project structure with `src/` pre-populated with boilerplate files. Use `--skip-git` to skip git initialization.

---

## Generated File Structure

```
src/
├── app.controller.spec.ts   # Unit tests for the root controller
├── app.controller.ts        # Basic controller with a single route
├── app.module.ts            # Root module of the application
├── app.service.ts           # Basic service with a single method
└── main.ts                  # Entry point — creates and bootstraps the app
```

---

## `main.ts` — Bootstrap

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

`NestFactory.create()` returns an object fulfilling `INestApplication`, which exposes methods for configuring the application (global pipes, guards, filters, etc.).

### Always Include `enableShutdownHooks()`

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // Required for graceful shutdown (SIGTERM, DB disconnect)
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

**Why it matters**: Without `enableShutdownHooks()`, the application ignores termination signals. This means database connections won't close cleanly and in-flight requests won't complete — causing failures in zero-downtime deployments.

---

## Platforms

Nest is platform-agnostic. Two HTTP platforms are supported out-of-the-box:

| Platform | Package | Notes |
|---|---|---|
| Express | `@nestjs/platform-express` | Default. Battle-tested, production-ready. |
| Fastify | `@nestjs/platform-fastify` | Higher performance, lower overhead. |

### When to Use Which

- **Express**: When ecosystem compatibility matters (most middleware, existing tooling, community support).
- **Fastify**: When raw throughput and low latency are critical.

### Specifying the Platform Type

Pass the platform type to `NestFactory.create()` to access platform-specific APIs:

```typescript
// Express — enables app.use(), app.set(), etc.
const app = await NestFactory.create<NestExpressApplication>(AppModule);

// Fastify — enables app.addHook(), app.register(), etc.
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
```

You only need the type annotation if you intend to call platform-specific methods. The framework works identically under both.

---

## Running the Application

```bash
# Standard start (production-like)
npm run start

# Watch mode with hot reload (development)
npm run start:dev

# Production build + serve
npm run start:prod

# SWC builder for 20x faster rebuilds (add -b swc to start script)
npm run start -- -b swc
```

---

## Linting and Formatting

Generated projects include ESLint and Prettier out of the box.

```bash
npm run lint     # ESLint — lint + autofix
npm run format   # Prettier — format all files
```

### When to Use Each

- **ESLint** (`lint`): Catches code quality issues, enforce patterns, unused variables, etc. Run in CI.
- **Prettier** (`format`): Enforces consistent formatting. Run in CI and configure your editor to format on save.

---

## Production Checklist

Before deploying, ensure:

1. `app.enableShutdownHooks()` is present in `main.ts`
2. `process.env.PORT ?? 3000` is used (never hardcode ports)
3. Global `ValidationPipe` is registered (see `07-pipes.md`)
4. A global exception filter handles unexpected errors (see `06-exception-filters.md`)
5. CORS is explicitly configured (never `app.enableCors()` without options in production — see `14-advanced.md`)

---

## `abortOnError`

By default, if an error occurs during application creation, the process exits with code `1`. To suppress this behavior:

```typescript
NestFactory.create(AppModule, { abortOnError: false });
```

Use this only when intentionally handling startup failures manually (e.g., waiting for a database to become available).
