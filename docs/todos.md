# Event Ingestion ToDos

<sub>January 29, 2026</sub>

- [ ] create alerts
- [ ] refactor observability/metrics.js
- [ ] Create final dashboards
  - [ ] Is the system alive
  - [ ] Is it keeping up
  - [ ] Is it healthy
  - [ ] Is it degrading
  - [ ] can we trust it
- [ ] create timed query wrapper for target p95 db queries eg. claim for processing
- [ ] introduce metrics for target query performance
- [ ] commit created final dashboards as json
- [ ] introduce kafka as a buffer layer
- [ ] validate horizontal scaling using kubernetis and document the experiment
- [ ] Refactor whole code for better reading
- [ ] Refine the documents for showcase


<sub>January 25, 2026</sub>

- [x] Enforce Dead Letter for failed events
- [x] Replay failed events