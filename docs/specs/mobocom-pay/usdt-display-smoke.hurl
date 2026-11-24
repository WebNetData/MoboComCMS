# Requires an ignored disposable ordinary checkout and a fresh synthetic approved USDT rate.
GET {{baseUrl}}/api/payment/mobocom-pay/collections/{{collectionId}}
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.usdt.asset" == "USDT"
jsonpath "$.data.usdt.network" == "BSC"
jsonpath "$.data.usdt.standard" == "BEP20"
jsonpath "$.data.usdt.displayOnly" == true
jsonpath "$.data.usdt.status" == "AVAILABLE"
jsonpath "$.data.usdt.amount" matches "^[0-9]+\\.[0-9]{4}$"
jsonpath "$.data.usdt.asOf" exists
