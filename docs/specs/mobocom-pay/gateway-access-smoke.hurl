# Disposable fixture: a ready gateway, an active merchant terminal and a second merchant.

GET {{baseUrl}}/api/v2/pay/terminals/{{terminalId}}/gateways
HTTP 401

GET {{baseUrl}}/api/v2/pay/terminals/{{terminalId}}/gateways?amountRial=20000
Authorization: Bearer {{merchantKey}}
HTTP 200
[Asserts]
header "Cache-Control" == "no-store"
jsonpath "$.data.currency" == "IRR"
jsonpath "$.data.terminalId" == "{{terminalId}}"
jsonpath "$.data.items[*].ref" contains "{{gatewayRef}}"
jsonpath "$.data.items[0].apiKey" not exists
jsonpath "$.data.items[0].instructions" not exists

GET {{baseUrl}}/api/v2/pay/terminals/{{terminalId}}/gateways
Authorization: Bearer {{otherKey}}
HTTP 404

GET {{baseUrl}}/api/v2/pay/terminals/{{terminalId}}/gateways?amountRial=0
Authorization: Bearer {{merchantKey}}
HTTP 422

POST {{baseUrl}}/api/v2/pay/payments
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
Idempotency-Key: {{paymentKey}}
{"terminalId":"{{terminalId}}","externalId":"{{orderId}}","amountRial":"20000","gatewayRef":"{{gatewayRef}}"}
HTTP 201
[Captures]
paymentId: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.status" == "PENDING"
jsonpath "$.data.requestedGatewayRef" == "{{gatewayRef}}"

POST {{baseUrl}}/api/v2/pay/payments
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
Idempotency-Key: {{paymentKey}}
{"terminalId":"{{terminalId}}","externalId":"{{orderId}}","amountRial":"20000","gatewayRef":"{{gatewayRef}}"}
HTTP 201
[Asserts]
jsonpath "$.data.id" == "{{paymentId}}"

POST {{baseUrl}}/api/v2/pay/payments
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
Idempotency-Key: {{paymentKey}}
{"terminalId":"{{terminalId}}","externalId":"{{orderId}}","amountRial":"20000","gatewayRef":"{{otherGatewayRef}}"}
HTTP 409
[Asserts]
jsonpath "$.code" == "IDEMPOTENCY_CONFLICT"

POST {{baseUrl}}/api/v1/pay/payments
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
Idempotency-Key: {{paymentKey}}-v1
{"terminalId":"{{terminalId}}","externalId":"{{orderId}}-v1","amountRial":"20000","gatewayRef":"{{gatewayRef}}"}
HTTP 422
[Asserts]
jsonpath "$.code" == "PAY_API_V2_REQUIRED"
