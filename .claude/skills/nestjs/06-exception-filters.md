---
name: nestjs/exception-filters
description: >
  HttpException, built-in HTTP exceptions, custom exceptions, @Catch(), ExceptionFilter,
  ArgumentsHost, switchToHttp(), binding (method/controller/global), APP_FILTER token,
  catch-all filters, HttpAdapterHost, BaseExceptionFilter inheritance.
disable-model-invocation: false
user-invocable: true
---

# Exception Filters — Error Handling

> **Senior developer context**: Every application needs a catch-all global exception filter. Always use specific `HttpException` subclasses rather than generic errors. Log exceptions in filters (built-in HTTP exceptions don't log by default).

---

## Throwing HTTP Exceptions

Use `HttpException` from `@nestjs/common`:

```typescript
@Get()
async findAll() {
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}
```

Response:

```json
{ "statusCode": 403, "message": "Forbidden" }
```

### Response Override

```typescript
// Override the message
throw new HttpException('Custom message', HttpStatus.FORBIDDEN);

// Override the entire body
throw new HttpException({ status: 403, error: 'Too many requests' }, HttpStatus.FORBIDDEN);

// With error cause (for logging, not sent to client)
throw new HttpException('Forbidden', HttpStatus.FORBIDDEN, { cause: error });
```

---

## Built-in HTTP Exceptions

Nest provides typed subclasses for all standard HTTP errors:

| Exception | Status | Use When |
|---|---|---|
| `BadRequestException` | 400 | Invalid input, malformed request |
| `UnauthorizedException` | 401 | Missing or invalid auth |
| `NotFoundException` | 404 | Resource not found |
| `ForbiddenException` | 403 | Authenticated but not authorized |
| `NotAcceptableException` | 406 | Content format not acceptable |
| `RequestTimeoutException` | 408 | Request timeout |
| `ConflictException` | 409 | State conflict (duplicate) |
| `GoneException` | 410 | Resource permanently removed |
| `PayloadTooLargeException` | 413 | Request entity too large |
| `UnsupportedMediaTypeException` | 415 | Media type not supported |
| `UnprocessableEntityException` | 422 | Valid format but semantic error |
| `InternalServerErrorException` | 500 | Unhandled server error |
| `NotImplementedException` | 501 | Method not implemented |
| `BadGatewayException` | 502 | Invalid response from upstream |
| `ServiceUnavailableException` | 503 | Service temporarily down |
| `GatewayTimeoutException` | 504 | Upstream timeout |

All accept optional `{ cause, description }` options.

---

## Custom Exceptions

Create a custom exception that extends `HttpException` for domain-specific errors:

```typescript
// forbidden.exception.ts
export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(message, HttpStatus.FORBIDDEN);
  }
}
```

Since it extends `HttpException`, Nest handles it automatically — no additional registration needed.

---

## Exception Filters

Implement `ExceptionFilter` to take full control over error responses and logging:

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.getResponse(),
    });
  }
}
```

`@Catch(HttpException)` makes this filter only handle `HttpException` (and its subclasses). Omit the argument to catch everything.

---

## `ArgumentsHost`

`ArgumentsHost` provides access to the underlying platform's request/response objects. Use `switchToHttp()` for HTTP:

```typescript
const ctx = host.switchToHttp();
const response = ctx.getResponse<Response>();
const request = ctx.getRequest<Request>();
const status = exception.getStatus();
```

Also available: `switchToRpc()` (microservices), `switchToWs()` (WebSockets).

---

## Binding Filters

### Method-Scoped

```typescript
@Post()
@UseFilters(new HttpExceptionFilter())
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}
```

### Controller-Scoped

```typescript
@Controller()
@UseFilters(HttpExceptionFilter)  // Class — Nest instantiates
export class CatsController {}
```

### Global (via `app.useGlobalFilters`)

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
```

**Limitation**: `useGlobalFilters()` filters can't use DI. For DI-enabled global filters, use the `APP_FILTER` token.

### Global via `APP_FILTER` Token (Preferred — Supports DI)

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
```

---

## Catch-All Filter — Platform-Agnostic

Catch every exception regardless of type using `HttpAdapterHost` for platform independence:

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
```

This works with both Express and Fastify without modification.

---

## Extending `BaseExceptionFilter`

Extend the built-in global filter to override specific behavior:

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Custom pre-processing before delegating to base
    super.catch(exception, host);
  }
}
```

### Instantiation Options for Global Filters

**Option 1**: Pass `HttpAdapter` reference:

```typescript
const { httpAdapter } = app.get(HttpAdapterHost);
app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
```

**Option 2**: Use `APP_FILTER` token (enables DI):

```typescript
{
  provide: APP_FILTER,
  useClass: AllExceptionsFilter,
}
```

---

## Logging — Exceptions Don't Log by Default

`HttpException` and its subclasses are considered part of normal application flow and are **not logged** by the built-in exception filter. If you need logging, create a custom filter:

```typescript
@Catch()
export class LoggingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    console.error('[Exception]', exception);  // Or use a logger service
    throw exception;  // Re-throw so other filters handle it
  }
}
```

---

## Best Practices

1. **Always have a global catch-all filter in production** — handles unexpected errors with a safe JSON response
2. **Use specific exception classes** — `ForbiddenException` not `throw Error()`
3. **Log all exceptions in filters** — the built-in filter doesn't log `HttpException`
4. **Use `APP_FILTER` for DI-enabled global filters** — not `useGlobalFilters()` which bypasses DI
5. **Platform-agnostic via `HttpAdapterHost`** — use it when your filter needs to work with both Express and Fastify
6. **Include request context in error responses** — path, timestamp, request ID for traceability
7. **Never expose internal error details in production** — sanitize error messages before sending to client
