---
name: nestjs/providers
description: >
  @Injectable(), services, constructor injection, singleton scope, optional providers,
  property injection, provider registration in @Module(), dependency injection,
  injection scopes introduction, and manual instantiation.
disable-model-invocation: false
user-invocable: true
---

# Providers — Dependency Injection & Business Logic

> **Senior developer context**: Providers encapsulate business logic and are injected where needed. Always prefer **constructor injection** over property injection. Singleton scope is the default and the right choice in virtually all cases.

---

## `@Injectable()` & Service

A provider is any class annotated with `@Injectable()`. Services are the most common provider type.

```typescript
import { Injectable } from '@nestjs/common';
import { Cat } from './interfaces/cat.interface';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat): Cat {
    this.cats.push(cat);
    return cat;
  }

  findAll(): Cat[] {
    return this.cats;
  }
}
```

The `@Injectable()` decorator registers the class with Nest's IoC container, enabling dependency injection.

### Directory Structure

```
src/
└── cats/
    ├── dto/
    ├── interfaces/
    │   └── cat.interface.ts
    ├── cats.controller.ts
    ├── cats.service.ts
    └── cats.module.ts
```

---

## Constructor Injection (Preferred)

```typescript
@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}
  //         ↑ shorthand: declares + initializes in one step
}
```

Nest resolves `CatsService` by type and injects the singleton instance. The `private readonly` shorthand is idiomatic TypeScript.

### Why Constructor Injection

1. **Explicit dependencies** — all dependencies visible in one place
2. **Testability** — trivially mock in unit tests
3. **Immutability** — `readonly` prevents accidental reassignment
4. **DI container support** — Nest's scanner can validate the dependency graph at bootstrap

---

## Optional Providers

Use `@Optional()` when a dependency may not be present. No error is thrown if it's absent.

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  constructor(
    @Optional() @Inject('HTTP_OPTIONS') private readonly httpClient: T,
  ) {}
}
```

When using custom tokens, combine `@Optional()` with `@Inject()`.

---

## Property Injection

Inject at the property level instead of the constructor:

```typescript
@Injectable()
export class HttpService<T> {
  @Inject('HTTP_OPTIONS')
  private readonly httpClient: T;
}
```

**When to use**: When a class extends a base class and passing all dependencies through `super()` becomes unwieldy.

**When NOT to use**: For regular classes without inheritance chains. Constructor injection makes dependencies explicit and dependencies obvious at a glance.

---

## Provider Registration

Register providers in the module's `providers` array:

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

Without this registration, Nest cannot resolve the dependency and will throw `Cannot inject X` at startup.

---

## Dependency Injection

Nest resolves dependencies based on type at runtime:

```typescript
constructor(private readonly catsService: CatsService) {}
// Nest creates CatsService (or returns existing singleton) and injects it
```

Dependencies are resolved recursively — if `CatsService` depends on `ConfigService`, Nest resolves that too, and so on.

---

## Injection Scopes (Summary)

Providers have a **lifetime** tied to the application lifecycle by default (singleton). Request-scoped providers are instantiated per request — useful for per-request state.

| Scope | Behavior | Use Case |
|---|---|---|
| `DEFAULT` (singleton) | Single instance shared across all requests | **Almost everything** |
| `REQUEST` | New instance per incoming request | Per-request cache, tenant isolation |
| `TRANSIENT` | New instance per consumer | When each injection point needs its own instance |

> **Performance warning**: Request-scoped providers add ~5% latency because Nest must create a new instance per request and track its disposal. Use only when genuinely needed. See `11-fundamentals.md` for full details.

---

## Manual Instantiation

For cases where you need to step outside the DI system:

```typescript
// Use ModuleRef — see 11-fundamentals.md (Module Reference section)
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class CatsService {
  constructor(private readonly moduleRef: ModuleRef) {}

  findOrCreate(): Cat {
    const ref = this.moduleRef.get(CatRepository, { strict: false });
    return ref.find();
  }
}
```

For standalone usage (CRON jobs, CLIs, testing), see `14-advanced.md` (Standalone Applications).

---

## Best Practices

1. **Singleton by default** — only change scope when you have a specific per-request need
2. **Constructor injection always** — avoid property injection unless extending base classes
3. **`private readonly` shorthand** — cleaner than separate declaration + assignment
4. **Single responsibility** — one service per domain concept; don't create God services
5. **Register in module** — always add to `@Module({ providers: [...] })`
6. **Never use barrel files** (`index.ts`) for provider exports — causes circular dependency issues in Nest's DI scanner
7. **Follow SOLID principles** — Nest enables OOP design; use it
