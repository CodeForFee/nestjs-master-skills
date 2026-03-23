---
name: nestjs/queues
description: >
  BullMQ integration (@nestjs/bullmq), producers (@InjectQueue, queue.add()),
  consumers (@Processor, @Process), job options (priority, delay, attempts, repeat, backoff, lifo),
  event handling (@OnWorkerEvent, @OnQueueEvent), named Redis configurations,
  flow producers (parent-child job trees), queue management (pause/resume/clear).
disable-model-invocation: false
user-invocable: true
---

# Queues — BullMQ Integration

> **Senior developer context**: BullMQ is Nest's first-class job queue solution. Use it whenever you need to move work out of the HTTP request cycle — sending emails, processing uploads, generating reports, or anything with latency. Redis is the backing store; plan for Redis availability in your infrastructure.

---

## Setup

```bash
npm install @nestjs/bullmq bullmq
```

### Root Registration

```typescript
// app.module.ts
@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
      prefix: 'myapp',              // Prefix for all queue keys (optional)
      defaultJobOptions: {          // Applied to all jobs unless overridden
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
})
export class AppModule {}
```

**`forRoot()` options:**

| Option | Type | Purpose |
|---|---|---|
| `connection` | `ConnectionOptions` | Redis connection config |
| `prefix` | `string` | Key prefix for all queues |
| `defaultJobOptions` | `JobOpts` | Default applied to every job |
| `settings` | `AdvancedSettings` | BullMQ advanced settings |
| `extraOptions` | `object` | Extra options passed to Queue constructor |

---

## Registering Queues

```typescript
BullModule.registerQueue({ name: 'audio' });
BullModule.registerQueue({ name: 'thumbnail' });
```

- Each queue name is an injection token
- Multiple queues can be registered at once: `BullModule.registerQueue({ name: 'audio' }, { name: 'video' })`
- Override global defaults per queue:

```typescript
BullModule.registerQueue({
  name: 'audio',
  connection: { port: 6380 },   // Override Redis connection for this queue
});
```

### Named Configurations (Multiple Redis Instances)

```typescript
// Register multiple Redis configurations
BullModule.forRoot('alternative-redis', {
  connection: { host: 'redis-2', port: 6379 },
});

// Point queues to a named config
BullModule.registerQueue({
  name: 'video',
  configKey: 'alternative-redis',
});
```

---

## Producers

Producers enqueue jobs — typically services.

```typescript
@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}

  async transcode(fileId: string) {
    const job = await this.audioQueue.add(
      'transcode',          // Named job type
      { fileId, quality: 'high' },  // Job data (serializable)
      {
        priority: 1,         // 1 (highest) to MAX_INT (lowest)
        delay: 5000,         // ms before job becomes visible
        attempts: 3,         // Retry count on failure
        backoff: { type: 'exponential', delay: 2000 },
        lifo: false,         // false = FIFO, true = LIFO
        timeout: 30_000,     // ms; job fails if it exceeds this
        removeOnComplete: true,
        removeOnFail: false,  // Keep failed jobs for debugging
      },
    );
    return { jobId: job.id };
  }

  // Recurring job (cron)
  async scheduleDaily() {
    await this.audioQueue.add(
      'daily-report',
      { date: new Date().toISOString() },
      {
        repeat: { cron: '0 2 * * *' },  // Every day at 2am
        removeOnComplete: true,
      },
    );
  }
}
```

**Job options reference:**

| Option | Description |
|---|---|
| `priority` | 1 (highest) to `MAX_INT` (lowest) — performance impact, use sparingly |
| `delay` | Milliseconds before job becomes visible to workers |
| `attempts` | Total attempts before marking job as failed |
| `backoff` | `{ type: 'exponential' \| 'fixed', delay: ms }` |
| `lifo` | `true` = LIFO queue (last-in first-out) |
| `timeout` | Milliseconds; job fails if it exceeds this |
| `repeat` | `{ cron: string }` or `{ every: ms }` for recurring jobs |
| `removeOnComplete` | Remove from Redis once complete (`true` or count) |
| `removeOnFail` | Remove from Redis on failure (`true` or count) |

---

## Consumers

### Class-Based Consumer (Recommended)

```typescript
@Processor('audio')
export class AudioProcessor {
  @Process('transcode')       // Handle specific named job
  async handleTranscode(job: Job<{ fileId: string; quality: string }>) {
    const { fileId, quality } = job.data;

    // Progress reporting
    await job.updateProgress(25);
    await job.log('Starting transcode...');

    // Process
    const result = await this.transcodeService.run(fileId, quality);

    await job.updateProgress(100);
    return result;            // Return value stored in job result
  }

  // Handle ALL jobs (fallback if no @Process matches)
  async generalHandler(job: Job) {
    return job.data;
  }
}
```

### Named Job Consumers

```typescript
// Register separate handlers per job name
@Process('resize')
async handleResize(job: Job<{ width: number }>) { /* ... */ }

@Process('compress')
async handleCompress(job: Job<{ quality: number }>) { /* ... */ }
```

### Injecting Dependencies

```typescript
@Processor('audio')
export class AudioProcessor {
  constructor(
    private readonly storageService: StorageService,
    @InjectQueue('audio') private readonly audioQueue: Queue,  // Inject same queue
  ) {}

  // Access job progress, logs, and data
  async handleTranscode(job: Job) {
    const progress = job.progress;
    await job.log(`Processing ${job.data.fileId}`);
  }
}
```

---

## Event Handling

### Worker Events (`@OnWorkerEvent`)

```typescript
@Processor('audio')
export class AudioProcessor {
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed in ${job.finishedOn}ms`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any>, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(`Processing job ${job.id}, attempt ${job.attemptsMade}`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job) {
    console.log(`Job ${job.id} progress: ${job.progress}%`);
  }
}
```

**Other worker events:** `waiting`, `stalled`, `log`, `error`.

### Queue Event Listener Class

```typescript
@Injectable()
export class AudioQueueEvents {
  @OnQueueEvent('completed')
  handleJobCompleted({ jobId, prev }: JobsFilters) {
    this.analyticsService.record('job_completed', { jobId, duration: Date.now() - prev });
  }

  @OnQueueEvent('error')
  handleError({ error }: { error: Error }) {
    this.alertService.notify('QueueError', error.message);
  }

  @OnQueueEvent('failed')
  handleFailed({ jobId, failedReason }: { jobId: string; failedReason: string }) {
    this.alertService.notify('JobFailed', { jobId, reason: failedReason });
  }
}
```

```typescript
// Register listener on the queue
BullModule.registerQueue(
  { name: 'audio' },
  { listeners: [AudioQueueEvents] },
);
```

---

## Flow Producers (Parent-Child Job Trees)

BullMQ supports dependency trees — child jobs only start after parent completes:

```typescript
BullModule.registerFlowProducer({ name: 'flowProducerName' });

@Injectable()
export class VideoProcessingService {
  constructor(
    private readonly audioQueue: Queue,
    @InjectQueue('video') private videoQueue: Queue,
  ) {}

  async processVideo(videoId: string) {
    // Create parent job
    const parent = await this.videoQueue.add('process-video', { videoId });

    // Create child jobs (run after parent succeeds)
    await this.videoQueue.add('generate-audio', { videoId }, {
      parent: { id: parent.id, queue: this.videoQueue.name },
      children: [
        { name: 'transcribe', data: { videoId }, queue: 'audio' },
        { name: 'thumbnail', data: { videoId }, queue: 'video' },
      ],
    });
  }
}
```

---

## Queue Management

```typescript
@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}

  // Pause — stops processing but keeps jobs in queue
  async pause() { await this.audioQueue.pause(); }

  // Resume
  async resume() { await this.audioQueue.resume(); }

  // Clear all waiting/paused jobs
  async clear() { await this.audioQueue.clear(); }

  // Get counts by state
  async getStats() {
    return this.audioQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
  }

  // Remove specific jobs
  async removeJob(jobId: string) {
    await this.audioQueue.removeJobs(jobId);
  }

  // Get a specific job
  async getJob(jobId: string) {
    const job = await this.audioQueue.getJob(jobId);
    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}
```

**Job states:** `waiting`, `active`, `completed`, `failed`, `delayed`, `paused`.

---

## Module Structure

Separate producers and consumers into their own modules:

```typescript
// queues.module.ts — registers all queues
@Module({
  imports: [
    BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
    BullModule.registerQueue({ name: 'audio' }),
    BullModule.registerQueue({ name: 'thumbnail' }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}

// audio.module.ts — producer module
@Module({
  imports: [QueuesModule],
  providers: [AudioService],
})
export class AudioModule {}

// audio.processor.ts — consumer (register separately, can be in its own app)
@Processor('audio')
export class AudioProcessor { /* ... */ }
```

---

## Best Practices

1. **Always set `attempts` and `backoff`** — without them, failed jobs are silently lost
2. **Set `removeOnFail: false`** — failed jobs are your debugging data; remove them on a schedule, not immediately
3. **Separate producers from consumers** — producers can live in your API; consumers are best in a dedicated worker process
4. **Use named job types (`'transcode'`)** — always create separate `@Process()` handlers per name; unnamed handlers can't differentiate work
5. **Report progress with `job.updateProgress(n)`** — enables monitoring without querying Redis
6. **Use `lifo: false` (FIFO) for sequential dependencies** — LIFO is good for cache-warming, bad for ordered work
7. **Use cron `repeat` for recurring jobs** — not `setInterval`; repeat config is persisted across app restarts
8. **Use flow producers for multi-step pipelines** — parent-child trees ensure children only run after parent succeeds
9. **Keep job data small** — store file references (IDs/URLs), not file contents; Redis memory is limited
10. **Idempotent job handlers** — workers can retry; design handlers so re-running produces the same result
