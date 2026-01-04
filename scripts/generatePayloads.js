#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const OUT = "payloads";

const dirs = [
  "valid-small",
  "valid-medium",
  "valid-large",
  "duplicates",
  "invalid",
  "poison"
];

dirs.forEach(d =>
  fs.mkdirSync(path.join(OUT, d), { recursive: true })
);

// helpers
const nowISO = () => new Date().toISOString();

const rand = (n = 8) =>
  Math.random().toString(36).slice(2, 2 + n);

const randomProps = (bytes) => {
  // generate approx-sized JSON object
  const obj = {};
  let size = 0;

  while (size < bytes) {
    const key = `k_${rand(6)}`;
    const val = rand(20);

    obj[key] = val;
    size = Buffer.byteLength(JSON.stringify(obj));
  }

  return obj;
};

const eventBase = () => ({
  id: randomUUID(),
  name: "click",
  occurredAt: nowISO(),
  properties: { user: randomUUID(), value: Math.random() }
});

const write = (dir, name, objOrString) => {
  const fp = path.join(OUT, dir, name);
  fs.writeFileSync(fp, typeof objOrString === "string"
    ? objOrString
    : JSON.stringify(objOrString, null, 2)
  );
};

// -------------------
// VALID SMALL (~0.5–2 KB)
// -------------------
for (let i = 0; i < 50; i++) {
  const e = {
    ...eventBase(),
    properties: {
      ...eventBase().properties,
      session: rand(12),
      page: `/page/${rand(4)}`
    }
  };

  write("valid-small", `event-small-${i}.json`, e);
}

// -------------------
// VALID MEDIUM (~5–10 KB)
// -------------------
for (let i = 0; i < 30; i++) {
  const e = {
    ...eventBase(),
    properties: {
      ...eventBase().properties,
      meta: randomProps(6 * 1024)
    }
  };

  write("valid-medium", `event-medium-${i}.json`, e);
}

// -------------------
// VALID LARGE (~25–50 KB) realistic max
// -------------------
for (let i = 0; i < 20; i++) {
  const e = {
    ...eventBase(),
    properties: {
      ...eventBase().properties,
      payload: randomProps(30 * 1024)
    }
  };

  write("valid-large", `event-large-${i}.json`, e);
}

// -------------------
// DUPLICATES
// same id + replayed timestamps
// -------------------
for (let i = 0; i < 10; i++) {
  const base = eventBase();

  const dup1 = { ...base };
  const dup2 = { ...base, occurredAt: nowISO() };

  write("duplicates", `dup-${i}-a.json`, dup1);
  write("duplicates", `dup-${i}-b.json`, dup2);
}

// -------------------
// INVALID PAYLOADS
// -------------------

// missing fields
write("invalid", "missing-name.json", {
  id: randomUUID(),
  occurredAt: nowISO(),
  properties: {}
});

// invalid timestamp
write("invalid", "bad-timestamp.json", {
  ...eventBase(),
  occurredAt: "not-a-timestamp"
});

// wrong types
write("invalid", "wrong-types.json", {
  id: 123,
  name: 456,
  occurredAt: 789,
  properties: "lol"
});

// truncated json
write("invalid", "truncated.json", "{ \"id\": \"abc");

// random garbage
write("invalid", "garbage.txt", "this is not json");

// -------------------
// POISON EVENTS (heavy CPU / huge nesting)
// -------------------
const deepNested = depth => {
  let obj = "x";
  for (let i = 0; i < depth; i++) obj = { wrap: obj };
  return obj;
};

write("poison", "deep-nested.json", {
  ...eventBase(),
  properties: deepNested(3000)
});

write("poison", "wide-object.json", {
  ...eventBase(),
  properties: randomProps(80 * 1024) // ~80KB
});

console.log("Payload set generated under ./payloads");
