---
name: nestjs/techniques
description: >
  @nestjs/config (ConfigModule, ConfigService, .env, validation, custom config files,
  namespaced config), HTTP client (@nestjs/axios, HttpModule, HttpService, Axios interceptors,
  retry, firstValueFrom), TypeORM (@nestjs/typeorm, entities, repositories, relations,
  migrations, transactions, subscribers), Mongoose (@nestjs/mongoose, schemas,
  discriminators, plugins, hooks), @nestjs/cache-manager (in-memory, Redis,
  CacheInterceptor, TTL, @CacheKey, @CacheTTL), Serialization (class-transformer,
  @Exclude, @Expose, plainToInstance).
disable-model-invocation: false
user-invocable: true
---

# Techniques — Configuration, Database, Caching & Serialization

> **Senior developer context**: Every production app needs `ConfigModule` with env validation, an ORM, and a caching strategy. Never hardcode connection strings — always use `ConfigService`. Never set `synchronize: true` in production.

---

## Configuration — `@nestjs/config`

### Setup

```bash
npm i --save @nestjs/config
```

```typescript
// app.module.ts
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

`isGlobal: true` means you don't need to import `ConfigModule` in other modules.

### `.env` Files

```bash
# .env
DATABASE_HOST=localhost
DATABASE_PORT=5432
PORT=3000
```

```typescript
ConfigModule.forRoot({
  envFilePath: '.env.development',   // or array of paths
  ignoreEnvFile: true,              // use process.env only
})
```

### Custom Configuration Files

```typescript
// config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  },
});

@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration] }),
  ],
})
export class AppModule {}
```

### Using `ConfigService`

```typescript
constructor(private configService: ConfigService) {}

// Simple env var
const port = this.configService.get<number>('PORT');

// Nested config
const dbHost = this.configService.get<string>('database.host');

// With default
const host = this.configService.get<string>('database.host', 'localhost');

// Typed interface
interface DatabaseConfig { host: string; port: number; }
const db = this.configService.get<DatabaseConfig>('database');
```

### Namespaced Config

```typescript
// config/database.config.ts
import { registerAs } from '@nestjs/config';
export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
}));
```

```typescript
// Use in module — via ConfigService
this.configService.get<string>('database.host');

// Or inject directly with full typing
constructor(
  @Inject(databaseConfig.KEY) private dbConfig: ConfigType<typeof databaseConfig>,
) {}
```

Pass to `TypeOrmModule` via `.asProvider()`:

```typescript
TypeOrmModule.forRootAsync(databaseConfig.asProvider())
```

### Environment Validation (Joi)

```bash
npm i --save joi
```

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().port().default(3000),
      }),
    }),
  ],
})
export class AppModule {}
```

### Conditional Module Loading

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(FooModule, 'USE_FOO'),  // load if USE_FOO is truthy
  ],
})
export class AppModule {}
```

### Expandable Variables

```bash
# .env
APP_URL=example.com
SUPPORT_EMAIL=support@${APP_URL}
```

```typescript
ConfigModule.forRoot({ expandVariables: true })
```

---

## HTTP Client — `@nestjs/axios` / `HttpModule`

`HttpModule` wraps Axios as a NestJS-native injectable HTTP client. Use it for calling external APIs — never make raw Axios calls in services.

### Setup

```bash
npm install @nestjs/axios axios
```

```typescript
@Module({
  imports: [HttpModule.register({ timeout: 5000 })],
})
export class AppModule {}
```

### Making Requests

```typescript
@Injectable()
export class CatsService {
  constructor(private readonly httpService: HttpService) {}

  // Returns Observable<AxiosResponse<Cat[]>>
  findAll(): Observable<AxiosResponse<Cat[]>> {
    return this.httpService.get<Cat[]>('http://localhost:3000/api/cats');
  }

  // Convert to Promise with firstValueFrom
  async findAllSync(): Promise<Cat[]> {
    const { data } = await firstValueFrom(
      this.httpService.get<Cat[]>('http://localhost:3000/api/cats'),
    );
    return data;
  }
}
```

### Async Configuration with `ConfigService`

```typescript
HttpModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    timeout: configService.get<number>('HTTP_TIMEOUT', 5000),
    baseURL: configService.get<string>('EXTERNAL_API_URL'),
    maxRedirects: configService.get<number>('HTTP_MAX_REDIRECTS', 5),
  }),
  inject: [ConfigService],
})
```

### `useClass` / `useExisting` Pattern

```typescript
// Factory class instead of inline useFactory
@Injectable()
class HttpConfigService implements HttpModuleOptionsFactory {
  createHttpOptions(): HttpModuleOptions {
    return { timeout: 5000, maxRedirects: 5 };
  }
}

HttpModule.registerAsync({
  useClass: HttpConfigService,
  extraProviders: [MyAdditionalProvider], // merged with module providers
})
```

### Axios Interceptors

```typescript
@Injectable()
export class HttpInterceptorConfigurator implements HttpModuleOptionsFactory {
  createHttpOptions(): HttpModuleOptions {
    return {
      timeout: 5000,
      interceptors: [
        {
          requestInterceptor: (config) => {
            config.headers['Authorization'] = `Bearer ${this.token}`;
            return config;
          },
          requestErrorInterceptor: (error) => {
            this.logger.error(error);
            return throwError(() => error);
          },
          responseInterceptor: (response) => response,
          responseErrorInterceptor: (error) => {
            this.logger.error(error);
            return throwError(() => error);
          },
        },
      ],
    };
  }
}
```

### Error Handling & Retry

```typescript
import { catchError, retry, throwError } from 'rxjs';

async fetchWithRetry(url: string): Promise<any> {
  return firstValueFrom(
    this.httpService.get(url).pipe(
      retry({ count: 3, delay: 1000 }),       // Retry 3x, 1s delay
      catchError((error) => {                  // Transform error
        return throwError(() => new ExternalServiceError(error.message));
      }),
    ),
  );
}
```

### Accessing the Raw Axios Instance

```typescript
const axiosInstance = this.httpService.axiosRef;
// Use for things not exposed by HttpService
```

---

## TypeORM — `@nestjs/typeorm`

### Setup

```bash
npm install @nestjs/typeorm typeorm mysql2
```

```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: this.configService.get('database.host'),
      port: this.configService.get<number>('database.port'),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [],           // or use autoLoadEntities
      synchronize: false,     // NEVER true in production
      autoLoadEntities: true, // auto-load entities from forFeature()
      retryAttempts: 3,
    }),
  ],
})
export class AppModule {}
```

### Entities

```typescript
// user.entity.ts
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;
}
```

### Module & Repository

```typescript
// users.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [TypeOrmModule],  // or export specific providers
})
export class UsersModule {}

// users.service.ts
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> { return this.usersRepository.find(); }
  findOne(id: number): Promise<User | null> { return this.usersRepository.findOneBy({ id }); }
  async remove(id: number): Promise<void> { await this.usersRepository.delete(id); }
}
```

### Relations

```typescript
// One-to-many
@Entity()
export class User {
  @OneToMany(() => Photo, (photo) => photo.user)
  photos: Photo[];
}

// Many-to-one
@Entity()
export class Photo {
  @ManyToOne(() => User, (user) => user.photos)
  @JoinColumn()
  user: User;
}

// Many-to-many
@ManyToMany(() => Category, (category) => category.articles)
@JoinTable()
categories: Category[];
```

### Transactions

```typescript
// QueryRunner approach (recommended)
async createMany(users: User[]) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.manager.save(users[0]);
    await queryRunner.manager.save(users[1]);
    await queryRunner.commitTransaction();
  } catch {
    await queryRunner.rollbackTransaction();
  } finally { await queryRunner.release(); }
}

// Callback approach
async createMany(users: User[]) {
  await this.dataSource.transaction(async (manager) => {
    await manager.save(users[0]);
    await manager.save(users[1]);
  });
}
```

### Subscribers

```typescript
@EventSubscriber()
export class UserSubscriber implements EntitySubscriberInterface<User> {
  constructor(dataSource: DataSource) { dataSource.subscribers.push(this); }
  listenTo() { return User; }
  beforeInsert(event: InsertEvent<User>) { console.log('BEFORE INSERT:', event.entity); }
}
```

### Multiple Databases

```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({ name: 'default', ... }),
    TypeOrmModule.forRoot({ name: 'albumsConnection', ... }),
  ],
})
export class AppModule {}

// Inject by name
@InjectDataSource('albumsConnection') private dataSource: DataSource,
@InjectEntityManager('albumsConnection') private entityManager: EntityManager,
```

### Async Configuration

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.get('database.host'),
    // ...
  }),
  inject: [ConfigService],
})
```

---

## Mongoose — `@nestjs/mongoose`

### Setup

```bash
npm i @nestjs/mongoose mongoose
```

```typescript
@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest')],
})
export class AppModule {}
```

### Schemas

```typescript
// cat.schema.ts
@Schema({ timestamps: true })
export class Cat {
  @Prop({ required: true })
  name: string;

  @Prop()
  age: number;

  @Prop()
  breed: string;
}

export const CatSchema = SchemaFactory.createForClass(Cat);
```

### Module & Model

```typescript
@Module({
  imports: [MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }])],
  providers: [CatsService],
  controllers: [CatsController],
})
export class CatsModule {}

// Inject
constructor(@InjectModel(Cat.name) private catModel: Model<Cat>) {}
```

### Mongoose Hooks (Pre/Post)

```typescript
MongooseModule.forFeatureAsync([{
  name: Cat.name,
  useFactory: () => {
    const schema = CatSchema;
    schema.pre('save', function () { console.log('Hello from pre save'); });
    return schema;
  },
}])
```

### Discriminators

```typescript
// Base event schema + discriminators for ClickedLink / SignUp events
// stored in same MongoDB collection
MongooseModule.forFeature([{
  name: Event.name,
  schema: EventSchema,
  discriminators: [
    { name: ClickedLinkEvent.name, schema: ClickedLinkEventSchema },
    { name: SignUpEvent.name, schema: SignUpEventSchema },
  ],
}])
```

### Connection Events

```typescript
MongooseModule.forRoot('mongodb://localhost/test', {
  onConnectionCreate: (connection) => {
    connection.on('connected', () => console.log('connected'));
    connection.on('disconnected', () => console.log('disconnected'));
    return connection;
  },
})
```

### Async Configuration

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    uri: configService.get<string>('MONGODB_URI'),
  }),
  inject: [ConfigService],
})
```

---

## Caching — `@nestjs/cache-manager`

### Setup

```bash
npm install @nestjs/cache-manager cache-manager
```

### Basic Usage

```typescript
@Module({
  imports: [CacheModule.register({ ttl: 5000, isGlobal: true })],
})
export class AppModule {}
```

### Manual Cache Access

```typescript
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

async findAll() {
  const cached = await this.cacheManager.get<string[]>('cats');
  if (cached) return cached;
  const cats = await this.catsService.findAll();
  await this.cacheManager.set('cats', cats, 5000);
  return cats;
}
```

### Auto-Caching Responses

```typescript
@Controller()
@UseInterceptors(CacheInterceptor)  // caches GET /cats by route path
export class CatsController {}
```

### Redis Store

```bash
npm install @keyv/redis
```

```typescript
CacheModule.registerAsync({
  useFactory: () => ({
    stores: [new KeyvRedis('redis://localhost:6379')],
  }),
})
```

### CacheKey and CacheTTL Decorators

Override the cache key and TTL per endpoint:

```typescript
@Controller()
@CacheTTL(50)                    // Default TTL for all routes in this controller
export class AppController {
  @CacheKey('custom_key')         // Override cache key
  @CacheTTL(20)                  // Override TTL for this method only
  @UseInterceptors(CacheInterceptor)
  @Get()
  findAll(): string[] { return []; }
}
```

> Method-level `@CacheTTL` takes priority over controller-level `@CacheTTL`. `ttl: 0` means no expiration.

---

## Serialization — Excluding & Transforming Responses

### Problem: Never return entities directly

Never return raw database entities from controllers — they may expose internal fields. Use DTOs or class-transformer serialization.

### Using `class-transformer`

```typescript
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  @Transform(({ value }) => value?.toISOString())
  createdAt: Date;

  @Exclude()
  passwordHash: string;  // Never exposed
}
```

### Programmatic Transformation

```typescript
import { plainToInstance } from 'class-transformer';

const dto = plainToInstance(UserResponseDto, userEntity);
return dto;  // Nest serializes this to JSON
```

### Best Practice

Always define explicit response DTOs (classes, not interfaces) and return those from controllers. This ensures:
1. Only intended fields are exposed
2. Dates, nested objects, and sensitive fields are controlled
3. OpenAPI schemas (via `@nestjs/swagger`) generate correctly

---

## Best Practices

1. **Always validate `.env` at startup** — use Joi schema or class-validator; don't let bad envs crash at runtime
2. **Never `synchronize: true` in production** — use TypeORM migrations instead
3. **Use `autoLoadEntities: true`** — entities registered in `forFeature()` are auto-loaded; avoids forgetting to add entities to `forRoot()`
4. **Use namespaced config** (`registerAs()`) for logically grouped settings — keep `ConfigService.get()` calls typed
5. **Cache read-heavy endpoints** — use `CacheInterceptor` on GET routes; not for write-heavy operations
6. **Return DTOs, not entities** — never let raw ORM models escape the service layer; always transform via DTOs
7. **Use transactions** — wrap multi-step DB writes in a transaction; use `QueryRunner` for full control
