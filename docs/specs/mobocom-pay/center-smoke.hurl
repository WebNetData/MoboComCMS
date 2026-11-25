# Disposable synthetic merchant/Admin sessions only; never use production credentials.
GET {{baseUrl}}/api/pay/webhooks
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
HTTP 200
[Asserts]
jsonpath "$.ok" == true
jsonpath "$.data.endpoints[0].secretCiphertext" not exists
jsonpath "$.data.deliveries[0].secretCiphertext" not exists

GET {{baseUrl}}/api/pay/settlement-center
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.maxScheduleDays" == 30

GET {{baseUrl}}/api/admin/mobocom-pay/settlement-center?phase=scheduled
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.counts.scheduled" >= 1

GET {{baseUrl}}/api/admin/mobocom-pay/webhooks
Cookie: __Secure-next-auth.session-token={{deniedCookie}}
HTTP 403

GET {{baseUrl}}/api/admin/mobocom-pay/settlement-center
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
HTTP 403

GET {{baseUrl}}/api/pay/settlement-receipt?id={{settlementId}}
HTTP 401

GET {{baseUrl}}/api/pay/settlement-receipt?id={{settlementId}}
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "PAID"

GET {{baseUrl}}/api/pay/settlement-receipt?id={{settlementId}}&format=html
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
HTTP 200
[Asserts]
header "Content-Type" contains "text/html"
header "Content-Disposition" contains "attachment;"
header "Cache-Control" contains "no-store"
body contains "رسید ثبت انتقال وجه"

POST {{baseUrl}}/api/pay/webhook-deliveries
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"id":"{{deliveryId}}","version":0,"configVersion":1,"action":"redeliver","ackReplay":false}
HTTP 422

POST {{baseUrl}}/api/pay/webhooks
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
Origin: https://untrusted.invalid
Content-Type: application/json
{"terminalId":"{{terminalId}}","url":"https://127.0.0.1/private","active":true}
HTTP 403

POST {{baseUrl}}/api/pay/webhooks
Cookie: __Secure-next-auth.session-token={{merchantCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"terminalId":"{{terminalId}}","url":"https://127.0.0.1/private","active":true}
HTTP 422

POST {{baseUrl}}/api/admin/mobocom-pay/settlement-batches
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"action":"paid","items":[{"id":"{{settlementId}}","version":0}]}
HTTP 422
