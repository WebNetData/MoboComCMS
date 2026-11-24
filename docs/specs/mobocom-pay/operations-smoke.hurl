# Same-process Admin session contract. Use only isolated synthetic fixtures.
GET {{baseUrl}}/api/admin/mobocom-pay/transfer-operations
HTTP 401

GET {{baseUrl}}/api/admin/mobocom-pay/transfer-operations
Cookie: __Secure-next-auth.session-token={{deniedCookie}}
HTTP 403

GET {{baseUrl}}/api/admin/mobocom-pay/transfer-operations
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.windowHours" == 24
jsonpath "$.data.sources[0].type" == "BALE"
jsonpath "$.data.sources[0].secretCiphertext" not exists
jsonpath "$.data.sources[0].sourceAccountId" not exists
jsonpath "$.data.pools" exists

GET {{baseUrl}}/api/admin/mobocom-pay/transfer-reviews
Cookie: __Secure-next-auth.session-token={{deniedCookie}}
HTTP 403

GET {{baseUrl}}/api/admin/mobocom-pay/transfer-reviews?closed=true
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.pages" exists
jsonpath "$.data.receiptsPages" exists

GET {{baseUrl}}/api/admin/mobocom-pay/transfer-reviews?id={{confirmedNotice}}
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "CONFIRMED"
jsonpath "$.data.collection.invoiceStatus" == "PAID"
jsonpath "$.data.canConfirm" == false
jsonpath "$.data.history[0].note" exists
jsonpath "$.data.notice.payloadHash" not exists

PATCH {{baseUrl}}/api/admin/mobocom-pay/transfer-reviews
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Content-Type: application/json
{"noticeId":"{{confirmedNotice}}","version":0,"action":"confirm","note":"synthetic retry"}
HTTP 403

PATCH {{baseUrl}}/api/admin/mobocom-pay/transfer-reviews
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Origin: https://foreign.invalid
Content-Type: application/json
{"noticeId":"{{confirmedNotice}}","version":0,"action":"confirm","note":"synthetic retry"}
HTTP 403

PATCH {{baseUrl}}/api/admin/mobocom-pay/transfer-reviews
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"noticeId":"{{confirmedNotice}}","version":0,"action":"confirm","note":"synthetic retry"}
HTTP 409
