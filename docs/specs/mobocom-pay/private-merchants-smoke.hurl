# Admin/session contract. Private synthetic credentials are supplied from an ignored fixture file.
GET {{baseUrl}}/api/admin/mobocom-pay/merchant-directory
HTTP 401

GET {{baseUrl}}/api/admin/mobocom-pay/merchant-directory
Cookie: __Secure-next-auth.session-token={{deniedCookie}}
HTTP 403

GET {{baseUrl}}/api/admin/mobocom-pay/merchant-directory
Cookie: __Secure-next-auth.session-token={{adminCookie}}
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
jsonpath "$.data.pages" exists
jsonpath "$.data.items[0].version" exists

GET {{baseUrl}}/api/pay/overview
Cookie: __Secure-next-auth.session-token={{ordinaryCookie}}
HTTP 403

POST {{baseUrl}}/api/pay/merchant
Cookie: __Secure-next-auth.session-token={{ordinaryCookie}}
Origin: {{baseUrl}}
Content-Type: application/json
{"name":"Synthetic denied","website":"https://merchant.invalid"}
HTTP 403
[Asserts]
jsonpath "$.code" == "PAY_ENROLLMENT_CLOSED"

PATCH {{baseUrl}}/api/admin/mobocom-pay/merchant-directory
Cookie: __Secure-next-auth.session-token={{adminCookie}}
Origin: https://foreign.invalid
Content-Type: application/json
{"id":"synthetic","version":0,"action":"status","status":"ACTIVE","note":"Synthetic denial"}
HTTP 403

GET {{baseUrl}}/pay/merchant
HTTP 200
[Asserts]
header "Cache-Control" contains "no-store"
header "X-Robots-Tag" contains "noindex"
