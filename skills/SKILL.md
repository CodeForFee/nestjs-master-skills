---
name: nestjs
description: >
  Senior NestJS developer. Use when building, refactoring, or debugging any NestJS application.
  Covers all topics: first steps, CLI setup, controllers, routing, decorators, services,
  providers, dependency injection, modules, middleware, exception filters, pipes,
  guards, interceptors, custom decorators, custom providers, asynchronous providers,
  dynamic modules, injection scopes, circular dependencies, module reference,
  lazy loading modules, execution context, lifecycle hooks, discovery service,
  configuration (@nestjs/config), HTTP client (@nestjs/axios, HttpService), testing (@nestjs/testing),
  TypeORM (@nestjs/typeorm), Sequelize (@nestjs/sequelize), Mongoose/MongoDB (@nestjs/mongoose),
  caching, serialization, Logger (ConsoleLogger, JSON logging), security, CORS,
  GraphQL (@nestjs/graphql), Swagger/OpenAPI (@nestjs/swagger), Prisma, ServeStatic (SPA),
  WebSockets, Microservices, Queues (BullMQ), Deployment, Docker, Serverless, Standalone apps,
  Monorepo patterns, Authorization (RBAC, OwnerGuard), Cookies, Compression, and project structure architecture.
disable-model-invocation: false
user-invocable: true
---

# NestJS — Senior Developer Skill Suite

This skill suite covers the entire NestJS framework. The master index below routes each
topic to the appropriate sub-skill file. Each sub-skill contains senior developer best
practices, production-ready patterns, and full working code examples.

## Skill File Map

| Topic | File |
|---|---|
| CLI setup, NestFactory, platforms, bootstrap | `01-first-steps.md` |
| Controllers, routing, decorators, DTOs, async | `02-controllers.md` |
| Providers, services, DI, constructor injection | `03-providers.md` |
| Modules, feature modules, AppModule, shared modules | `04-modules.md` |
| Middleware, MiddlewareConsumer, functional middleware | `05-middleware.md` |
| Exception filters, HttpException, global filters | `06-exception-filters.md` |
| Pipes, ValidationPipe, Zod, class-validator | `07-pipes.md` |
| Guards, AuthGuard, RolesGuard, Reflector, authorization | `08-guards.md` |
| Interceptors, NestInterceptor, logging, RxJS | `09-interceptors.md` |
| Custom decorators, createParamDecorator, applyDecorators | `10-custom-decorators.md` |
| Custom providers, dynamic modules, injection scopes, DI, lifecycle | `11-fundamentals.md` |
| Unit testing, e2e testing, mocking, Test.createTestingModule | `12-testing.md` |
| ConfigService, TypeORM, Sequelize, Mongoose, caching, HTTP client | `13-techniques.md` |
| Security, CORS, Authorization, GraphQL, Swagger, Microservices, Deployment, Docker, Serverless, Prisma, ServeStatic | `14-advanced.md` |
| Queues, BullMQ, producers, consumers, job options, events | `16-queues.md` |
| Project structure architecture (CLI default, feature-based, DDD, layered, flat/serverless, monorepo) | `15-project-structure.md` |

---

## Non-Negotiable Conventions

These apply to every NestJS project — always follow them:

### 1. Always Use Classes for DTOs (Never Interfaces)
TypeScript interfaces are erased at runtime. Nest Pipes need runtime metatypes to validate.
Use classes from day one.

```typescript
// ❌ Bad — interface erased at runtime, Pipes can't validate
interface CreateCatDto { name: string; age: number; }

// ✅ Good — class survives compilation, works with ValidationPipe
export class CreateCatDto {
  name: string;
  age: number;
}
```

### 2. Always Use Constructor Injection
Property injection hides dependencies. Constructor injection makes them explicit.

```typescript
// ❌ Bad — property injection hides dependency
@Injectable()
export class CatsService {
  @Inject('CONNECTION') private readonly connection: Connection;
}

// ✅ Good — constructor injection makes dependency explicit
@Injectable()
export class CatsService {
  constructor(
    private readonly catsRepository: CatsRepository,
    private readonly configService: ConfigService,
  ) {}
}
```

### 3. Singleton Scope Is Always the Default
Request-scoped providers add ~5% latency. Use them only when you genuinely need per-request state.

### 4. Always Call `enableShutdownHooks()` in `main.ts`
Otherwise graceful shutdown (SIGTERM, DB disconnection) won't work.

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // ✅ Always include
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 5. Never Use Barrel Files (`index.ts`) for Module/Provider Classes
Barrel files cause circular dependency issues in Nest's dependency injection scanner.

```typescript
// ❌ Bad — barrel file causing potential circular dependency
// cats/index.ts
export * from './cats.controller';
export * from './cats.service';

// cats.controller.ts
import { CatsService } from '../cats'; // ❌ Don't do this

// ✅ Good — direct import
import { CatsService } from './cats.service';
```

### 6. Always Use a Global Validation Pipe in Production
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // Strip non-whitelisted properties
    forbidNonWhitelisted: true, // Reject requests with extra properties
    transform: true,            // Auto-transform payloads to DTO types
    transformOptions: { enableImplicitConversion: true },
  }),
);
```

### 7. Keep `main.ts` Minimal
```typescript
// ✅ main.ts — minimal, everything configured in AppModule
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 8. Always Use `nest g resource` Instead of Manual File Creation
```bash
nest g resource cats    # Generates controller, service, DTOs, module, tests
```

---

## Architecture Decision Tree

**"Which building block should I use?"**

```
Need to validate or transform input data?
├─ Yes → Is it at the system boundary (incoming request)?
│   ├─ Yes → PIPE
│   └─ No → Interceptor (for output transformation)
└─ No
   ├─ Need to authorize based on user/role?
   │   └─ Yes → GUARD
   ├─ Need cross-cutting logging or response transformation?
   │   └─ Yes → INTERCEPTOR
   ├─ Need to handle errors?
   │   └─ Yes → EXCEPTION FILTER
   ├─ Need to run code before the route handler?
   │   └─ Yes → MIDDLEWARE (but prefer Guards for auth)
   └─ Need to attach custom data to the request object?
       └─ Yes → CUSTOM DECORATOR (extract), MIDDLEWARE (attach)
```

**Execution order:**
```
Request → Middleware → Guard → Interceptor (before) → Pipe → Handler
       ← Middleware ← Guard ← Interceptor (after) ←
Error → Exception Filter → Response
```

---

## Common Pitfalls & Fixes

| Problem | Cause | Fix |
|---|---|---|
| `Cannot inject X` | Provider not in module's `providers` array | Add it to `@Module({ providers: [X] })` |
| Circular dependency | Two providers depending on each other | Use `forwardRef()` on both sides, or `ModuleRef` |
| Guard not running | Applied at wrong level | Guards run AFTER middleware, BEFORE pipes |
| Validation not stripping fields | Missing `whitelist: true` | `new ValidationPipe({ whitelist: true })` |
| Tests slow | Request-scoped providers | Use `ContextIdFactory` spy in tests |
| Middleware can't get route info | Middleware runs before routing | Use Guard instead — it has `ExecutionContext` |
| DTO validation fails | Used interface instead of class | Use `class` with `@IsString()`, etc. decorators |
| Global filter not catching error | Error thrown outside request context | Use `HttpAdapterHost` for platform-agnostic |
| DI not working in filter/guard | Registered via `useGlobalFilters()` | Use `APP_FILTER` token instead |
| `synchronize: true` wiped prod DB | TypeORM configured incorrectly | Use migrations: `typeorm migration:generate` |

---

## Project Structure

For directory layouts matched to your project's scale and team — from CLI defaults to DDD and monorepo — see **`15-project-structure.md`**.

The per-feature convention below applies to the **feature-based structure** (the most common choice):



```
src/
└── cats/
    ├── dto/
    │   ├── create-cat.dto.ts
    │   ├── update-cat.dto.ts
    │   └── list-cats.dto.ts
    ├── interfaces/
    │   └── cat.interface.ts
    ├── cats.controller.ts
    ├── cats.service.ts
    ├── cats.module.ts
    └── cats.controller.spec.ts
```

---

## NestJS CLI Reference

```bash
# Create project
nest new project-name
nest new project-name --strict    # TypeScript strict mode

# Generate (always prefer over manual creation)
nest g resource cats               # CRUD resource: controller, service, module, DTOs, tests
nest g controller cats
nest g service cats
nest g module cats
nest g guard cats
nest g filter cats
nest g interceptor cats
nest g pipe cats
nest g decorator cats

# Development
npm run start
npm run start:dev
npm run start:prod
npm run lint
npm run format

# Testing
npm run test        # Unit tests
npm run test:watch  # Watch mode
npm run test:cov    # Coverage
npm run test:e2e    # End-to-end tests
```
