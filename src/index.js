require("dotenv").config();
const express = require("express");
const {v7: uuid } = require('uuid')
const { pool } = require("./db");

const app = express();
app.use(express.json());

app.get("/health", async (req, res) => {
  const result = await pool.query("SELECT 1");
  res.json({ status: "ok", db: result.rows[0] });
});

app.post('/ingest', async (req, res) => {
  try {
    const {name, occurredAt, properties } = req.body

    if(!name | !occurredAt)
      return res.status(400).json({error: "Invalid payload."})
  
    const id = uuid()

    console.log('payload: ', [id, name, occurredAt, properties])
    const data = await pool.query(`
      INSERT INTO events (id, name, occurred_at, properties) 
      VALUES ($1,$2,$3,$4) 
      RETURNING *
    `,[id, name, occurredAt, properties])
    res.status(200).json({data: data.rows})
  } catch (error) {
    console.log(error)
    res.status(500).json({error: "Something went wrong."})
  }
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
