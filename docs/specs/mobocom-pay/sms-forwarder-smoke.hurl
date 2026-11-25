# Disposable FORWARDER_V1 source; body files contain synthetic credentials only.
POST {{baseUrl}}/api/payment/mobocom-pay/sms-forwarder/{{sourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.received" == true
jsonpath "$.data.financialApproval" == false
jsonpath "$.data.duplicate" == false

POST {{baseUrl}}/api/payment/mobocom-pay/sms-forwarder/{{sourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 200
[Asserts]
jsonpath "$.data.duplicate" == true

POST {{baseUrl}}/api/payment/mobocom-pay/sms-forwarder/{{sourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
file,{{wrongBankBodyFile}};
HTTP 403

POST {{baseUrl}}/api/payment/mobocom-pay/sms-forwarder/{{sourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
file,{{wrongTokenBodyFile}};
HTTP 401

POST {{baseUrl}}/api/payment/mobocom-pay/sms-forwarder/{{sourceId}}
Origin: https://foreign.invalid
Content-Type: application/json
file,{{smsBodyFile}};
HTTP 403

POST {{baseUrl}}/api/payment/mobocom-pay/sms-forwarder/{{sourceId}}
Origin: {{baseUrl}}
Content-Type: application/json
{"sms":"invalid","bank":"bankmeli","token":"invalid","extra":true}
HTTP 422
