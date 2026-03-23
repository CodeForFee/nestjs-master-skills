---
name: nestjs/custom-decorators
description: >
  createParamDecorator(), ExecutionContext in decorators, @User() decorator, passing
  data/keys to decorators, applying pipes to custom decorators, applyDecorators(),
  composing auth decorators, decorator composition with @nestjs/swagger.
disable-model-invocation: false
user-invocable: true
---

# Custom Decorators — Extracting Request Data

> **Senior developer context**: Custom decorators keep controllers clean by extracting commonly-accessed request data into reusable, declarative building blocks. Nest treats custom param decorators the same as built-ins — pipes apply to them automatically.

---

## `createParamDecorator()` — Basic `@User()`

Extract `request.user` cleanly across all controllers:

```typescript
// user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

```typescript
@Get()
async findOne(@User() user: UserEntity): Promise<string> {
  return `Hello, ${user.firstName}`;
}
```

---

## Passing Data — Extract Specific Properties

```typescript
export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // If data is provided, return the specific property
    // Otherwise return the full user object
    return data ? user?.[data] : user;
  },
);
```

Usage — extract specific fields:

```typescript
@Get()
async findOne(@User('email') email: string) {
  return `Email: ${email}`;
}

@Get()
async findOne(@User('roles') roles: string[]) {
  return `Roles: ${roles.join(', ')}`;
}

@Get()
async findOne(@User() user: UserEntity) {
  return user;  // Full user object when no key provided
}
```

---

## Custom Decorator with Validation Pipe

Nest applies pipes to custom decorators the same as built-in `@Body()`, `@Query()`, etc.:

```typescript
@Get()
async findOne(
  @User(new ValidationPipe({ validateCustomDecorators: true }))
  user: UserEntity,
) {
  return user;
}
```

> **Note**: You must set `validateCustomDecorators: true` on the `ValidationPipe` — it doesn't validate custom decorators by default.

---

## Typed Decorators

Use the generic for type safety:

```typescript
// data is typed as string
export const User = createParamDecorator<string>(
  (data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);
```

---

## Generic Custom Decorator

```typescript
// Extract any property from the request
export const ReqProp = createParamDecorator(
  (key: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return key ? request[key] : request;
  },
);

// Usage
@Get()
findOne(@ReqProp('ip') ip: string) {
  return ip;
}
```

---

## Decorator Composition — `applyDecorators()`

Combine multiple decorators into one reusable annotation:

```typescript
// auth.decorator.ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata('roles', roles),          // Attach roles metadata
    UseGuards(AuthGuard, RolesGuard),      // Run auth + role checks
    ApiBearerAuth(),                        // Swagger: require bearer token
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}
```

```typescript
@Get('users')
@Auth('admin')       // Applies all 5 decorators at once
findAllUsers() {}
```

**Why it matters**: Without `applyDecorators()`, you repeat the same decorator stack on every method. Composition makes it declarative and DRY.

### `@ApiHideProperty()` Limitation

The `@ApiHideProperty()` decorator from `@nestjs/swagger` is **not** composable — it won't work inside `applyDecorators()`.

---

## Custom Decorator Pattern: `@CurrentUser()`

A common pattern replacing the generic `@User()` with an explicit name:

```typescript
export const CurrentUser = createParamDecorator(
  (data: keyof UserEntity | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserEntity;

    return data ? user?.[data] : user;
  },
);
```

```typescript
@Get('profile')
getProfile(@CurrentUser() user: UserEntity) {
  return user;
}

@Get('profile/id')
getProfileId(@CurrentUser('id') id: string) {
  return { id };
}
```

---

## Best Practices

1. **Name decorators semantically** — `@User()`, `@CurrentUser()`, `@TenantId()` are clearer than `@ReqProp('tenantId')`
2. **Support both full object and property extraction** — return `data ? user?.[data] : user`
3. **Handle undefined** — always account for cases where `request.user` isn't set (anonymous requests)
4. **Use `applyDecorators()` for auth stacks** — combine guards, metadata, and Swagger decorators into a single reusable annotation
5. **Enable `validateCustomDecorators`** on your global ValidationPipe if you need to validate custom decorator arguments
6. **`createParamDecorator` is the only correct way** — don't manually implement decorators; Nest won't recognize them as param decorators
