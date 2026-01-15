
import { monitorEventLoopDelay } from 'perf_hooks';

export function startMetrics(label, delay=500, printGap = 10) {
  // const h = monitorEventLoopDelay({ resolution: 20 });
  // h.enable();
  // let count = 0

  // const interval = setInterval(() => {
  //   const m = process.memoryUsage();
  //   if(count++ >= printGap) {
  //     console.log()
  //     count = 0
  //   }
  //   console.log(label, {
  //     rssMB: Math.round(m.rss / 1024 / 1024),
  //     heapMB: Math.round(m.heapUsed / 1024 / 1024),
  //     lagMS: Math.round(h.mean / 1e6),
  //   });
  // }, delay);

  // return () => {
  //   clearInterval(interval);
  //   h.disable();
  // };
}
