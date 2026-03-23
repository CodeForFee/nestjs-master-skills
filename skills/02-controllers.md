---
name: nestjs/controllers
description: >
  @Controller(), routing, HTTP method decorators (@Get, @Post, @Put, @Delete, @Patch),
  parameter decorators (@Body, @Query, @Param, @Req, @Res, @Headers, @Ip, @HostParam, @Session),
  DTOs (classes, not interfaces), status codes, response headers, redirection,
  route wildcards, sub-domain routing, async handlers, request/response handling.
disable-model-invocation: false
user-invocable: true
---

# Controllers — Routing & Request Handling

> **Senior developer context**: Controllers handle HTTP requests. They should be thin — delegate all business logic to providers. Always use **classes** (not TypeScript interfaces) for DTOs so Pipes can validate them at runtime.

---

## Routing

### Basic Controller

```typescript
@Controller('cats')
export class CatsController {
  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}
```

The `@Controller('cats')` sets a route prefix. Combined with `@Get()`, this maps to `GET /cats`. Route paths cascade: `@Controller('cats')` + `@Get('breed')` = `GET /cats/breed`.

### Route Parameter Decorators

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `This action returns #${id} cat`;
}
```

**Rule**: Declare parameterized routes after static paths to prevent them from intercepting static routes.

---

## HTTP Method Decorators

| Decorator | Method | Notes |
|---|---|---|
| `@Get()` | GET | Retrieve data |
| `@Post()` | POST | Create resource (default 201) |
| `@Put()` | PUT | Full replacement |
| `@Patch()` | PATCH | Partial update |
| `@Delete()` | DELETE | Remove resource |
| `@Options()` | OPTIONS | CORS preflight |
| `@Head()` | HEAD | Headers only |
| `@All()` | * | All HTTP methods |

---

## Parameter Decorators

| Decorator | Platform Property | Usage |
|---|---|---|
| `@Req()` / `@Request()` | `req` | Full request object |
| `@Res()` / `@Response()` | `res` | Full response object (switches to library-specific mode) |
| `@Body(key?: string)` | `req.body` | Request body |
| `@Query(key?: string)` | `req.query` | Query string params |
| `@Param(key?: string)` | `req.params` | Route parameters |
| `@Headers(name?: string)` | `req.headers` | Request headers |
| `@Ip()` | `req.ip` | Client IP address |
| `@HostParam()` | `req.hosts` | Sub-domain host params |
| `@Session()` | `req.session` | Express session |
| `@Next()` | `next` | Next middleware |

### `@Query()` with type casting

```typescript
@Get()
async findAll(
  @Query('age') age: number,
  @Query('breed') breed: string,
): Promise<string> {
  return `Filtered by age: ${age} and breed: ${breed}`;
}
```

### Complex query parsing

For nested objects (`?filter[where][name]=John`) and arrays (`?item[]=1&item[]=2`), configure the HTTP adapter:

```typescript
// Express — extended query parser
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');

// Fastify
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ querystringParser: (str) => qs.parse(str) }),
);
```

---

## Response Handling

### Standard Mode (Recommended)

Return a value — Nest serializes it to JSON automatically:

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto): Promise<Cat> {
  return this.catsService.create(createCatDto);
}
```

- Object/array → JSON
- Primitive (string, number) → raw value
- Default status: **200** (GET/DELETE/PATCH/PUT), **201** (POST)

### Library-Specific Mode (`@Res({ passthrough: true })`)

Use this when you need to set cookies or headers while letting Nest handle the body:

```typescript
@Get()
findAll(
  @Res({ passthrough: true }) res: Response,
): Cat[] {
  res.header('X-Custom', 'value');
  return this.catsService.findAll();
}
```

**Without `passthrough: true`**, you must call `res.json()` or `res.send()` manually or the request will hang.

---

## Status Codes

```typescript
@Post()
@HttpCode(204)  // Override default 201
create(): string {
  return 'Created';
}
```

Use `HttpStatus` enum from `@nestjs/common`. For dynamic status codes, use `@Res()` and call `res.status(code)`.

---

## Response Headers

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create(): string {
  return 'Created';
}
```

---

## Redirection

```typescript
@Get()
@Redirect('https://nestjs.com', 301)  // url, statusCode (defaults to 302)

// Dynamic override — return an object
@Get('docs')
@Redirect()
getDocs(@Query('version') version: string) {
  if (version === '5') {
    return { url: 'https://docs.nestjs.com/v5/', statusCode: 302 };
  }
}
```

---

## Sub-domain Routing

```typescript
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string { return 'Admin page'; }
}

// With host parameters
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string): string {
    return `Account: ${account}`;
  }
}
```

> **Note**: Fastify does not support sub-domain routing. Use the Express adapter if you need this feature.

---

## Route Wildcards

```typescript
// Match abcd/, abcd/anything, abcd/foo/bar
@Get('abcd/*')
findAll(): string {
  return 'Wildcard route';
}

// Express v5 requires named wildcards: abcd/*splat
@Get('abcd/{*splat}')
findAll(): string {
  return 'Named wildcard route';
}

// Optional wildcard: abcd/ + abcd/anything
@Get('abcd/{*splat}?')  // Fastify; Express needs explicit optional
```

---

## Async Handlers

Nest supports both `Promise` and RxJS `Observable`:

```typescript
// Promise — async/await
@Get()
async findAll(): Promise<Cat[]> {
  return this.catsService.findAll();
}

// Observable — Nest subscribes and resolves the emitted value
@Get()
findAll(): Observable<Cat[]> {
  return of(this.catsService.findAll());
}
```

---

## DTOs — Use Classes, Not Interfaces

**Critical**: TypeScript interfaces are erased at runtime. Pipes and class-validator need the runtime metatype — only classes provide that.

```typescript
// ❌ Bad — interface, no runtime metatype
interface CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

// ✅ Good — class survives compilation, works with ValidationPipe
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}
```

### Full CRUD Controller Example

```typescript
@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() createCatDto: CreateCatDto): Cat {
    return this.catsService.create(createCatDto);
  }

  @Get()
  findAll(@Query() query: ListAllEntities): Cat[] {
    return this.catsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Cat {
    return this.catsService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateCatDto: UpdateCatDto,
  ): Cat {
    return this.catsService.update(id, updateCatDto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.catsService.remove(id);
  }
}
```

---

## State Sharing

Nearly everything in Nest is a **singleton** shared across all requests — database connection pools, singleton services, etc. This is safe in Node.js's single-threaded model. Use request-scoped providers only for per-request state (GraphQL request caching, multi-tenancy, etc.).

---

## Best Practices

1. **Use standard response mode** — avoid `@Res()` unless you need direct control
2. **Always use classes for DTOs** — never interfaces (Pipes need runtime metatype)
3. **Static routes before parameterized routes** — prevents param routes from shadowing static paths
4. **Keep controllers thin** — delegate to services, not business logic
5. **Separate Create/Update/Query DTOs** — don't reuse the same DTO for all operations
6. **Use `@nestjs/swagger`** for OpenAPI documentation — see `14-advanced.md`
