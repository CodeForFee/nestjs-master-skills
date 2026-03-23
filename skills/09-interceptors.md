---
name: nestjs/interceptors
description: >
  NestInterceptor, intercept(), CallHandler, handle(), RxJS operators (map, tap, catchError,
  timeout, switchMap), LoggingInterceptor, TransformInterceptor, ErrorsInterceptor,
  CacheInterceptor, response mapping, exception mapping, stream overriding, binding
  (method/controller/global), APP_INTERCEPTOR token.
disable-model-invocation: false
user-invocable: true
---

# Interceptors — Cross-Cutting Logic

> **Senior developer context**: Interceptors wrap the handler — they execute **before and after** the route handler. Use them for logging, response transformation, caching, and retry logic. Not for auth (use guards) or input validation (use pipes).

---

## `NestInterceptor` Interface

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle();  // Invokes the route handler
  }
}
```

`handle()` returns an RxJS `Observable`. The interceptor wraps this observable, enabling logic before (`next.handle()` is called) and after (via RxJS operators on the returned stream).

---

## Key RxJS Operators

| Operator | Purpose |
|---|---|
| `tap()` | Side effects (logging) — doesn't affect the stream |
| `map()` | Transform the emitted value |
| `catchError()` | Handle/transform errors |
| `timeout()` | Cancel after N milliseconds |
| `switchMap()` | Replace the stream with another |

---

## Logging Interceptor

```typescript
// logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();

    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url} started`);

    return next.handle().pipe(
      tap(() => {
        console.log(`[${new Date().toISOString()}] Done in ${Date.now() - now}ms`);
      }),
    );
  }
}
```

---

## Response Transformation

Wrap every response in a standard envelope:

```typescript
// transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PaginatedResponse<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, PaginatedResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<PaginatedResponse<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
```

---

## Null → Empty String

```typescript
@Injectable()
export class ExcludeNullInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((value) => (value === null ? '' : value)),
    );
  }
}
```

---

## Error Transformation

Remap errors to user-friendly responses:

```typescript
// errors.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadGatewayException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        // Log here, then remap
        console.error(`[ErrorsInterceptor] ${err.message}`);
        return throwError(() => new BadGatewayException('Service temporarily unavailable'));
      }),
    );
  }
}
```

---

## Cache Interceptor (Stream Override)

Short-circuit the handler by returning early:

```typescript
// cache.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private cacheService: CacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const key = context.switchToHttp().getRequest().url;

    if (this.cacheService.has(key)) {
      return of(this.cacheService.get(key));  // Short-circuit — handler never runs
    }

    return next.handle().pipe(
      tap((data) => this.cacheService.set(key, data)),
    );
  }
}
```

Returning from an interceptor (without calling `next.handle()`) completely bypasses the route handler.

---

## Timeout Interceptor

```typescript
// timeout.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
```

---

## Binding Interceptors

### Method-Scoped

```typescript
@UseInterceptors(LoggingInterceptor)
async findAll() { ... }
```

### Controller-Scoped

```typescript
@Controller()
@UseInterceptors(LoggingInterceptor)
export class CatsController {}
```

### Global via `useGlobalInterceptors()`

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
```

### Global via `APP_INTERCEPTOR` Token (Supports DI)

```typescript
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

---

## Execution Order

```
Request → Guard → Interceptor (before) → Pipe → Handler
                                                ↑
          ← Interceptor (after) ← Exception Filter ←
```

Interceptors wrap the handler from **both sides** — `intercept()` runs before `next.handle()`, and RxJS operators on the returned `Observable` run after.

---

## Best Practices

1. **Use interceptors for cross-cutting output concerns** — logging, response wrapping, caching, timing
2. **Not for auth** — use guards (they run before interceptors and have route context)
3. **Not for input validation** — use pipes (they run after interceptors and have param context)
4. **`next.handle()` is lazy** — the handler doesn't execute until you call it
5. **Use `tap()` for logging** — it doesn't interfere with the response stream
6. **Cache with `of()` to short-circuit** — handler is skipped entirely
7. **Use `APP_INTERCEPTOR` for DI-enabled global interceptors**
