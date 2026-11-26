# Disposable fixture. autoReceipt was already confirmed by a bank SMS.
POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: {{baseUrl}}
Content-Type: application/json
{}
HTTP 410
[Asserts]
jsonpath "$.code" == "PAY_SOURCE_RETIRED"

PATCH {{baseUrl}}/api/admin/mobocom-pay/receipts
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"id":{{autoReceipt}},"action":"approve"}
HTTP 200
[Asserts]
jsonpath "$.data.alreadyPaid" == true
jsonpath "$.data.confirmation.method" == "AUTO"
jsonpath "$.data.confirmation.source" == "SMS"

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
