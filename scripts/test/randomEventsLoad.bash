for i in {1..10000}; do
  curl -s -X POST http://localhost:3000/ingest \
    -H "Content-Type: application/json" \
    -d '{
      "id": "'$(uuidgen)'",
      "name": "click",
      "occurred_at": "'$(date -Iseconds)'",
      "properties": { "value": '$i' }
    }' &
done
wait
