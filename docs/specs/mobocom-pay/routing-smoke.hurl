# Disposable configured merchant, ordered rule and synthetic pending order only.
# Store cookies/keys in an ignored variables file. These are browser-session APIs.
POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10000,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase","payment_count":3,"membership_days":45}
HTTP 200
[Asserts]
jsonpath "$.links" count == 2
jsonpath "$.links[0].url" == "{{firstUrl}}"
jsonpath "$.links[1].url" == "{{secondUrl}}"
jsonpath "$.data" not exists

# Untrusted history changes do not replace the first routing snapshot.
POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10000,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase","payment_count":0,"membership_days":-1}
HTTP 200
[Asserts]
jsonpath "$.links[0].url" == "{{firstUrl}}"
jsonpath "$.links[1].url" == "{{secondUrl}}"

POST {{baseUrl}}/api/v1/pay/bot/{{integrationId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"api_key":"{{botCreateKey}}","amount":10001,"order_id":"{{orderId}}","user_id":123456789,"type":"purchase"}
HTTP 409
[Asserts]
jsonpath "$.ok" == false
jsonpath "$.message" isString

GET {{baseUrl}}/api/pay/checkout/{{paymentId}}
HTTP 200
[Asserts]
jsonpath "$.data.verification.verified" == false
jsonpath "$.data.bank" == null
jsonpath "$.data.gateways" count == 0
jsonpath "$.data.botDelivery" not exists

POST {{baseUrl}}/api/pay/checkout/{{paymentId}}/gateway
Origin: {{baseUrl}}
Content-Type: application/json
{"gatewayRef":"{{forbiddenGateway}}"}
HTTP 401

GET {{baseUrl}}/api/pay/bot-operations?page=2
Cookie: next-auth.session-token={{ownerCookie}}
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.page" == 2
jsonpath "$.data.total" >= 29

GET {{baseUrl}}/api/pay/bot-operations?q={{orderId}}
Cookie: next-auth.session-token={{ownerCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.items" count == 1
jsonpath "$.data.items[0].externalId" == "{{orderId}}"

GET {{baseUrl}}/api/pay/bot-operations?id={{deliveryId}}
Cookie: next-auth.session-token={{otherCookie}}
HTTP 404

GET {{baseUrl}}/api/pay/bot-operations
HTTP 401

POST {{baseUrl}}/api/pay/bot-routing
Origin: {{baseUrl}}
Content-Type: application/json
{}
HTTP 401
