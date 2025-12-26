const fs = require("fs");
const {v7: uuid} = require('uuid')
const FILE = process.argv[2];
const COUNT = Number(process.argv[3] || 1);

const stream = fs.createWriteStream(FILE);

const evt = {
  id: uuid(),
  name: "click",
  occurredAt: new Date().toISOString(),
  properties: {
    user: uuid(),
    value: Math.random(),
    payload: "x".repeat(1024 * 1024 * COUNT) // COUNT mb per event
  }
};

stream.write(JSON.stringify(evt));


stream.end(() => console.log("Done:", FILE));
