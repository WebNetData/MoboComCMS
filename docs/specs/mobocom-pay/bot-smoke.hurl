# Disposable configured merchant only; secrets belong in an ignored variables file.
POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10000,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase"}
HTTP 200
[Asserts]
jsonpath "$.url" == "{{checkoutUrl}}"
jsonpath "$.data" not exists

# String and numeric customer IDs return the same obligation, including after financial settlement.
POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10000,"order_id":"{{orderId}}","user_id":"123456789","type":"purchase"}
HTTP 200
[Asserts]
jsonpath "$.url" == "{{checkoutUrl}}"

POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10001,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase"}
HTTP 409
[Asserts]
jsonpath "$.ok" == false
jsonpath "$.message" isString

POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"invalid","amount":10000,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase"}
HTTP 401
[Asserts]
jsonpath "$.ok" == false
jsonpath "$.message" isString

POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10000.5,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase"}
HTTP 422
[Asserts]
jsonpath "$.ok" == false
jsonpath "$.message" isString

GET {{baseUrl}}/api/pay/checkout/{{paymentId}}
HTTP 200
[Asserts]
jsonpath "$.data.verification.verified" == false
jsonpath "$.data.botDelivery" not exists
jsonpath "$.data.bank" == null

GET {{baseUrl}}/api/pay/bot-integrations
HTTP 401

POST {{baseUrl}}/api/pay/bot-deliveries
Origin: {{baseUrl}}
Content-Type: application/json
{}
HTTP 401
