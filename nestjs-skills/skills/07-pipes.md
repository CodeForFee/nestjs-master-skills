---
name: nestjs/pipes
description: >
  PipeTransform interface, built-in pipes (ParseIntPipe, ParseUUIDPipe, ParseBoolPipe,
  ParseArrayPipe, ParseDatePipe, DefaultValuePipe), binding pipes to params/query/body,
  custom pipes, ValidationPipe, Zod validation, class-validator, whitelist, transform,
  global pipes, APP_PIPE token.
disable-model-invocation: false
user-invocable: true
---

# Pipes — Transformation & Validation

> **Senior developer context**: Pipes run at the system boundary, immediately before the handler. They execute in the **exceptions zone** — throwing an exception prevents the handler from running. Use `ValidationPipe` globally with `whitelist: true` in every production application.

---

## Two Use Cases

| Use Case | What It Does |
|---|---|
| **Transformation** | Convert input data (e.g., string `id` → number) |
| **Validation** | Check input; pass through if valid, throw if not |

Both receive arguments destined for the handler and return (potentially transformed) values.

---

## `PipeTransform` Interface

Every pipe implements `PipeTransform`:

```typescript
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class ValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // value: the incoming argument
    // metadata: context about the argument
    return value;
  }
}
```

### `ArgumentMetadata`

```typescript
interface ArgumentMetadata {
  type: 'body' | 'query' | 'param' | 'custom';
  metatype?: Type<unknown>;  // The TypeScript type (undefined in vanilla JS)
  data?: string;             // The string passed to the decorator, e.g. @Body('name')
}
```

---

## Built-in Pipes

| Pipe | Purpose | Example |
|---|---|---|
| `ParseIntPipe` | String → integer | `@Param('id', ParseIntPipe) id: number` |
| `ParseFloatPipe` | String → float | `@Query('rate', ParseFloatPipe) rate: number` |
| `ParseBoolPipe` | String → boolean | `@Query('active', ParseBoolPipe) active: boolean` |
| `ParseArrayPipe` | String → array | `@Query('ids', ParseArrayPipe) ids: string[]` |
| `ParseUUIDPipe` | String → UUID (v3/4/5) | `@Param('uuid', new ParseUUIDPipe()) uuid: string` |
| `ParseEnumPipe` | String → Enum member | `@Query('status', ParseEnumPipe) status: Status` |
| `ParseDatePipe` | String → Date | `@Query('date', ParseDatePipe) date: Date` |
| `DefaultValuePipe` | Provide default before other pipes | `@Query('page', new DefaultValuePipe(0), ParseIntPipe)` |
| `ValidationPipe` | Validate DTOs with class-validator | Global or method-level |

---

## Binding Pipes

### Parameter-Level Binding

```typescript
@Get(':id')
async findOne(
  @Param('id', ParseIntPipe) id: number,
) {
  return this.catsService.findOne(id);
}

// Custom HTTP status on failure
@Get(':id')
async findOne(
  @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }))
  id: number,
) {
  return this.catsService.findOne(id);
}
```

### Query Parameter Binding

```typescript
@Get()
async findAll(
  @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
  @Query('active', new DefaultValuePipe(false), ParseBoolPipe) active: boolean,
) {
  return this.catsService.findAll({ page, active });
}
```

Pass a **class** to let Nest instantiate it (enabling DI). Pass an **instance** to customize options.

---

## Custom Pipe — Transformation Example

```typescript
// parse-int.pipe.ts
import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException('Validation failed');
    }
    return val;
  }
}
```

## Custom Pipe — Zod Validation (Preferred)

Zod provides schema-first validation with full TypeScript inference:

```bash
npm install zod
```

```typescript
// create-cat.schema.ts
import { z } from 'zod';

export const createCatSchema = z.object({
  name: z.string(),
  age: z.number(),
  breed: z.string(),
});

export type CreateCatDto = z.infer<typeof createCatSchema>;
```

```typescript
// zod-validation.pipe.ts
import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch {
      throw new BadRequestException('Validation failed');
    }
  }
}
```

```typescript
// In controller
@Post()
@UsePipes(new ZodValidationPipe(createCatSchema))
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

**Advantage over class-validator**: Zod schemas are the single source of truth, provide compile-time inference, and have a superior DX.

> **Note**: Zod requires `strictNullChecks` in `tsconfig.json`.

---

## Custom Pipe — class-validator (Alternative)

Install:

```bash
npm i class-validator class-transformer
```

```typescript
// create-cat.dto.ts
import { IsString, IsInt, Min } from 'class-validator';

export class CreateCatDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  age: number;

  @IsString()
  breed: string;
}
```

```typescript
// validation.pipe.ts
import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }
    const object = plainToInstance(metatype, value);
    const errors = await validate(object);
    if (errors.length > 0) {
      throw new BadRequestException('Validation failed');
    }
    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
```

---

## Global Validation Pipe

Register globally in `main.ts` for automatic validation on all endpoints:

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,                  // Strip non-whitelisted properties
      forbidNonWhitelisted: true,       // Reject requests with extra properties
      transform: true,                  // Auto-transform payloads to DTO types
      transformOptions: {
        enableImplicitConversion: true,  // Auto-convert types (string → number)
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
```

### Global via `APP_PIPE` Token (Supports DI)

```typescript
// app.module.ts
import { APP_PIPE } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
```

---

## `ValidationPipe` Options Reference

| Option | Default | Effect |
|---|---|---|
| `whitelist` | `false` | Strip properties not in DTO class |
| `forbidNonWhitelisted` | `false` | Reject requests with non-whitelisted properties |
| `transform` | `false` | Auto-transform payloads to DTO instances |
| `transformNonThrowing` | `true` | Return `false` instead of throwing on transform failure |
| `enableImplicitConversion` | `false` | Auto-convert query/path params (string → number, etc.) |

**Always use `whitelist: true` in production** — prevents mass-assignment vulnerabilities.

---

## Default Values Before Parse Pipes

`Parse*` pipes throw on `null`/`undefined`. Use `DefaultValuePipe` first:

```typescript
@Get()
async findAll(
  @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
  @Query('active', new DefaultValuePipe(false), ParseBoolPipe) active: boolean,
) {
  return this.catsService.findAll({ page, active });
}
```

---

## Best Practices

1. **Always use `whitelist: true` globally** — strips malicious extra fields from request bodies
2. **Prefer Zod over class-validator** for new projects — better TypeScript inference, schema is the single source of truth
3. **Use `enableImplicitConversion: true`** in global ValidationPipe — eliminates repetitive `@ParseIntPipe` on every param
4. **Never use TypeScript interfaces for DTOs** — pipes need the runtime metatype that only classes provide
5. **Pipes run in the exceptions zone** — throwing here prevents the handler from executing; use for input validation at the boundary
6. **Use `@UsePipes()` for method-level pipes** — keep validation co-located with the handler
