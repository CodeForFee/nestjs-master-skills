---
name: nestjs/guards
description: >
  CanActivate interface, AuthGuard pattern, RolesGuard with Reflector, ExecutionContext,
  Reflector.createDecorator<T>(), @Roles() custom decorator, binding guards (method/
  controller/global), APP_GUARD token, throwing UnauthorizedException.
disable-model-invocation: false
user-invocable: true
---

# Guards — Authorization

> **Senior developer context**: Guards run **after middleware** but **before pipes/interceptors**. They determine whether a request proceeds. Use guards for authorization (role checks, permission checks). Use middleware to attach the `user` object to the request — validate in guards.

---

## `CanActivate` Interface

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    return validateRequest(request);  // returns boolean
  }
}
```

Return value:
- `true` → request proceeds
- `false` → Nest throws `ForbiddenException` automatically
- Throw a specific exception (e.g., `UnauthorizedException`) for custom error responses

---

## Execution Context

`ExecutionContext` extends `ArgumentsHost` and provides route-aware context:

```typescript
canActivate(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest();
  const response = context.switchToHttp().getResponse();
  const handler = context.getHandler();      // The route handler
  const controller = context.getClass();      // The controller class
  const methodName = handler.name;           // e.g., "findOne"
  return true;
}
```

---

## AuthGuard Pattern

Attach `user` to the request in middleware, validate in a guard:

```typescript
// 1. Middleware attaches user (cats.middleware.ts)
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      req.user = this.jwtService.verify(token);
    }
    next();
  }
}

// 2. Guard validates (auth.guard.ts)
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException('No token provided');
    }
    return true;
  }
}
```

---

## RolesGuard with `Reflector`

### Step 1 — Create a `@Roles()` Decorator

```typescript
// roles.decorator.ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();
```

Use it on handlers:

```typescript
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

> **Why `createDecorator`?** It's typed (no casting), generates unique keys automatically, and avoids string typos.

### Step 2 — Implement the RolesGuard

```typescript
// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get(Roles, context.getHandler());
    if (!requiredRoles) {
      return true;  // No roles required — allow by default
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
```

Read roles from **handler** (`context.getHandler()`) not controller — handlers may override controller-level roles.

---

## Binding Guards

### Method-Scoped

```typescript
@Post()
@UseGuards(RolesGuard)
async create(@Body() createCatDto: CreateCatDto) { ... }
```

### Controller-Scoped

```typescript
@Controller()
@UseGuards(RolesGuard)
export class CatsController {}
```

### Global — via `useGlobalGuards()`

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new RolesGuard());
  await app.listen(process.env.PORT ?? 3000);
}
```

**Limitation**: Global guards via `useGlobalGuards()` cannot use DI.

### Global via `APP_GUARD` Token (Preferred — Supports DI)

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
```

---

## Throwing Specific Exceptions

When a guard returns `false`, Nest throws `ForbiddenException`. To customize the error:

```typescript
throw new UnauthorizedException('Token expired');
throw new ForbiddenException('Admin role required');
throw new NotFoundException('User not found');
```

Any exception thrown in a guard is handled by the exception filter layer.

---

## `Reflector` Helper Methods

```typescript
// Get metadata — from handler, then controller, then class
const roles = this.reflector.get(Roles, context.getHandler());

// Override: check only handler metadata
const roles = this.reflector.getAllAndOverride(Roles, [context.getHandler()]);

// Merge: combine controller + handler metadata
const roles = this.reflector.getAllAndMerge(Roles, [
  context.getHandler(),
  context.getClass(),
]);
```

---

## Execution Order

```
Request → Middleware → Guard → Interceptor (before) → Pipe → Handler
```

Guards run **after all middleware** — middleware is the right place to parse tokens and attach `user`. Guards run **before pipes** — validate roles and permissions here.

---

## Best Practices

1. **Validate in guards, attach in middleware** — middleware sets `request.user`, guards check authorization
2. **Use `Reflector.createDecorator<T>()`** — typed, unique keys, no string typos
3. **Always throw specific exceptions** — `UnauthorizedException`, `ForbiddenException`, not bare `false`
4. **Read metadata from `context.getHandler()`** — handler-level roles override controller-level
5. **Use `APP_GUARD` for DI-enabled global guards** — not `useGlobalGuards()` which bypasses DI
6. **Return `true` when no roles are required** — don't require guards to be explicitly applied to every public endpoint
