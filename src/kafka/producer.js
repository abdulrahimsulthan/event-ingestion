import { Kafka } from 'kafkajs'

const kafka = new Kafka({
  clientId: 'ingestion-api',
  brokers: ['localhost:9092'],
})

export const producer = kafka.producer({
  allowAutoTopicCreation: false,
  idempotent: true,
  maxInFlightRequests: 1,
  retry: {
    retries: Number.MAX_SAFE_INTEGER
  }
})


let connected = false; // This is for singleton pattern

const init = async () => {
  if (!connected) {
    await producer.connect()
    connected = true
  }
}


export default init