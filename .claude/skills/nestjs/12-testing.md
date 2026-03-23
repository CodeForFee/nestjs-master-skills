---
name: nestjs/testing
description: >
  @nestjs/testing, Test.createTestingModule(), compile(), unit tests, e2e tests,
  mocking (overrideProvider, overrideGuard, overrideInterceptor, overrideFilter, overridePipe),
  auto-mocking with useMocker(), Supertest, request-scoped testing, ContextIdFactory spy,
  globally registered enhancer overrides, setLogger(), testing utilities API reference.
disable-model-invocation: false
user-invocable: true
---

# Testing — Unit, Integration & End-to-End

> **Senior developer context**: Every provider deserves unit tests. Every endpoint deserves e2e tests. Use `overrideProvider(...).useValue(mock)` over real instances. Use `useExisting` registration for globally injected guards so they can be overridden in tests.

---

## Setup

```bash
npm i --save-dev @nestjs/testing
```

Jest is the default test runner. Nest is testing-tool-agnostic — swap Jest for Mocha/Vitest if preferred.

---

## Unit Testing — Two Approaches

### 1. Manual Instantiation (Isolated)

Instantiate classes directly — no Nest involved:

```typescript
describe('CatsController', () => {
  let controller: CatsController;
  let service: CatsService;

  beforeEach(() => {
    service = new CatsService();
    controller = new CatsController(service);
  });

  it('findAll returns cats', async () => {
    jest.spyOn(service, 'findAll').mockResolvedValue([{ name: 'Whiskers', age: 2 }]);
    expect(await controller.findAll()).toHaveLength(1);
  });
});
```

**When to use**: Pure logic tests with no Nest dependencies.

### 2. `Test.createTestingModule()` (Nest-aware)

```typescript
describe('CatsController', () => {
  let controller: CatsController;
  let service: CatsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
      providers: [CatsService],
    }).compile();

    service = moduleRef.get(CatsService);
    controller = moduleRef.get(CatsController);
  });

  it('findAll returns cats', async () => {
    jest.spyOn(service, 'findAll').mockResolvedValue([{ name: 'Whiskers' }]);
    expect(await controller.findAll()).toHaveLength(1);
  });
});
```

**When to use**: Controllers/providers with Nest-specific features (DI, pipes, guards).

---

## Overriding Providers in Tests

### `overrideProvider()` — Mock a Service

```typescript
const mockCatsService = { findAll: () => ['test'] };

const moduleRef = await Test.createTestingModule({
  imports: [CatsModule],
})
  .overrideProvider(CatsService)
  .useValue(mockCatsService)       // useValue | useClass | useFactory
  .compile();
```

All three override patterns work:

```typescript
// Use a mock object
.useValue(mockCatsService)

// Use a different class
.useClass(MockCatsService)

// Use a factory function
.useFactory(() => ({ findAll: () => ['test'] }))
```

### `overrideGuard()` / `overrideInterceptor()` / `overrideFilter()` / `overridePipe()`

Same API as `overrideProvider()`:

```typescript
.overrideGuard(JwtAuthGuard)
.useClass(MockJwtAuthGuard)

.overridePipe(ValidationPipe)
.useValue(new ValidationPipe({ transform: true }))
```

### `overrideModule()` — Swap a Whole Module

```typescript
.overrideModule(CatsModule)
.useModule(StubCatsModule)
```

---

## Auto-Mocking with `useMocker()`

For classes with many dependencies, auto-mock all missing dependencies:

```typescript
const moduleMocker = new ModuleMocker(global);

const moduleRef = await Test.createTestingModule({
  controllers: [CatsController],
  providers: [CatsService],  // Only declare what you're testing
})
  .useMocker((token) => {
    // Explicit mock for CatsService
    if (token === CatsService) {
      return { findAll: jest.fn().mockResolvedValue(['cat']) };
    }
    // Auto-mock everything else
    if (typeof token === 'function') {
      const mockMetadata = moduleMocker.getMetadata(token) as MockMetadata<any, any>;
      const MockClass = moduleMocker.generateFromMetadata(mockMetadata);
      return new MockClass();
    }
  })
  .compile();
```

Or use `@golevelup/ts-jest`:

```typescript
.useMocker(createMock)
```

---

## End-to-End Testing with Supertest

```typescript
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CatsModule } from './cats/cats.module';
import { CatsService } from './cats/cats.service';

describe('Cats (e2e)', () => {
  let app: INestApplication;
  let catsService: Partial<CatsService>;

  beforeAll(async () => {
    catsService = { findAll: () => ['test'] };

    const moduleRef = await Test.createTestingModule({
      imports: [CatsModule],
    })
      .overrideProvider(CatsService)
      .useValue(catsService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('/GET cats', () => {
    return request(app.getHttpServer())
      .get('/cats')
      .expect(200)
      .expect({ data: ['test'] });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Fastify Adapter for E2E

```typescript
let app: NestFastifyApplication;

beforeAll(async () => {
  app = moduleRef.createNestApplication(
    new FastifyAdapter(),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

it('/GET cats', () => {
  return app.inject({ method: 'GET', url: '/cats' })
    .then((result) => {
      expect(result.statusCode).toBe(200);
    });
});
```

---

## Testing Request-Scoped Providers

Request-scoped providers create a new DI sub-tree per request. To test them:

```typescript
const contextId = ContextIdFactory.create();
jest.spyOn(ContextIdFactory, 'getByRequest').mockReturnValue(contextId);

const service = await moduleRef.resolve(CatsService, contextId);
```

This ensures all `resolve()` calls share the same sub-tree in your test.

---

## Overriding Globally Registered Enhancers

Globally injected guards/pipes/filters use `APP_GUARD`, `APP_PIPE`, etc. To override them:

**Registration must use `useExisting` (not `useClass`):**

```typescript
// app.module.ts — register globally
{
  provide: APP_GUARD,
  useExisting: JwtAuthGuard,  // ← useExisting, not useClass
}
JwtAuthGuard,                  // ← Also register as a regular provider
```

Now in tests:

```typescript
.overrideProvider(JwtAuthGuard)
.useClass(MockJwtAuthGuard)
```

---

## `setLogger()` — Custom Test Logger

```typescript
beforeAll(() => {
  Test.createTestingModule({ ... })
    .setLogger(new TestLogger())
    .compile();
});
```

By default, only `error` logs appear in test output. `setLogger()` controls what gets logged during tests.

---

## Testing Utilities API Reference

| Method | Returns | Use |
|---|---|---|
| `Test.createTestingModule(metadata)` | `TestingModule` | Create isolated test module |
| `.compile()` | `TestingModule` | Bootstraps module (async) |
| `.createNestApplication()` | `INestApplication` | Full Nest runtime for e2e |
| `.get(T)` | `T` | Retrieve static instance |
| `.resolve(T)` | `Promise<T>` | Retrieve scoped instance |
| `.select(T)` | `TestingModule` | Navigate to child module |
| `.useMocker(factory)` | `TestingModuleBuilder` | Auto-mock dependencies |
| `.overrideProvider(T)` | `OverrideMixin` | Mock a provider |
| `.overrideGuard(T)` | `OverrideMixin` | Mock a guard |
| `.overrideModule(T)` | `OverrideMixin` | Swap a module |
| `.setLogger(LoggerService)` | `TestingModuleBuilder` | Control test logging |

---

## Test File Location & Naming

```
src/
└── cats/
    ├── cats.controller.ts
    ├── cats.controller.spec.ts     ← Unit test (alongside source)
    └── cats.e2e-spec.ts            ← E2e test
test/
    └── cats.e2e-spec.ts           ← Or in /test for e2e
```

---

## Best Practices

1. **Unit test every provider** — controller/service/repositories; use `Test.createTestingModule()`
2. **E2E test every endpoint** — full HTTP request/response cycle via Supertest
3. **Mock at the provider boundary** — override `CatsService`, not internal `CatRepository`
4. **Use `useExisting` for global guards** — so they can be overridden in tests
5. **Always `await app.close()`** — in `afterAll()` to clean up open handles
6. **`useMocker()` for classes with many deps** — avoid manually listing all dependencies
7. **`jest.spyOn()` for spies** — `mockImplementation` for full replacement
8. **Test both success and error paths** — 200, 400, 401, 404 cases
