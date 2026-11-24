# All sessions, signatures and bodies come from ignored disposable fixtures.
GET {{baseUrl}}/api/admin/mobocom-pay/bale-status
HTTP 401

GET {{baseUrl}}/api/admin/mobocom-pay/bale-status
Cookie: __Secure-next-auth.session-token={{deniedCookie}}
HTTP 403

GET {{baseUrl}}/api/admin/mobocom-pay/bale-status
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.collectionReady" exists
jsonpath "$.data.events.items[0].payloadHash" not exists
jsonpath "$.data.events.items[0].sourceAccountId" not exists

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: {{signature}}
X-GoOmni-Event-Id: {{eventId}}
file,{{bodyFile}};
HTTP 200
[Asserts]
jsonpath "$.data.status" == "ORIGINAL_TRANSFER"
jsonpath "$.data.financialApproval" == false
jsonpath "$.data.duplicate" == false
jsonpath "$.data.paymentId" not exists

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: {{signature}}
X-GoOmni-Event-Id: {{eventId}}
file,{{bodyFile}};
HTTP 200
[Asserts]
jsonpath "$.data.duplicate" == true

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000
X-GoOmni-Event-Id: {{eventId}}
file,{{bodyFile}};
HTTP 401

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: {{baseUrl}}
Content-Type: application/json
X-Hub-Signature-256: {{wrongPeerSignature}}
X-GoOmni-Event-Id: {{eventId}}
file,{{wrongPeerBodyFile}};
HTTP 422

POST {{baseUrl}}/api/payment/mobocom-pay/bale-events
Origin: https://foreign.invalid
Content-Type: application/json
X-Hub-Signature-256: {{signature}}
X-GoOmni-Event-Id: {{eventId}}
file,{{bodyFile}};
HTTP 403
