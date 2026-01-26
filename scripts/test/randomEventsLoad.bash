while (true); do
for i in {1..100}; do
  curl -s -X POST http://localhost:3000/ingest \
    -H "Content-Type: application/json" \
    -d '{
      "id": "'$(uuidgen)'",
      "name": "click",
      "occurred_at": "'$(date -Iseconds)'",
      "properties": { "value": '$i' }
    }' &
done
sleep 10
done

