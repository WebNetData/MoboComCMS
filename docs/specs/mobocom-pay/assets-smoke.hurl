# Owned disposable fixture only. Never use a live merchant key or bank source.
GET {{baseUrl}}/api/v2/pay/overview
Authorization: Bearer {{merchantKey}}
HTTP 200
[Asserts]
jsonpath "$.data.assetBalances[1].currency" == "USDT"

POST {{baseUrl}}/api/v2/pay/terminals
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
{"name":"Hurl standalone link","channelType":"PAYMENT_LINK"}
HTTP 201
[Captures]
terminalId: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.returnUrl" == ""
jsonpath "$.data.channelType" == "PAYMENT_LINK"

POST {{baseUrl}}/api/v2/pay/payments
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Idempotency-Key: {{paymentKey}}
Content-Type: application/json
{"terminalId":"{{terminalId}}","externalId":"{{orderId}}","amountRial":"12345678"}
HTTP 201
[Captures]
paymentId: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.creditCurrency" == "USDT"
jsonpath "$.data.creditAmount" == "12.34"

GET {{baseUrl}}/api/v2/pay/payments/{{paymentId}}
Authorization: Bearer {{merchantKey}}
HTTP 200
[Asserts]
jsonpath "$.data.id" == "{{paymentId}}"
jsonpath "$.data.status" == "PENDING"

GET {{baseUrl}}/api/pay/checkout/{{paymentId}}
HTTP 200
[Asserts]
jsonpath "$.data.purchase.amount" == "12.34"
jsonpath "$.data.purchase.accepted" == false
jsonpath "$.data.verification.verified" == false

POST {{baseUrl}}/api/pay/checkout/{{paymentId}}/gateway
Origin: {{baseUrl}}
Content-Type: application/json
{"gatewayRef":"db:1","acceptPurchase":true}
HTTP 401

GET {{baseUrl}}/api/v2/pay/payments/{{paymentId}}
HTTP 401

GET {{baseUrl}}/api/v1/pay/overview
Authorization: Bearer {{merchantKey}}
HTTP 200
[Asserts]
jsonpath "$.data.rails" count == 3

POST {{baseUrl}}/api/v1/pay/quotes
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
{"railId":"USDT_BSC","sourceCurrency":"USDT","amount":"1.00"}
HTTP 422
[Asserts]
jsonpath "$.code" == "PAY_API_V2_REQUIRED"

POST {{baseUrl}}/api/v2/pay/quotes
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Content-Type: application/json
{"railId":"USDT_BSC","sourceCurrency":"USDT","amount":"1.00"}
HTTP 201
[Captures]
quoteId: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.sourceCurrency" == "USDT"
jsonpath "$.data.sourceAmount" == "1.00"
jsonpath "$.data.feeAmount" == "0.11"
jsonpath "$.data.payoutAmount" == "0.89"

POST {{baseUrl}}/api/v2/pay/settlements
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Idempotency-Key: {{paymentKey}}-settlement
Content-Type: application/json
{"quoteId":"{{quoteId}}","destination":"0x1111111111111111111111111111111111111111","ackNetwork":false}
HTTP 422

POST {{baseUrl}}/api/v2/pay/settlements
Authorization: Bearer {{merchantKey}}
Origin: {{baseUrl}}
Idempotency-Key: {{paymentKey}}-settlement
Content-Type: application/json
{"quoteId":"{{quoteId}}","destination":"0x1111111111111111111111111111111111111111","ackNetwork":true}
HTTP 201
[Asserts]
jsonpath "$.data.sourceCurrency" == "USDT"
jsonpath "$.data.sourceAmount" == "1.00"
jsonpath "$.data.status" == "REQUESTED"
jsonpath "$.data.network" == "BSC"
