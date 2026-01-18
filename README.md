# Events Ingestion Pipeline

**The uncomfortable truth about ingestion systems**: An ingestion pipeline exists only to feed consumers.

Without consumers:
- You can prove correctness
- You can prove durability
- You can prove scalability
  
But you cannot prove value.

So downstream consumers are not optional forever.
They are deferred, not ignored.

## Motive of the projects
This projects will evolve over the time current motive is proving my ability to build and design a system.

This system include ingestion pipeline where the Node can shine so chose this and do the ingestion part only. once I ready to build the Consumers with other suitable framework I will implement the consumer services

## What are the tradeoffs made over the time of implementation
- Chosen event_staging table as a buffer instead of message queues to prove correctness over the throughput