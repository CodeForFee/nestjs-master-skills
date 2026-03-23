---
name: nestjs/fundamentals
description: >
  Custom providers (useValue, useClass, useFactory, useExisting), async providers,
  dynamic modules, ConfigurableModuleBuilder, injection scopes (DEFAULT, REQUEST, TRANSIENT),
  request-scoped providers, durable providers, circular dependencies, forwardRef(),
  ModuleRef, LazyModuleLoader, ExecutionContext, ArgumentsHost, Reflector,
  lifecycle hooks (OnModuleInit, OnApplicationBootstrap, OnModuleDestroy,
  BeforeApplicationShutdown, OnApplicationShutdown), DiscoveryService.
disable-model-invocation: false
user-invocable: true
---

# Fundamentals — Advanced Dependency Injection & Application Lifecycle

> **Senior developer context**: This section covers the full power of Nest's DI system. Most applications only need a fraction of this — start with custom providers and lifecycle hooks, then expand as complexity grows. Avoid REQUEST scope unless genuinely needed (~5% latency penalty).

---

## Custom Providers (5 Patterns)

Nest's IoC container supports 5 provider registration patterns beyond the shorthand class syntax.

### `useValue` — Inject a Fixed Value

Replace a provider with a mock, external value, or constant:

```typescript
// Testing: swap CatsService with a mock
const mockCatsService = { findAll: () => ['mock cat'] };

@Module({
  imports: [CatsModule],
  providers: [
    { provide: CatsService, useValue: mockCatsService },
  ],
})
export class AppModule {}
```

### `useClass` — Environment-Based Implementation

Swap an abstract/default class with a concrete implementation based on environment:

```typescript
const configServiceProvider = {
  provide: ConfigService,
  useClass:
    process.env.NODE_ENV === 'development'
      ? DevelopmentConfigService
      : ProductionConfigService,
};
```

### `useFactory` — Dynamic Instance Creation

Create providers at runtime with a factory function:

```typescript
{
  provide: 'CONNECTION',
  useFactory: (optionsProvider: MyOptionsProvider) => {
    return new DatabaseConnection(optionsProvider.get());
  },
  inject: [MyOptionsProvider],
}
```

Factory functions can accept other injected providers via `inject`. Mark optional dependencies:

```typescript
{
  provide: 'CONNECTION',
  useFactory: (options: Options, optional?: Extra) => { ... },
  inject: [Options, { token: 'Extra', optional: true }],
}
```

### `useExisting` — Alias

Create a second token that resolves to the same instance:

```typescript
{
  provide: 'AliasedLogger',
  useExisting: LoggerService,
}
```

### Non-Class Provider Tokens

Use strings or Symbols when a class token isn't appropriate:

```typescript
// Provider definition
{ provide: 'CONFIG', useValue: { theme: 'dark' } }

// Injection
@Injectable()
export class CatsService {
  constructor(@Inject('CONFIG') private config: { theme: string }) {}
}
```

**Always define tokens as constants in a separate file** — never use raw string literals as tokens.

### Exporting Custom Providers

Export by token or by full provider object:

```typescript
// By token
exports: ['CONNECTION']

// By full provider object
exports: [connectionFactory]
```

---

## Asynchronous Providers

Delay application startup until async tasks complete (e.g., database connection):

```typescript
{
  provide: 'ASYNC_CONNECTION',
  useFactory: async () => {
    const conn = await createConnection(options);
    return conn;
  },
}
```

Nest won't instantiate any class depending on this provider until the promise resolves.

---

## Dynamic Modules

Dynamic modules return a `DynamicModule` at runtime instead of declaring metadata statically. Use them to create configurable, reusable module "plugins."

### Pattern: `ConfigModule.register()`

```typescript
@Module({})
export class ConfigModule {
  static register(options: Record<string, any>): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        { provide: 'CONFIG_OPTIONS', useValue: options },
        ConfigService,
      ],
      exports: [ConfigService],
    };
  }
}
```

Consumer:

```typescript
@Module({
  imports: [ConfigModule.register({ folder: './config' })],
})
export class AppModule {}
```

### `ConfigurableModuleBuilder` — For Library Authors

The `ConfigurableModuleBuilder` generates the boilerplate for dynamic modules with async support:

```typescript
// config.module-definition.ts
import { ConfigurableModuleBuilder } from '@nestjs/common';
import { ConfigModuleOptions } from './interfaces/config-module-options.interface';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>().build();
```

```typescript
// config.module.ts
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule extends ConfigurableModuleClass {}
// Now has: register(), registerAsync(), forRoot(), forRootAsync()
```

### Async Configuration

```typescript
ConfigModule.registerAsync({
  useFactory: () => ({ folder: './config' }),
  inject: [SomeService],
})

// Or with useClass
ConfigModule.registerAsync({
  useClass: ConfigModuleOptionsFactory,  // must have create() method
})
```

### Naming Conventions

| Method | When to Use |
|---|---|
| `register()` | Per-consumer configuration (each import can differ) |
| `forRoot()` | Single shared configuration across the app |
| `forFeature()` | Module-specific configuration after `forRoot()` |

All have `*Async` variants for async configuration.

### Extras — `isGlobal`

```typescript
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>()
    .setExtras({ isGlobal: true }, (def, extras) => ({
      ...def,
      global: extras.isGlobal,
    }))
    .build();
```

`isGlobal` is passed at call time but NOT included in `MODULE_OPTIONS_TOKEN` — it's handled separately.

---

## Injection Scopes

Providers have three possible scopes:

| Scope | Lifetime | Performance |
|---|---|---|
| `DEFAULT` (singleton) | App lifecycle — single instance | No overhead |
| `REQUEST` | Per incoming request | ~5% latency |
| `TRANSIENT` | Per consumer — unique per injection point | Per-injection overhead |

### Setting Scope

```typescript
@Injectable({ scope: Scope.REQUEST })
export class CatsService {}
```

### Scope Bubbles Up

If a singleton `CatsController` injects a request-scoped `CatsService`, the controller becomes request-scoped. Every request creates a new controller instance.

### Injecting the Request Object

```typescript
@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(REQUEST) private request: Request) {}
}
```

For GraphQL, inject `CONTEXT` instead of `REQUEST`.

### Durable Providers (Multi-Tenant)

For multi-tenant apps, avoid the per-request performance hit by aggregating tenants into shared DI sub-trees:

```typescript
// Register a strategy
export class AggregateByTenantContextIdStrategy implements ContextIdStrategy {
  attach(contextId: ContextId, request: Request) {
    const tenantId = request.headers['x-tenant-id'] as string;
    // Return stable sub-tree per tenant
    return (info: HostComponentInfo) =>
      info.isTreeDurable ? tenantSubTreeId : contextId;
  }
}

// Register globally
ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());

// Mark providers as durable
@Injectable({ scope: Scope.REQUEST, durable: true })
export class TenantService {}
```

### When to Use Request Scope

Use it only for: per-request caching, multi-tenancy, request-level logging/metrics. For nearly all other cases, **singleton scope is correct**.

---

## Circular Dependencies

When two classes depend on each other, use `forwardRef()` on both sides:

```typescript
@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => CommonService))
    private commonService: CommonService,
  ) {}
}

@Injectable()
export class CommonService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private catsService: CatsService,
  ) {}
}
```

For module-level circular dependencies:

```typescript
@Module({ imports: [forwardRef(() => CatsModule)] })
export class CommonModule {}
```

**Prefer refactoring over `forwardRef()`** — circular dependencies are a code smell. Consider extracting shared logic into a third service.

---

## Module Reference (`ModuleRef`)

Inject `ModuleRef` to resolve providers programmatically:

```typescript
@Injectable()
export class CatsService {
  constructor(private moduleRef: ModuleRef) {}
}
```

### `get()` — Static Providers

```typescript
// Within current module
this.moduleRef.get(Service);

// From any module (global lookup)
this.moduleRef.get(Service, { strict: false });
```

### `resolve()` — Scoped Providers (REQUEST/TRANSIENT)

```typescript
// Each call gets a unique instance
const svc = await this.moduleRef.resolve(TransientService);

// Stable instance across calls with shared contextId
const contextId = ContextIdFactory.create();
const svc1 = await this.moduleRef.resolve(TransientService, contextId);
const svc2 = await this.moduleRef.resolve(TransientService, contextId);
assert(svc1 === svc2); // true
```

### Request-Scoped Resolution Within a Request

```typescript
// Get current request contextId
const contextId = ContextIdFactory.getByRequest(this.request);
const repo = await this.moduleRef.resolve(CatsRepository, contextId);
```

### `create()` — Dynamic Instantiation

```typescript
// Instantiate a class not registered as a provider
const factory = await this.moduleRef.create(CatsFactory);
```

---

## Lazy Loading Modules

Lazy loading delays module initialization until first access — reduces cold start time.

```typescript
@Injectable()
export class CatsService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async loadFeature() {
    const { LazyModule } = await import('./lazy/lazy.module');
    const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);

    const { LazyService } = await import('./lazy/lazy.service');
    return moduleRef.get(LazyService);
  }
}
```

- Lazy modules are **cached** — subsequent loads return the cached instance
- **Lifecycle hooks** (`OnModuleInit`, etc.) are NOT invoked in lazy-loaded modules
- **Controllers/gateways/resolvers cannot be lazy-loaded** — they require upfront route registration
- Best for **serverless/lambda** — not for long-running monoliths

**Webpack config** (`tsconfig.json`):

```json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "node" } }
```

---

## Execution Context (`ArgumentsHost` / `ExecutionContext`)

`ArgumentsHost` wraps the raw handler arguments and provides context-switching helpers:

```typescript
const ctx = host.switchToHttp();   // HTTP
const ctx = host.switchToRpc();    // Microservices
const ctx = host.switchToWs();    // WebSockets
```

### `ExecutionContext`

Extends `ArgumentsHost` and adds route-aware methods:

```typescript
const handler = context.getHandler();  // The route handler function
const controller = context.getClass(); // The controller class
const methodName = handler.name;        // "findAll"
const className = controller.name;     // "CatsController"
```

### `Reflector` — Reading Metadata

```typescript
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read from handler (method-level)
    const roles = this.reflector.get(Roles, context.getHandler());

    // Read from controller (class-level)
    const roles = this.reflector.get(Roles, context.getClass());

    // Handler overrides controller
    const roles = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Merge both
    const roles = this.reflector.getAllAndMerge(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);

    return true;
  }
}
```

---

## Lifecycle Hooks

### Full Sequence

```
Bootstrap
  ↓
onModuleInit()          ← Module deps resolved
  ↓
onApplicationBootstrap() ← All modules initialized, before listening
  ↓
[Application Running]
  ↓
SIGTERM/SIGINT received
  ↓
onModuleDestroy()               ← Signal received
  ↓
beforeApplicationShutdown()      ← All destroy handlers done
  ↓                              (connections closing)
onApplicationShutdown()          ← Connections closed
```

### Enabling Shutdown Hooks

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();  // Required!
  await app.listen(process.env.PORT ?? 3000);
}
```

**Without `enableShutdownHooks()`**, `onModuleDestroy`, `beforeApplicationShutdown`, and `onApplicationShutdown` never fire.

### Usage

```typescript
@Injectable()
export class UsersService implements OnModuleInit, OnApplicationBootstrap {
  onModuleInit() {
    console.log('Module initialized — fetch metadata, warm caches');
  }

  async onApplicationBootstrap() {
    await this.connect();  // Async — Nest waits for completion
  }
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  onApplicationShutdown(signal: string) {
    // signal: 'SIGTERM', 'SIGINT', etc.
    this.disconnect();
  }
}
```

---

## Discovery Service

`DiscoveryService` enables runtime introspection — scan providers/controllers, read metadata. Primarily for **plugins and frameworks**, not application code.

```typescript
@Injectable()
export class MetadataScanner {
  constructor(private discoveryService: DiscoveryService) {}

  findAllProvidersWithFlag(flag: string) {
    const providers = this.discoveryService.getProviders();
    return providers.filter(
      (p) =>
        this.discoveryService.getMetadataByDecorator(FeatureFlag, p) === flag,
    );
  }
}
```

### Custom Metadata Decorator

```typescript
// Register the decorator
export const FeatureFlag = DiscoveryService.createDecorator<string>();

// Apply to a provider
@Injectable()
@FeatureFlag('experimental')
export class ExperimentalService {}
```

---

## Best Practices

1. **Use `useFactory` for environment logic** — `useClass` for strategy pattern, `useValue` for tests
2. **Dynamic modules via `ConfigurableModuleBuilder`** for library code; manual `register()` for app-specific plugins
3. **Avoid `isGlobal: true`** — only for truly cross-cutting modules (ConfigModule)
4. **Avoid REQUEST scope unless needed** — ~5% latency; use durable providers for multi-tenant instead
5. **Refactor circular deps** — extract shared logic into a third provider rather than using `forwardRef()`
6. **Use `ModuleRef` for runtime resolution** — but prefer constructor injection when possible
7. **`enableShutdownHooks()` always** — in every `main.ts` for production deployments
8. **Lifecycle hooks can be async** — Nest waits for promises to resolve before proceeding
9. **DiscoveryService is for plugins** — not for regular application code
