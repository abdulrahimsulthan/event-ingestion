import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "ingestion-worker",
  brokers: ["localhost:9092"],
});

const consumer = kafka.consumer({
  groupId: "ingestion-workers",
});

async function run() {
  await consumer.connect();
  await consumer.subscribe({
    topic: "events_ingest_v1",
    fromBeginning: true,
  });

  await consumer.run({
    autoCommit: false, // IMPORTANT
    eachMessage: async ({ topic, partition, message }) => {
      const key = message.key.toString();
      const value = message.value.toString();

      console.log("RECEIVED EVENT");
      console.log({
        topic,
        partition,
        offset: message.offset,
        key,
        value,
      });

      // simulate DB transaction
      // BEGIN
      // insert into events_staging
      // promote to events
      // COMMIT

      // commit offset ONLY after success
      await consumer.commitOffsets([
        {
          topic,
          partition,
          offset: (Number(message.offset) + 1).toString(),
        },
      ]);
    },
  });
}

run().catch((e) => {
  console.error("Consumer failed", e);
  process.exit(1);
});
