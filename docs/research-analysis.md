# Event Stream Research & Analysis

## Executive Summary

The event stream module should prioritize TypeScript-native solutions with excellent performance characteristics, flexible deployment options, and strong integration capabilities. Redis Streams emerges as the optimal choice for most use cases, with Apache Pulsar for enterprise-scale requirements and EventStore for event sourcing patterns.

## Recommended Technology Stack

### 🚀 Primary Solution: Redis Streams
**Why:** In-memory performance, familiar Redis ecosystem, excellent TypeScript support, and cost-effective scalability.

- **Documentation**: https://redis.io/docs/data-types/streams/
- **Node.js Client**: https://github.com/redis/node-redis
- **Key Features**:
  - Sub-millisecond latency for real-time applications
  - Append-only data structure ideal for event streaming
  - Consumer groups for scalable event processing
  - Rich data structures (Hashes, Sets, Lists) for state management
  - Perfect for AI applications requiring low-latency responses

### ⚡ Enterprise Scale: Apache Pulsar
**Why:** Built for infinite storage, multi-tenancy, and geo-distribution with excellent cost optimization.

- **Website**: https://pulsar.apache.org/
- **TypeScript Client**: https://github.com/apache/pulsar-client-node
- **Key Features**:
  - Tiered storage (hot data in memory, cold data in S3)
  - Built-in multi-tenancy and geo-replication
  - Unified messaging (both streaming and queuing)
  - Infinite, cost-effective storage
  - Superior for merging batch and streaming pipelines

### 🎯 Event Sourcing: EventStore
**Why:** Purpose-built for CQRS/Event Sourcing with strong consistency guarantees.

- **Website**: https://www.eventstore.com/
- **TypeScript Client**: https://github.com/EventStore/EventStore-Client-NodeJS
- **Key Features**:
  - Quorum-based replication for strong consistency
  - Built-in event projections and transformations
  - Optimized for event sourcing patterns
  - Advanced subscription and catch-up mechanisms

## Architecture Patterns

### Event Stream Processing
```typescript
// Redis Streams Implementation
interface StreamEvent {
  id: string;
  timestamp: number;
  type: string;
  source: string;
  data: Record<string, any>;
  metadata?: {
    correlationId?: string;
    causationId?: string;
    userId?: string;
  };
}

class RedisEventStream {
  constructor(private client: RedisClient) {}

  async publish(streamName: string, event: StreamEvent): Promise<string> {
    return await this.client.xAdd(streamName, '*', {
      type: event.type,
      source: event.source,
      data: JSON.stringify(event.data),
      metadata: JSON.stringify(event.metadata || {})
    });
  }

  async subscribe(
    streamName: string, 
    consumerGroup: string,
    handler: (event: StreamEvent) => Promise<void>
  ): Promise<void> {
    // Consumer group implementation with error handling
    while (true) {
      try {
        const messages = await this.client.xReadGroup(
          consumerGroup, 
          'consumer-' + process.pid,
          { key: streamName, id: '>' },
          { COUNT: 100, BLOCK: 1000 }
        );
        
        for (const message of messages) {
          await handler(this.parseEvent(message));
          await this.client.xAck(streamName, consumerGroup, message.id);
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}
```

### Event Sourcing Pattern (EventStore)
```typescript
// Event Sourcing with strong typing
interface DomainEvent {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: any;
  metadata?: any;
  eventVersion: number;
}

class EventSourcingStore {
  async appendToStream(
    streamName: string, 
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void> {
    // Atomic append with concurrency control
  }

  async readFromStream(
    streamName: string,
    fromVersion: number = 0
  ): Promise<DomainEvent[]> {
    // Read events for aggregate reconstruction
  }

  async subscribeToAll(
    handler: (event: DomainEvent) => Promise<void>,
    options: { fromPosition?: string; filter?: string }
  ): Promise<void> {
    // Global event subscription for projections
  }
}
```

### Multi-Stream Orchestration
```typescript
// Distributed event processing
interface StreamProcessor {
  name: string;
  inputStreams: string[];
  outputStreams: string[];
  processor: (events: StreamEvent[]) => Promise<StreamEvent[]>;
  config: {
    batchSize: number;
    timeout: number;
    retryPolicy: RetryPolicy;
  };
}

class EventStreamOrchestrator {
  private processors: Map<string, StreamProcessor> = new Map();

  async registerProcessor(processor: StreamProcessor): Promise<void> {
    this.processors.set(processor.name, processor);
    await this.startProcessor(processor);
  }

  private async startProcessor(processor: StreamProcessor): Promise<void> {
    // Multi-stream fan-in/fan-out processing
    // Error handling and dead letter queues
    // Metrics and observability
  }
}
```

## Performance & Scalability Considerations

### Redis Streams Performance
- **Latency**: Sub-millisecond for in-memory operations
- **Throughput**: 100K+ events/second per instance
- **Scaling**: Horizontal with Redis Cluster
- **Memory Management**: TTL-based cleanup for stream entries

### Apache Pulsar Advantages
- **Storage**: Infinite with automatic S3 offloading
- **Geo-Distribution**: Built-in cross-region replication
- **Multi-Tenancy**: Isolated namespaces and resource quotas
- **Cost Optimization**: 10x cheaper than Confluent for similar workloads

### EventStore Benefits
- **Consistency**: ACID transactions with quorum consensus
- **Projections**: Built-in stream transformations
- **Subscriptions**: Catch-up and live subscriptions
- **Clustering**: Master-slave replication

## Integration Patterns

### Microservices Communication
```typescript
// Event-driven microservice integration
interface ServiceEvent {
  service: string;
  action: string;
  entityId: string;
  data: any;
  timestamp: number;
}

class EventDrivenService {
  async publishEvent(event: ServiceEvent): Promise<void> {
    // Publish to service-specific stream
    await this.eventStream.publish(`service.${event.service}`, {
      id: crypto.randomUUID(),
      type: event.action,
      source: event.service,
      data: event.data,
      timestamp: event.timestamp
    });
  }

  async subscribeToEvents(
    servicePattern: string,
    handler: (event: ServiceEvent) => Promise<void>
  ): Promise<void> {
    // Subscribe to multiple service streams
  }
}
```

### API Integration & Webhooks
```typescript
// External system integration
class WebhookEventBridge {
  async receiveWebhook(source: string, payload: any): Promise<void> {
    const event: StreamEvent = {
      id: crypto.randomUUID(),
      type: 'webhook.received',
      source,
      data: payload,
      timestamp: Date.now()
    };
    
    await this.eventStream.publish('webhooks.incoming', event);
  }

  async forwardToWebhook(
    targetUrl: string,
    event: StreamEvent
  ): Promise<void> {
    // Reliable webhook delivery with retries
  }
}
```

## Monitoring & Observability

### Stream Health Metrics
```typescript
interface StreamMetrics {
  streamName: string;
  messageCount: number;
  consumerLag: number;
  throughputPerSecond: number;
  errorRate: number;
  lastMessageTimestamp: number;
}

class StreamMonitoring {
  async getStreamHealth(streamName: string): Promise<StreamMetrics> {
    // Real-time stream health monitoring
  }

  async alertOnLag(streamName: string, maxLag: number): Promise<void> {
    // Automated alerting for consumer lag
  }
}
```

## Implementation Roadmap

### Phase 1: Core Streaming Infrastructure
1. Set up Redis Streams with TypeScript client
2. Implement basic publish/subscribe patterns
3. Create consumer groups for scalable processing
4. Add monitoring and health checks

### Phase 2: Event Processing Patterns
1. Build event routing and filtering
2. Implement dead letter queues
3. Add retry policies and error handling
4. Create stream-to-stream transformations

### Phase 3: Enterprise Features
1. Add Apache Pulsar for high-volume streams
2. Implement event sourcing with EventStore
3. Build cross-stream correlation
4. Add compliance and audit logging

### Phase 4: AI & Real-Time Features
1. Integrate with AI/ML processing pipelines
2. Build real-time analytics and dashboards
3. Add predictive alerting
4. Implement adaptive scaling

## Current UI Learnings

The SPA evolved through a few visual prototypes, and the stable features include:

- **Multi-table Supabase connectivity** – the app now supports connecting to multiple tables (`staff_room_events`, `temp_events`, `events`, `trello_events`) via a source selector modal.
- **FIFO Queue Processing** – events are fetched in ascending timestamp order (oldest first) and tracked in localStorage to prevent re-processing.
- **Source → Gate → Drain** – the conceptual layout works even without complex animation, so it is preserved as the core metaphor.
- **Authentication + state controls** – the mock API key flow, plus the login/logout buttons, act as the minimal UX layer.
- **Consumption rate slider** – still controls how often new rows are polled from the database.

### Anti-Patterns to Remember

- **Overly complex animation phases** – layering multiple timeouts and CSS keyframes caused pills to appear mid-stream (not tied to the source) and made debugging impossible.
- **Wide, descriptive pills** – letting the event pill span the entire rail meant it never seemed to move; reducing it to initials and the same width as source/drain solved that.
- **Gate pulses throttled by animation delays** – the gate should reflect processing state from the AI agent, but the pulsing animation introduced race conditions with the mock queue.
- **Autonomous clean-up timers** – previous implementations removed pills while others were still queued; the current flow simply replaces the latest pill, so more sophisticated sequencing should be deferred until we have real processing signals.

Documenting these decisions keeps the next iteration focused on the working pieces.

### FIFO Queue Implementation

The current implementation uses localStorage to track processed events in a FIFO (first-in, first-out) manner:

#### Key Features
1. **Event Tracking**: Each processed event is tracked using a composite key: `${tableName}:${rawId}`
2. **Oldest-First Fetching**: Events are fetched in ascending timestamp order from the database
3. **Deduplication**: Before adding a new event, the app checks if it's already been processed
4. **Persistent State**: Processed event IDs are stored in localStorage and survive page refreshes
5. **Multi-Table Support**: Each table maintains its own processing cursor via the composite key

#### Implementation Details
```typescript
// Local storage key for tracking processed events
const PROCESSED_EVENTS_KEY = "ms-processed-events";

// In-memory set for fast lookups
let processedEventIds: Set<string> = new Set();

// Load from localStorage on init
function loadProcessedEventIds() {
  const raw = localStorage.getItem(PROCESSED_EVENTS_KEY);
  if (raw) {
    processedEventIds = new Set(JSON.parse(raw));
  }
}

// Save to localStorage after processing each event
function saveProcessedEventIds() {
  localStorage.setItem(
    PROCESSED_EVENTS_KEY, 
    JSON.stringify(Array.from(processedEventIds))
  );
}

// FIFO fetch: oldest unprocessed events first
async function fetchFromSupabase(limit: number, tableName: string) {
  // Fetch in ASC order (oldest first)
  const response = await fetch(
    `...?order=${timestampColumn}.asc&limit=${limit}`
  );
  
  // Filter out already-processed events
  const unprocessed = data.filter((row: any) => {
    const eventKey = `${tableName}:${row.id}`;
    return !processedEventIds.has(eventKey);
  });
  
  return unprocessed;
}
```

#### User Controls
- **Clear History**: Users can clear all processed event tracking via the source selector modal
- **Table Switching**: Switching tables automatically loads the correct subset of processed IDs
- **Visual Feedback**: The modal shows how many events have been processed

This approach ensures that events are consumed in order and never processed twice, making it suitable for workflow automation where each event represents a task that should be executed exactly once.

## Key Dependencies

```json
{
  "dependencies": {
    "redis": "^4.6.0",
    "@redis/time-series": "^1.0.0",
    "@eventstore/db-client": "^6.0.0",
    "pulsar-client": "^1.9.0",
    "kafkajs": "^2.2.0",
    "@opentelemetry/api": "^1.7.0",
    "prom-client": "^15.1.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/redis": "^4.0.0",
    "jest": "^29.0.0"
  }
}
```

## Resources & References

### Redis Streams
- [Redis Streams Documentation](https://redis.io/docs/data-types/streams/)
- [Event Sourcing with Redis](https://dev.to/pdambrauskas/event-sourcing-with-redis-45ha)
- [Redis as Event Store](https://redis.io/blog/use-redis-event-store-communication-microservices/)

### Apache Pulsar
- [Pulsar TypeScript Client](https://pulsar.apache.org/docs/client-libraries-node/)
- [Kafka to Pulsar Migration](https://streamsql.io/blog/from-apache-kafka-to-apache-pulsar)
- [Pulsar vs Kafka Comparison](https://github.com/AutoMQ/automq/wiki/Top-12-Kafka-Alternative-2025-Pros-&-Cons)

### EventStore
- [EventStore Documentation](https://developers.eventstore.com/)
- [Event Sourcing Patterns](https://www.eventstore.com/blog/what-is-event-sourcing)
- [CQRS with EventStore](https://github.com/adrai/node-eventstore)

### Alternative Solutions
- [Apache Kafka Alternatives](https://hevodata.com/learn/kafka-alternatives/)
- [Message Queue Performance Comparison](https://softwaremill.com/mqperf/)
- [Streaming Frameworks Comparison](https://estuary.dev/blog/stream-processing-framework/)

## Market Trends 2025

1. **Cost Optimization**: Alternatives offering 90% cost savings vs. enterprise solutions
2. **AI Integration**: Streaming platforms optimized for ML/AI workloads
3. **Edge Processing**: Distributed streaming for IoT and edge computing
4. **Real-Time Analytics**: Sub-second analytics on streaming data
5. **Multi-Cloud**: Vendor-agnostic streaming across cloud providers

The event stream module should provide the real-time backbone for MarketSense, enabling responsive, scalable, and cost-effective event-driven architecture that supports both current needs and future AI-enhanced capabilities.