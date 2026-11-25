# Disposable fixture only; source keys/sessions and signed body remain ignored.
GET {{baseUrl}}/api/admin/mobocom-pay/bale-status
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.sources" count == 2
jsonpath "$.data.sources[0].secret" not exists
jsonpath "$.data.sources[0].instanceId" not exists

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events?source={{sourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: {{signature}}
X-GoOmni-Event-Id: {{eventId}}
file,approval-body-private.json;
HTTP 200
[Asserts]
jsonpath "$.data.alreadyPaid" == true

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events?source={{otherSourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: {{signature}}
X-GoOmni-Event-Id: {{eventId}}
file,approval-body-private.json;
HTTP 401

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: {{signature}}
X-GoOmni-Event-Id: {{eventId}}
file,approval-body-private.json;
HTTP 503

PATCH {{baseUrl}}/api/admin/mobocom-pay/receipts
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"id":{{autoReceipt}},"action":"approve"}
HTTP 200
[Asserts]
jsonpath "$.data.alreadyPaid" == true
jsonpath "$.data.confirmation.method" == "AUTO"
jsonpath "$.data.confirmation.source" == "BALE"

PATCH {{baseUrl}}/api/admin/mobocom-pay/receipts
Cookie: __Secure-next-auth.session-token={{deniedCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"id":{{autoReceipt}},"action":"approve"}
HTTP 403

GET {{baseUrl}}/api/v1/pay/payments/{{heldPayment}}
Authorization: Bearer {{merchantKey}}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "PENDING"

GET {{baseUrl}}/api/v2/pay/payments/{{heldPayment}}
Authorization: Bearer {{merchantKey}}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "PENDING"
jsonpath "$.data.reviewStatus" == "UNDER_REVIEW"
