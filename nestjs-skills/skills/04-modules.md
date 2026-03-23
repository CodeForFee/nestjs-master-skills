---
name: nestjs/modules
description: >
  @Module() decorator, feature module pattern, AppModule structure, shared modules,
  isGlobal option, and provider/controller registration.
disable-model-invocation: false
user-invocable: true
---

# Modules — Structuring Your Application

> **Senior developer context**: Modules are the organizational unit of NestJS. Every provider, controller, and import belongs to a module. Use feature modules aggressively — one module per domain concept. Keep `AppModule` lean.

---

## The `@Module()` Decorator

```typescript
@Module({
  controllers: [],    // Controllers declared in this module
  providers: [],      // Providers (services, factories, etc.) in this module
  imports: [],        // Imported modules whose exported providers this module needs
  exports: [],        // Providers this module makes available to consumers
  global?: false,     // If true, all exported providers are available app-wide
})
export class CatsModule {}
```

### Property Reference

| Property | Purpose |
|---|---|
| `controllers` | HTTP controllers belonging to this module |
| `providers` | Injectable classes managed by this module |
| `imports` | Modules whose exported providers are available here |
| `exports` | Subset of `providers` exposed to importing modules |
| `global` | Makes exported providers available without explicit import |

---

## Feature Module Pattern

Each feature/domain of your application gets its own module. This enforces single responsibility and keeps the codebase navigable as it grows.

```
src/
├── cats/
│   ├── dto/
│   │   ├── create-cat.dto.ts
│   │   ├── update-cat.dto.ts
│   │   └── list-cats.dto.ts
│   ├── interfaces/
│   │   └── cat.interface.ts
│   ├── cats.controller.ts
│   ├── cats.service.ts
│   └── cats.module.ts         ← Feature module
├── app.module.ts               ← Root module
└── main.ts
```

### `cats.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

### Registering in `AppModule`

```typescript
import { Module } from '@nestjs/common';
import { CatsModule } from './cats/cats.module';

@Module({
  imports: [CatsModule],
})
export class AppModule {}
```

---

## `isGlobal` — When to Use

Mark a module `global` when its providers are needed across the entire application without explicit import in every consumer module.

**Legitimate use case**: `ConfigModule` — you want `ConfigService` everywhere without importing `ConfigModule` repeatedly.

```typescript
@Module({
  imports: [CatsModule],
})
export class AppModule {}

// ❌ Don't do this — ConfigModule is global, no import needed
imports: [ConfigModule]  // Redundant
```

### When NOT to Use

Most modules should **not** be global. Prefer explicit imports. Global modules create隐性耦合 and make it harder to reason about what a module depends on. Use `isGlobal` only for truly cross-cutting concerns (configuration, logging, etc.).

---

## Shared Modules

When a provider needs to be consumed by multiple modules, export it from its home module and import that module wherever it's needed.

```typescript
// CatsModule exports CatsService
@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],   // Now available to any importing module
})
export class CatsModule {}
```

```typescript
// Another module imports CatsModule to use CatsService
@Module({
  imports: [CatsModule],    // CatsService is now injectable here
})
export class OrdersModule {}
```

---

## Provider Registration

Providers must be registered in a module's `providers` array to be available for injection:

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],  // ← Registered here
})
export class CatsModule {}
```

Without this registration, Nest's DI container cannot instantiate the provider and will throw `Cannot inject X` at startup.

---

## Directory Structure Best Practices

1. **One directory per feature** — each module in its own folder
2. **Keep DTOs co-located** — `cats/dto/` within the feature module
3. **Keep interfaces co-located** — `cats/interfaces/` within the feature module
4. **Never use barrel files** (`index.ts`) for module or provider classes — they cause circular dependency issues in Nest's DI scanner
5. **`AppModule` should be thin** — only import feature modules and global modules

---

## `nest g resource`

Always prefer the CLI generator over manual file creation:

```bash
nest g resource cats
# Generates: controller, service, module, DTOs, entity (optional), tests
```

This scaffolds the entire feature module with correct registration in `AppModule` automatically.
