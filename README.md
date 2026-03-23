# nestjs-skills

> Comprehensive NestJS Claude Code skill suite — production-ready patterns, best practices, and full API coverage for every NestJS feature.

## What is this?

`nestjs-skills` is a drop-in skill suite for [Claude Code](https://claude.ai/code) that transforms Claude into a senior NestJS developer. It covers every major NestJS feature with production-ready patterns and best practices, extracted from the official documentation.

## Skills Included

| File | Coverage |
|---|---|
| `01-first-steps.md` | CLI setup, NestFactory, bootstrap, platforms |
| `02-controllers.md` | Routing, HTTP decorators, DTOs, CRUD |
| `03-providers.md` | DI, constructor injection, scope |
| `04-modules.md` | Feature modules, `isGlobal`, AppModule |
| `05-middleware.md` | Functional vs class middleware, MiddlewareConsumer |
| `06-exception-filters.md` | HttpException, `@Catch()`, global filters |
| `07-pipes.md` | Built-in pipes, ValidationPipe, Zod |
| `08-guards.md` | AuthGuard, RolesGuard, Reflector, RBAC |
| `09-interceptors.md` | RxJS, logging, caching, timeout |
| `10-custom-decorators.md` | `createParamDecorator`, `applyDecorators` |
| `11-fundamentals.md` | Custom providers, dynamic modules, scopes, lifecycle |
| `12-testing.md` | Unit/e2e, mocking, Supertest |
| `13-techniques.md` | Config, HTTP client, TypeORM, Sequelize, Mongoose, caching |
| `14-advanced.md` | Security, Logger, Cookies, Compression, GraphQL, WebSockets, Docker, serverless, monorepo |
| `15-project-structure.md` | Feature-based, DDD, layered, flat/serverless, monorepo |
| `16-queues.md` | BullMQ, producers, consumers, job options, events |
| `SKILL.md` | Master index with routing table |

## Quick Start

```bash
# Install globally
npm install -g nestjs-skills

# Or use via npx (no install needed)
npx nestjs-skills init
```

That's it! Restart Claude Code and the skills are active.

## CLI Commands

```bash
# Initialize skills (copies to .claude/skills/nestjs/)
npx nestjs-skills init

# Overwrite existing skills
npx nestjs-skills init --force

# Initialize in a custom directory
npx nestjs-skills init ./path/to/.claude/skills

# List all available skills
npx nestjs-skills list

# Show help
npx nestjs-skills --help
```

## What You'll Get

After running `nestjs-skills init`, your project will have:

```
.claude/skills/nestjs/
├── SKILL.md                    # Master index
├── 01-first-steps.md
├── 02-controllers.md
├── 03-providers.md
├── 04-modules.md
├── 05-middleware.md
├── 06-exception-filters.md
├── 07-pipes.md
├── 08-guards.md
├── 09-interceptors.md
├── 10-custom-decorators.md
├── 11-fundamentals.md
├── 12-testing.md
├── 13-techniques.md
├── 14-advanced.md
├── 15-project-structure.md
└── 16-queues.md
```

## Publishing to npm

```bash
# 1. Update package.json with your info
#    - name (must be unique on npm)
#    - author, repository, bugs

# 2. Set executable permission
chmod +x bin/cli.js

# 3. Login to npm
npm login

# 4. Publish (public package)
npm publish --access public

# 5. Tag latest
git tag v1.0.0
git push origin v1.0.0
```

## File Structure

```
nestjs-skills/
├── bin/
│   └── cli.js           # CLI: init, list commands
├── skills/
│   └── *.md            # All 16 skill files
├── package.json
├── README.md
└── LICENSE
```

## Requirements

- Node.js >= 18.0.0
- [Claude Code](https://claude.ai/code) installed

## License

MIT
