const QUEUE_LIMIT = 500000

export const queue = []

export const enqueue = (event) => {
  if (queue.length > QUEUE_LIMIT) {
    console.log('queue full')
    return false
  }
  queue.push(event) // push it to back side append it
  return true
}

export const takeBatch = (count) => queue.splice(0,count) // drain queue from frontside 