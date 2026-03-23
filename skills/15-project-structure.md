---
name: nestjs/project-structure
description: >
  Standard NestJS source code directory structure for projects of all sizes.
  Covers CLI defaults, feature-based, domain-driven design (DDD), layered,
  flat/functional (serverless), and monorepo structures. Includes decision
  criteria, migration paths, barrel file conventions, and when to split/merge modules.
disable-model-invocation: false
user-invocable: true
---

# Project Structure — Choosing the Right Architecture

> **Senior developer context**: Structure is not cosmetic — it shapes how your team collaborates, how hard bugs are to find, and how quickly you can onboard new engineers. NestJS's module system is the primary organizational unit. Match your directory structure to your project's current complexity, not its aspirational complexity.

---

## 1. The CLI Default (Starting Point)

`nest new` generates this structure — appropriate for **prototypes, POCs, and trivially small apps**:

```
src/
├── main.ts              ← Bootstrap, enableShutdownHooks, global pipes/guards
├── app.module.ts        ← Root module (imports all feature modules)
├── app.controller.ts    ← Root controller (usually minimal)
└── app.controller.spec.ts
```

**This structure breaks down fast.** If your `app.module.ts` imports more than 3–4 feature modules, or any single file exceeds ~200 lines, it's time to reorganize.

---

## 2. Feature-Based Structure (Most Common)

The default choice for **most production applications** — grow from this before adopting more elaborate patterns.

### Core Principle

One directory per feature. Each feature is self-contained. Nothing crosses feature boundaries without going through imports.

### Structure

```
src/
├── main.ts
├── app.module.ts
│
├── common/                        ← Cross-cutting, shared across features
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── public.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── interceptors/
│   │   └── logging.interceptor.ts
│   └── pipes/
│       └── validation.pipe.ts
│
└── modules/                       ← "modules" or "features" — one per domain
    ├── auth/
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── auth.module.ts
    │   ├── dto/
    │   │   ├── login.dto.ts
    │   │   └── register.dto.ts
    │   └── guards/
    │       └── local-auth.guard.ts
    │
    ├── users/
    │   ├── users.controller.ts
    │   ├── users.service.ts
    │   ├── users.module.ts
    │   ├── dto/
    │   │   ├── create-user.dto.ts
    │   │   └── update-user.dto.ts
    │   └── entities/
    │       └── user.entity.ts
    │
    └── products/
        ├── products.controller.ts
        ├── products.service.ts
        ├── products.module.ts
        ├── dto/
        └── entities/
```

### Key Rules

| Rule | Rationale |
|---|---|
| `dto/` stays inside its feature | Create/Update/Query DTOs belong to the module that owns them |
| `entities/` stays inside its feature | DB models are an implementation detail of their module |
| `guards/` can be in `common/` if reused | Feature-specific guards stay inside the feature |
| Never import across feature directories | `products.service.ts` does not import from `users/` directly — use events or API |
| One `*.module.ts` per feature | No feature has more than one module file |

### When to Promote to Feature-Based

- `app.module.ts` has >4 imports
- Any single file exceeds 150–200 lines
- You have 2+ developers working simultaneously on different domains

---

## 3. Domain-Driven Design (DDD)

For **large teams, complex business domains, or when your domain logic deserves protection** from infrastructure concerns. DDD adds ceremony — only pay it when the returns justify it.

### Structure

Each domain is a self-contained NestJS module with four layers:

```
src/
├── main.ts
├── app.module.ts
│
├── common/
│   ├── types/
│   └── utilities/
│
└── modules/
    └── orders/                    ← Bounded Context
        ├── application/            ← Use cases, CQRS commands/queries
        │   ├── commands/
        │   │   ├── create-order.command.ts
        │   │   └── cancel-order.command.ts
        │   ├── queries/
        │   │   └── get-order.query.ts
        │   └── handlers/
        │       ├── create-order.handler.ts
        │       └── get-order.handler.ts
        │
        ├── domain/                ← Pure business logic, no NestJS imports
        │   ├── entities/
        │   │   └── order.entity.ts
        │   ├── value-objects/
        │   │   └── order-id.value-object.ts
        │   ├── events/
        │   │   └── order-placed.event.ts
        │   └── interfaces/
        │       └── order-repository.interface.ts
        │
        ├── infrastructure/        ← Implementation of domain interfaces
        │   ├── persistence/
        │   │   └── order.repository.ts   ← Implements OrderRepositoryInterface
        │   └── messaging/
        │       └── order-event-publisher.ts
        │
        ├── presentation/         ← Controllers, GraphQL resolvers, DTOs
        │   ├── controllers/
        │   │   └── orders.controller.ts
        │   ├── dto/
        │   │   ├── create-order.dto.ts
        │   │   └── order.response.dto.ts
        │   └── orders.resolver.ts  ← If using GraphQL
        │
        └── orders.module.ts       ← Wires domain + infrastructure + presentation
```

### Wiring a DDD Module

```typescript
// orders.module.ts
@Module({
  imports: [CqrsModule],           // If using CQRS
  controllers: [OrdersController],
  providers: [
    CreateOrderHandler,
    GetOrderHandler,
    {                           // Infrastructure binding
      provide: ORDER_REPOSITORY, // Domain interface token
      useClass: OrderRepository, // Infrastructure implementation
    },
  ],
  exports: [ORDER_REPOSITORY],    // Export the interface, not the implementation
})
export class OrdersModule {}
```

### When to Use DDD

| Use DDD | Don't Use DDD |
|---|---|
| Complex, evolving business rules | CRUD-heavy, simple data apps |
| Multiple sub-teams owning domains | Small team, single codebase |
| Event-driven / event sourcing | Straightforward request/response |
| Long-lived, large codebase | Short-lived project or prototype |
| Rich domain models with invariants | Anemic models (just getters/setters) |

---

## 4. Layered Structure (By Type)

A valid alternative to feature-based for **small-to-medium apps** where you prefer to see all controllers in one place, all services in another. Less self-contained than feature-based — cross-feature imports become harder to track.

```
src/
├── main.ts
├── app.module.ts
│
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
│
├── controllers/
│   ├── auth.controller.ts
│   ├── users.controller.ts
│   └── products.controller.ts
│
├── services/
│   ├── auth.service.ts
│   ├── users.service.ts
│   └── products.service.ts
│
├── dto/
│   ├── auth/
│   ├── users/
│   └── products/
│
├── entities/
│   ├── user.entity.ts
│   └── product.entity.ts
│
└── modules/
    ├── auth.module.ts
    ├── users.module.ts
    └── products.module.ts
```

**Drawback**: As the team grows, this structure encourages shared mutable state across services and makes it unclear which module owns which file. For anything beyond 10–15 files per layer, prefer feature-based.

---

## 5. Flat / Functional (Serverless, Lambdas)

For **serverless deployments (AWS Lambda, Vercel, Google Cloud Functions)** where each deployment artifact is a single handler. NestJS still provides DI and testing — just a flatter structure.

```
src/
├── main.ts                      ← Lambda bootstrap
├── app.module.ts
│
└── handlers/
    ├── create-user.handler.ts   ← Lambda entry point
    ├── get-user.handler.ts
    └── search-products.handler.ts
```

```typescript
// main.ts — serverless bootstrap
import { ServerlessAdapter } from '@nestjs/platform-express';
import { createServer, proxy } from 'aws-serverless-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let server: Server;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  server = createServer(expressApp);
}

bootstrap();

export const handler = (event: any, context: any) => {
  server = server ?? createServer(app.getHttpAdapter().getInstance());
  proxy(server, event, context);
};
```

### Serverless-Specific Considerations

- **Lazy-load modules** — establish DB connections inside handlers, not at cold start
- **No singleton connections** — use `onModuleInit` to connect, `onApplicationShutdown` to disconnect
- **Stateless everything** — no in-memory caching between invocations (use Redis/DynamoDB)
- **Minimal bundle size** — tree-shake aggressively; consider separate lambdas per handler domain

---

## 6. Monorepo Structure

For **multiple applications sharing code** — e.g., an API + admin panel + a shared SDK, or microservices with shared contracts.

```
nestjs-monorepo/
├── nest-cli.json                 ← "monorepo": true
├── tsconfig.base.json
├── package.json
│
├── apps/
│   ├── api/                      ← Main REST/GraphQL API
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── modules/
│   │   ├── tsconfig.app.json
│   │   └── package.json
│   │
│   └── admin/                    ← Admin panel / BFF
│       ├── src/
│       └── package.json
│
└── libs/
    ├── shared/                   ← Shared across ALL apps
    │   ├── src/
    │   │   ├── dto/              ← Common Create*Dto, PaginationDto
    │   │   ├── interfaces/
    │   │   ├── constants/
    │   │   └── index.ts
    │   └── tsconfig.lib.json
    │
    └── auth-lib/                 ← Shared auth logic
        ├── src/
        │   ├── jwt.service.ts
        │   ├── auth.module.ts
        │   └── index.ts
        └── tsconfig.lib.json
```

### `nest-cli.json` for monorepo

```json
{
  "$schema": "https://json.nestjs.com/schema.json",
  "monorepo": true,
  "root": "apps/api",
  "compilerOptions": {
    "webpack": true,
    "tsConfigPath": "apps/api/tsconfig.app.json"
  },
  "projects": {
    "api": { "type": "application", "root": "apps/api" },
    "admin": { "type": "application", "root": "apps/admin" },
    "shared": { "type": "library", "root": "libs/shared" },
    "auth-lib": { "type": "library", "root": "libs/auth-lib" }
  }
}
```

### Referencing Libraries in Apps

```json
// apps/api/tsconfig.app.json
{
  "extends": "../../tsconfig.base.json",
  "references": [
    { "path": "../../libs/shared/tsconfig.lib.json" },
    { "path": "../../libs/auth-lib/tsconfig.lib.json" }
  ]
}
```

```typescript
// apps/api/src/modules/users/users.module.ts
import { PaginationDto } from '@app/shared';      // from libs/shared
import { JwtService } from '@app/auth-lib';       // from libs/auth-lib
```

### When to Use a Monorepo

| Use Monorepo | Don't Use Monorepo |
|---|---|
| 2+ apps sharing significant code | Single app only |
| Shared TypeScript interfaces/DTOs across apps | Apps in different languages |
| Coordinated deployments (all apps share the same commit) | Independent release cycles |
| Small-to-medium team (<20 engineers) | Large teams needing hard repo boundaries |
| CI/CD pipeline shared across apps | Teams needing independent CI per app |

---

## 7. Structure Decision Tree

```
Is this a single, small app (< 5 modules, < 3 developers)?
├── YES → Use CLI default, organize into modules/ only when needed
└── NO  ↓

Is it a serverless / single-handler deployment?
├── YES → Flat/functional structure (handlers/)
└── NO  ↓

Are there 2+ applications sharing code or interfaces?
├── YES → Monorepo (apps/ + libs/)
└── NO  ↓

Is the domain complex with multiple bounded contexts?
├── YES → DDD structure (domain/ + application/ + infrastructure/ + presentation/)
└── NO  ↓

Default → Feature-based structure (modules/ with common/)
```

---

## 8. Common Conventions Across All Structures

### Barrel Files (`index.ts`)

Use sparingly. Export the public surface of a module:

```typescript
// modules/users/dto/index.ts
export * from './create-user.dto';
export * from './update-user.dto';
export * from './user.response.dto';
```

```typescript
// modules/users/users.module.ts — import from index, not individual files
import { CreateUserDto, UpdateUserDto } from './dto';
```

**Rule**: One `index.ts` per directory. Never create a root `src/index.ts` that re-exports everything — it hides where things come from.

### File Naming Conventions

| What | Convention | Example |
|---|---|---|
| Modules | `*.module.ts` | `auth.module.ts` |
| Controllers | `*.controller.ts` | `users.controller.ts` |
| Services | `*.service.ts` | `email.service.ts` |
| Entities | `*.entity.ts` | `order.entity.ts` |
| DTOs | `*.dto.ts` | `create-order.dto.ts` |
| Guards | `*.guard.ts` | `jwt-auth.guard.ts` |
| Decorators | `*.decorator.ts` | `current-user.decorator.ts` |
| Filters | `*.filter.ts` | `http-exception.filter.ts` |
| Interceptors | `*.interceptor.ts` | `logging.interceptor.ts` |
| Pipes | `*.pipe.ts` | `parse-int.pipe.ts` |

Suffix all non-standard files with their type — never name a file `helpers.ts` when it could be `jwt.helper.ts`.

### Module Responsibility Rules

1. **Single responsibility** — a module owns one domain concept (Auth, Users, Products). If you can't describe a module in one sentence, it's doing too much.
2. **Explicit exports** — only export what other modules need. Keep internals private.
3. **No circular imports** — if module A imports module B and B imports A, extract the shared piece into module C.
4. **No God modules** — a module that imports 15 other modules is a God module. Split it.

### Migration Path: CLI Default → Feature-Based

```bash
# Before: everything in src/
src/
├── main.ts
├── app.module.ts
├── auth.ts          # ← extracted from here
├── users.ts         # ← and here
└── products.ts     # ← and here

# After: one feature per directory
src/
├── main.ts
├── app.module.ts
└── modules/
    ├── auth/
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   └── auth.module.ts
    ├── users/
    └── products/
```

```typescript
// app.module.ts — before (inline)
@Module({
  imports: [TypeOrmModule.forFeature([User, Product]), AuthModule],
  controllers: [AuthController, UsersController, ProductsController],
  providers: [AuthService, UsersService, ProductsService],
})

// app.module.ts — after (composed of feature modules)
@Module({
  imports: [AuthModule, UsersModule, ProductsModule],
})
export class AppModule {}
```

---

## 9. When to Split or Merge Modules

### Split a Module When

- It has >5 providers that don't share state
- It connects to a different database (separate `TypeOrmModule.forRoot`)
- A different team owns it
- It has its own deployment lifecycle (e.g., a microservice later extracted)
- The module file itself exceeds 50 lines of configuration

### Merge Modules When

- Two modules always change together (they're really one domain)
- One module only exists to import the other
- You have <3 providers across both and no shared infrastructure

### Example: Splitting Auth

```
auth/                         ← Keep auth module
  ├── auth.controller.ts
  ├── auth.service.ts
  ├── auth.module.ts
  └── guards/
      └── jwt-auth.guard.ts   ← Keep here (reused across features)

jwt/                          ← SPLIT OUT — only if JWT logic is complex
  ├── jwt.service.ts
  └── jwt.module.ts

sessions/                     ← SPLIT OUT — only if sessions are tracked separately
  ├── sessions.service.ts
  └── sessions.module.ts
```

---

## Best Practices

1. **Start with CLI defaults, migrate at the first sign of friction** — premature structure is worse than no structure
2. **Feature-based is the right default** for nearly every NestJS app that will exist for more than 3 months
3. **DDD pays off at ~15+ engineers or a genuinely complex domain** — not before
4. **Monorepo is for shared code across apps** — a single app never needs it
5. **Serverless demands lazy connections** — never hold DB connections in module-level singletons
6. **Name files by their type suffix** — `*.controller.ts`, `*.service.ts`, `*.guard.ts`
7. **One `index.ts` per directory** — barrel files reduce import noise but hide origins if overused
8. **Export interfaces, not implementations** — in shared libs, always export the interface token; consumers provide the implementation
9. **No God modules** — if a module imports more than ~8 others, it owns too much; break it up
10. **Structure follows team size** — a 2-person project should not have DDD; a 20-person project should not have everything-in-`app.module.ts`
