---
name: nestjs/advanced
description: >
  Security (Helmet, CORS, @nestjs/passport, JWT, @nestjs/throttler, CSRF),
  Authorization/RBAC (OwnerGuard, resource-based guards), HTTP adapters (Express/Fastify),
  CORS configuration, API versioning, Logger (ConsoleLogger, JSON logging, LoggerService),
  Cookies (cookie-parser, res.cookie, httpOnly), Compression (Brotli, express/fastify),
  WebSockets (@nestjs/websockets, gateways, MessagePattern, EventPattern),
  Microservices (@nestjs/microservices, TCP, Redis, gRPC, MQTT),
  GraphQL (@nestjs/graphql, code-first, resolvers, DataLoader),
  Swagger/OpenAPI (@nestjs/swagger), Prisma integration, ServeStatic (SPA),
  Serverless (Lambda), Deployment & Docker (multi-stage Dockerfile, docker-compose, health checks),
  Standalone applications (NestFactory.createApplicationContext),
  Monorepo mode (workspace, shared libs, tsconfig references),
  Task scheduling (@nestjs/schedule, @Cron).
disable-model-invocation: false
user-invocable: true
---

# Advanced — Security, Microservices, GraphQL, Deployment & Monorepos

> **Senior developer context**: This section covers NestJS in production contexts: securing APIs, microservices, GraphQL, serverless, Docker, and monorepos. For most applications, security (JWT + rate limiting), GraphQL or REST, and Docker deployment are the primary concerns.

---

## HTTP Adapters — Express vs Fastify

Nest supports both Express and Fastify out of the box:

```typescript
// Express (default)
const app = await NestFactory.create(AppModule);

// Fastify — higher throughput
const app = await NestFactory.create(
  AppModule,
  new FastifyAdapter({ logger: true }),
);

// Type the app for platform-specific APIs
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
```

**When Fastify**: Performance-critical APIs, low-latency requirements.
**When Express**: Ecosystem compatibility (most middleware, existing tooling).

---

## Security

### Helmet (Security Headers)

```bash
npm i @nestjs/platform-express helmet
```

```typescript
const app = await NestFactory.create(AppModule);
app.use(helmet());
```

### CORS

**Never enable CORS without options in production:**

```typescript
// ❌ Bad — open to all origins
app.enableCors();

// ✅ Good — explicit allowed origins
app.enableCors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
});
```

### JWT Authentication with `@nestjs/passport`

```bash
npm install @nestjs/passport passport passport-jwt @nestjs/jwt
```

**AuthModule:**

```typescript
// jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private jwtService: JwtService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username };
  }
}

// auth.module.ts
@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

// auth.service.ts
@Injectable()
export class AuthService {
  constructor(private usersService: UsersService, private jwtService: JwtService) {}

  async signIn(username: string, pass: string) {
    const user = await this.usersService.findOne(username);
    if (!user || user.password !== pass) throw new UnauthorizedException();
    const { password, ...result } = user;
    return { access_token: this.jwtService.sign({ sub: user.userId, username }) };
  }
}

// JwtAuthGuard
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**Protect routes:**

```typescript
@Get('profile')
@UseGuards(JwtAuthGuard)
getProfile(@CurrentUser() user: any) { return user; }
```

### Rate Limiting with `@nestjs/throttler`

```bash
npm install @nestjs/throttler
```

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60_000,  // 1 minute
      limit: 10,    // 10 requests per minute
    }]),
  ],
})
export class AppModule {}
```

```typescript
// Global guard
{ provide: APP_GUARD, useClass: ThrottlerGuard }

// Skip for specific routes
@SkipThrottle()
@Get('health') {}

// Skip entire controller
@SkipThrottle()
@Controller('public') {}
```

### Authorization (RBAC)

Authorization determines what an authenticated user is *permitted* to do. Keep it in guards — never in middleware or controllers.

**Role-based access (RBAC):**

```typescript
// roles.guard.ts
@Injectable()
export class RolesGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const parentResult = super.canActivate();
    if (!parentResult) return false;

    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user?.roles?.includes(role));
  }
}
```

**Resource-based ownership guard:**

```typescript
// owner.guard.ts — checks if current user owns the resource
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user, params } = context.switchToHttp().getRequest();
    const resourceUserId = params.userId ?? params.authorId;

    // Allow if user owns the resource OR has admin role
    return user.id === resourceUserId || user.roles.includes('admin');
  }
}
```

```typescript
// Usage: combine with JWT guard
@Put(':id')
@UseGuards(JwtAuthGuard, OwnerGuard)
update(@Param('id') id: string, @Body() body: UpdateDto) {}
```

**Best practices:**
- Authentication (who are you?) is separate from authorization (what can you do?)
- Return `403 Forbidden` for authenticated-but-unauthorized users (not `401`)
- Use resource-based guards for fine-grained ownership checks; use RBAC for coarse permission tiers

### CSRF Protection

Express: Use `csurf` or `csrf-csrf` middleware.
Fastify: `@fastify/csrf-protection`.

---

## Built-in Logger

Nest ships with a built-in `Logger` class for application and framework logging.

### Basic Control

```typescript
// Disable logging entirely
const app = await NestFactory.create(AppModule, { logger: false });

// Enable only specific levels
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn'],
});
// Levels cascade upward: 'warn' includes 'error' + 'fatal'
```

### ConsoleLogger Options

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    prefix: 'MyApp',      // Prefix per message  (default: 'Nest')
    timestamp: true,      // +ms delta between logs
    json: true,           // JSON output for log aggregators
    colors: false,        // Disable color when using JSON
    compact: true,        // Single-line output
    sorted: true,         // Sort object keys
    depth: 3,             // Max recursion depth
    maxArrayLength: 50,   // Max array elements shown
    maxStringLength: 2000, // Max string length
  }),
});
```

### JSON Logging (Production)

```typescript
// For log aggregators: Elasticsearch, Datadog, CloudWatch, Loki
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ json: true }),
});
```

```json
{
  "level": "log",
  "pid": 12345,
  "timestamp": "2026-03-24T10:30:00.000Z",
  "message": "User logged in",
  "context": "AuthService",
  "userId": "usr_123"
}
```

### Custom Logger via `app.useLogger()`

```typescript
// Minimal: use a class instance
const app = await NestFactory.create(AppModule);
app.useLogger(new MyLogger());

// Full custom: implement LoggerService
@Injectable()
export class MyLoggerService implements LoggerService {
  log(message: string, context?: string) { /* send to external aggregator */ }
  error(message: string, trace?: string, context?: string) { /* ... */ }
  warn(message: string, context?: string) { /* ... */ }
  debug(message: string, context?: string) { /* ... */ }
  verbose(message: string, context?: string) { /* ... */ }
  log(message: string, context?: string) { /* Required: for framework logging */ }
}
```

**Best practices:**
- Always pass the class name as the first argument: `new Logger(MyService.name)` — enables context filtering in log aggregators
- Use JSON logging in production for structured log analysis
- Implement `LoggerService` for integration with Pino, Winston, or external aggregators
- Use `{ timestamp: true }` for performance profiling (+ms delta between calls)

---

## Cookies

### Setup (Express)

```bash
npm i cookie-parser
npm i --save-dev @types/cookie-parser
```

```typescript
// main.ts
import * as cookieParser from 'cookie-parser';
app.use(cookieParser());
```

### Reading Cookies

```typescript
@Get()
findAll(@Req() req: Request) {
  const token = req.cookies['access_token'];
  return token;
}
```

### Writing Cookies

```typescript
@Post('login')
login(@Res({ passthrough: true }) res: Response) {
  res.cookie('access_token', token, {
    httpOnly: true,       // Never readable by JavaScript (prevents XSS)
    secure: true,         // HTTPS only (set false in development)
    sameSite: 'strict',  // Block CSRF attacks
    maxAge: 86_400_000,  // 24 hours in ms
    path: '/',
    domain: '.example.com',
  });
  return { success: true };
}
```

### Signed Cookies

```typescript
// main.ts — signed cookies prevent tampering
app.use(cookieParser(process.env.COOKIE_SECRET));

// Reading signed cookies (auto-verified)
const value = req.signedCookies['session']; // null if tampered

// Writing signed cookies
res.cookie('session', data, { signed: true });
```

**Best practices:**
- Always `httpOnly: true` for session/auth cookies — prevents XSS from reading them
- Always `secure: true` in production (HTTPS); never set it globally if local dev uses HTTP
- Use `sameSite: 'strict'` (or `'lax'`) to prevent CSRF attacks
- Use signed cookies (`cookie-parser(secret)`) for sensitive data

---

## Compression

### Express

```bash
npm i compression
npm i --save-dev @types/compression
```

```typescript
// main.ts
import * as compression from 'compression';
app.use(compression());              // Default: gzip
app.use(compression({ level: 6 })); // 1 (fastest) to 9 (smallest)
```

### Fastify

```bash
npm i @fastify/compress
```

```typescript
// Fastify uses Brotli by default (Node >= 11.7.0)
// Brotli quality tunable via BROTLI_PARAM_QUALITY (0–11, default 11)
await app.register(compress, { encodings: ['br', 'gzip', 'deflate'] });
```

**Best practices:**
- Always enable compression in production — reduces response size by 60–80%
- Fastify's default Brotli is optimal for most cases; tune quality for high-traffic endpoints
- Don't compress already-compressed assets (images, PDFs, video) — wastes CPU
- Set `level` between 4–6 for a good size/CPU tradeoff on busy endpoints

---

## API Versioning

```typescript
// main.ts
app.enableVersioning({
  type: VersioningType.URI,  // or HEADER, MEDIA_TYPE, CUSTOM
  defaultVersion: '1',
});
```

```typescript
@Controller({ version: '1' })
export class CatsControllerV1 {
  @Version('2')
  @Get('cats')
  findAllV2(): string { return 'v2'; }
}
```

---

## WebSockets

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io
```

### Gateway

```typescript
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @SubscribeMessage('events')
  handleEvent(@MessageBody() data: string): string {
    return data;
  }
}
```

### `MessagePattern` / `EventPattern` (Microservices-style)

```typescript
// Inside a microservice or hybrid app
@MessagePattern({ cmd: 'cats.findAll' })
findAll(): string[] { return []; }

@EventPattern('cats.created')
async handleCatCreated(@Payload() data: Cat) {
  console.log('Cat created:', data);
}
```

---

## Microservices

```bash
npm install @nestjs/microservices
```

### TCP, Redis, gRPC, MQTT transports:

```typescript
// TCP
app.connectMicroservice({ transport: Transport.TCP });

// Redis
app.connectMicroservice({
  transport: Transport.REDIS,
  options: { url: 'redis://localhost:6379' },
});

// gRPC
app.connectMicroservice({
  transport: Transport.GRPC,
  options: { package: 'hero', protoPath: 'src/hero/hero.proto' },
});
```

### Start microservices:

```typescript
await app.startAllMicroservices();
await app.listen();
```

---

## GraphQL — `@nestjs/graphql` + `@nestjs/apollo`

### Code-First Approach

```bash
npm install @nestjs/graphql @nestjs/apollo graphql apollo-server-express
```

```typescript
// app.module.ts
@Module({
  imports: [
    GraphQLModule.forRoot({
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
    }),
  ],
})
export class AppModule {}
```

### Resolver

```typescript
@Resolver(() => Cat)
export class CatsResolver {
  constructor(private catsService: CatsService) {}

  @Query(() => [Cat])
  cats(): Promise<Cat[]> { return this.catsService.findAll(); }

  @Mutation(() => Cat)
  createCat(@Args('createCatInput') input: CreateCatInput): Promise<Cat> {
    return this.catsService.create(input);
  }
}
```

### Input/ObjectType

```typescript
@InputType()
export class CreateCatInput {
  @Field()
  name: string;

  @Field(() => Int)
  age: number;
}

@ObjectType()
export class Cat {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field(() => Int)
  age: number;
}
```

### DataLoader — N+1 Problem

```typescript
// DataLoader batches and caches DB calls within a request
@Injectable()
export class CatOwnerLoader {
  constructor(private ownersService: OwnersService) {}

  @Query(() => Owner)
  batchLoader = new DataLoader<string, Owner>(async (catIds) => {
    const owners = await this.ownersService.findByCatIds(catIds);
    return catIds.map(id => owners.find(o => o.catId === id));
  });
}
```

### Guards in GraphQL

In GraphQL, use `@Inject(CONTEXT)` not `@Inject(REQUEST)`:

```typescript
@Injectable()
export class GqlAuthGuard {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const gqlCtx = GqlExecutionContext.create(context);
    const { user } = gqlCtx.getContext().req;
    return !!user;
  }
}
```

---

## Swagger/OpenAPI — `@nestjs/swagger`

```bash
npm install @nestjs/swagger
```

```typescript
const options = new DocumentBuilder()
  .setTitle('Cats API')
  .setDescription('The cats API description')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, options);
SwaggerModule.setup('api', app, document);
```

```typescript
@Controller('cats')
@ApiTags('cats')
@ApiBearerAuth()
export class CatsController {
  @Post()
  @ApiOperation({ summary: 'Create a cat' })
  @ApiResponse({ status: 201, description: 'Created', type: CatDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Body() createCatDto: CreateCatDto): Cat { ... }
}
```

---

## ServeStatic — Static File Serving

### Setup

```bash
npm install @nestjs/serve-static
```

### Serve a Built Frontend (SPA)

```typescript
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'),
      renderPath: '/',
    }),
  ],
})
export class AppModule {}
```

### SPA Routing (Catch-All)

Serve `index.html` for all unmatched routes — required for Angular, React, Vue SPAs:

```typescript
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'client'),
  renderPath: '*',    // ← catch-all for SPA client-side routing
})
```

### Cache Control for Static Assets

```typescript
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'client'),
  serveStaticOptions: {
    cacheControl: {
      maxAge: '1y',           // Hash-named assets (e.g. main.a3f4b2.js) are immutable
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    },
  },
})
```

### Protected Static Paths

Use `exclude` to protect specific paths (e.g., serve static files only to authenticated users):

```typescript
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'uploads'),
  exclude: ['/api/*'],    // Don't accidentally serve API routes as files
})
```

**Best practices:**
- Use for admin panels, SPAs, or internal static sites bundled with the API
- Set `Cache-Control: maxAge: '1y'` for hashed filenames (`main.a3f4b2.js`) — they never change
- For production, offload static serving to Nginx or a CDN; `ServeStaticModule` is for development and simple deployments
- Always `exclude: ['/api/*']` to prevent accidental static file serving over API routes

---

## Standalone Applications

Use NestJS outside HTTP context — CLIs, CRON jobs, test runners:

```typescript
// standalone.ts
const app = await NestFactory.createApplicationContext(AppModule);
const configService = app.get(ConfigService);
// Use configService synchronously — no HTTP server started

// Shutdown
await app.close();
```

---

## Serverless — AWS Lambda

```bash
npm install @nestjs/serverless
```

```typescript
// lambda.handler.ts
import { ServerlessAdapter } from '@nestjs/platform-express';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { createServer, proxy } from 'aws-serverless-express';

let server: Server;
const lambdaHandler = (event: APIGatewayProxyEvent, context: Context) => {
  server = server ?? createServer(app.getHttpAdapter().getInstance());
  proxy(server, event, context);
};
```

**Cold start tips**: Lazy-load modules, minimize bundle size, avoid singleton connections at module level — use `onModuleInit` to establish connections lazily.

---

## Docker & Deployment

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/main"]
```

### Docker Compose (Local Dev)

```yaml
services:
  app:
    build: .
    ports: ['3000:3000']
    env_file: .env
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      retries: 5
```

### Health Check Endpoint

```typescript
@Controller()
export class HealthController {
  @Get('health')
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

---

## Monorepo Mode

```bash
nest new --monorepo
```

```
apps/
  api/               ← Main API application
  web/               ← Web application
libs/
  shared/            ← Shared DTOs, interfaces, utilities
  logger/            ← Shared logging module
```

### `tsconfig` References

```json
// apps/api/tsconfig.app.json
{
  "extends": "./tsconfig.json",
  "references": [
    { "path": "../../libs/shared/tsconfig.lib.json" }
  ]
}
```

### Sharing a Library

```typescript
// libs/shared/src/dto/ pagination.dto.ts
export class PaginationDto {
  @IsInt() @Min(1) page: number;
  @IsInt() @Min(1) pageSize: number;
}

// apps/api/src/cats/cats.controller.ts
import { PaginationDto } from '@app/shared';
```

---

## Task Scheduling — `@nestjs/schedule`

```bash
npm install @nestjs/schedule
```

```typescript
@Module({ imports: [ScheduleModule.forRoot()] })
export class AppModule {}

// Cron job
@Injectable()
export class TasksService {
  @Cron('45 * * * *')  // Every hour at :45
  handleCron() { console.log('Called at 45 minutes past every hour'); }
}

// Interval
@Interval(10_000)  // Every 10 seconds
handleInterval() {}

// Timeout
@Timeout(5_000)  // Once, 5 seconds after boot
handleTimeout() {}
```

---

## Best Practices

1. **JWT in guards, not middleware** — guards have route context; validate tokens in `JwtAuthGuard`
2. **Explicit CORS origins** — never `enableCors()` without options in production
3. **Rate limit public APIs** — `@nestjs/throttler` with global guard
4. **Use DataLoader in GraphQL** — prevent N+1 queries on relational data
5. **GraphQL guards use `@Inject(CONTEXT)`** — not `@Inject(REQUEST)`
6. **Multi-stage Dockerfile** — build in one stage, run in another; non-root user
7. **Health endpoint** — `/health` for container orchestration (Kubernetes, ECS)
8. **`enableShutdownHooks()`** — always; without it, containers don't shut down gracefully
9. **Monorepo shared libs** — extract common DTOs, interfaces, and utilities into `libs/`
10. **Standalone for CRON** — `NestFactory.createApplicationContext()` for CLI/CRON without HTTP server
