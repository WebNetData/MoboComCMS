# Use only synthetic source/body/credential variables from a disposable fixture.
POST {{baseUrl}}/api/payment/mobocom-pay/sms/{{sourceId}}
Authorization: Bearer {{sourceSecret}}
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.received" == true
jsonpath "$.data.financialApproval" == false
jsonpath "$.data.duplicate" == false

POST {{baseUrl}}/api/payment/mobocom-pay/sms/{{sourceId}}
Authorization: Bearer {{sourceSecret}}
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 200
[Asserts]
jsonpath "$.data.duplicate" == true

POST {{baseUrl}}/api/payment/mobocom-pay/sms/{{sourceId}}
Authorization: Bearer invalid
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 401

POST {{baseUrl}}/api/payment/mobocom-pay/sms/{{sourceId}}
Origin: https://foreign.invalid
Authorization: Bearer {{sourceSecret}}
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 403

POST {{baseUrl}}/api/payment/mobocom-pay/sms/{{sourceId}}
Authorization: Bearer {{sourceSecret}}
Content-Type: application/json
{"message_id":"bad","message_id":"duplicate"}
HTTP 422
