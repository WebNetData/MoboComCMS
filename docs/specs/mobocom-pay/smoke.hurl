# Disposable fixture only: supply base_url, api_key, terminal_id, external_id and idempotency_key.
# A successful create does not confirm payment; fulfill only after a later GET reports PAID.
POST {{base_url}}/api/v1/pay/payments
Authorization: Bearer {{api_key}}
Origin: {{base_url}}
Content-Type: application/json
Idempotency-Key: {{idempotency_key}}
{
  "terminalId": "{{terminal_id}}",
  "externalId": "{{external_id}}",
  "amountRial": "100000"
}
HTTP 201
[Captures]
payment_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.ok" == true
jsonpath "$.data.amountRial" == "100000"

GET {{base_url}}/api/v1/pay/payments/{{payment_id}}
Authorization: Bearer {{api_key}}
HTTP 200
[Asserts]
jsonpath "$.ok" == true
jsonpath "$.data.id" == "{{payment_id}}"
jsonpath "$.data.status" matches "^(PENDING|PAID|EXPIRED)$"

POST {{base_url}}/api/v1/pay/payments
Authorization: Bearer {{api_key}}
Origin: {{base_url}}
Content-Type: application/json
Idempotency-Key: {{idempotency_key}}
{
  "terminalId": "{{terminal_id}}",
  "externalId": "{{external_id}}",
  "amountRial": "100000"
}
HTTP 201
[Asserts]
jsonpath "$.data.id" == "{{payment_id}}"

# A distinct active merchant cannot read this payment.
GET {{base_url}}/api/v1/pay/payments/{{payment_id}}
Authorization: Bearer {{foreign_api_key}}
HTTP 404
