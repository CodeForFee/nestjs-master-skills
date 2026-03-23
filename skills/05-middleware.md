---
name: nestjs/middleware
description: >
  Class-based middleware, functional middleware, MiddlewareConsumer, apply(), forRoutes(),
  request method restriction, exclude(), multiple middleware, and global middleware.
disable-model-invocation: false
user-invocable: true
---

# Middleware — Pre-Request Processing

> **Senior developer context**: Middleware runs before the route handler — but after guards. Prefer guards for authentication (they have route context via `ExecutionContext`). Use middleware for cross-cutting concerns that don't need route info: logging, request tagging, CORS preflight.

---

## Class-Based Middleware

Implement the `NestMiddleware` interface:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  }
}
```

Middleware must call `next()` or the request will hang. If it ends the request-response cycle, do not call `next()`.

---

## Functional Middleware (Preferred When No Dependencies)

For middleware with no dependencies, a plain function is simpler:

```typescript
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
}
```

**When to use functional**: When the middleware has no injected dependencies.
**When to use class-based**: When you need DI (e.g., injecting a service to log to a database).

---

## Applying Middleware — `MiddlewareConsumer`

Implement `NestModule` on your module and use `configure()`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { CatsModule } from './cats/cats.module';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('cats');
  }
}
```

`configure()` can be `async`:

```typescript
async configure(consumer: MiddlewareConsumer) {
  await someAsyncSetup();
  consumer.apply(LoggerMiddleware).forRoutes('cats');
}
```

---

## Restricting by Route and Method

```typescript
import { RequestMethod } from '@nestjs/common';

consumer
  .apply(LoggerMiddleware)
  .forRoutes({ path: 'cats', method: RequestMethod.GET });
```

### Applying to a Controller Class

```typescript
consumer
  .apply(LoggerMiddleware)
  .forRoutes(CatsController);  // All routes in this controller
```

---

## Excluding Routes

```typescript
consumer
  .apply(LoggerMiddleware)
  .exclude(
    { path: 'cats', method: RequestMethod.GET },
    { path: 'cats', method: RequestMethod.POST },
    'cats/{*splat}',  // Wildcard support via path-to-regexp
  )
  .forRoutes(CatsController);
```

`exclude()` accepts strings, `RouteInfo` objects, or mixed lists.

---

## Route Wildcards

```typescript
// Match any path starting with "abcd/"
.forRoutes({ path: 'abcd/*splat', method: RequestMethod.ALL });

// Make the trailing segment optional: abcd/ + abcd/anything
.forRoutes({ path: 'abcd/{*splat}', method: RequestMethod.ALL });
```

`splat` is just a name — rename freely. Hyphen and dot are literal characters in string-based paths.

---

## Multiple Middleware

Chain multiple middleware in the order they should execute:

```typescript
consumer
  .apply(cors(), helmet(), logger)
  .forRoutes(CatsController);
```

---

## Global Middleware

Apply middleware to every route without a module class:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(logger);  // ← Global, applies to all routes

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### Key Limitation

Global middleware applied via `app.use()` **cannot use the DI container**. For DI-enabled global middleware, use class-based middleware with `.forRoutes('*')` inside a module's `configure()`:

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(GlobalMiddleware)  // Class with @Injectable() + NestMiddleware
    .forRoutes('*');          // All routes
}
```

---

## Important Notes

### Platform Differences

Express and Fastify handle middleware differently and have different method signatures. If writing platform-specific middleware, check the adapter in use.

### Body Parser

With the Express adapter, Nest registers `body-parser` middleware (`json`, `urlencoded`) by default. To disable:

```typescript
NestFactory.create(AppModule, { bodyParser: false });
```

Then register your own body parser middleware via `app.use()`.

---

## Execution Order

```
Request → Middleware → Guard → Interceptor (before) → Pipe → Handler
```

Middleware runs **after** global middleware but **before** guards. Guards have `ExecutionContext` and know the route/handler — middleware does not.

---

## Best Practices

1. **Functional middleware by default** — use class-based only when you need DI
2. **Use guards for auth** — guards have route context, middleware does not
3. **Always call `next()`** — unless you explicitly end the request-response cycle
4. **Global middleware via DI** — use class-based with `.forRoutes('*')` if you need DI in global middleware
5. **Don't use middleware for validation** — use Pipes (they run after guards and have handler context)
