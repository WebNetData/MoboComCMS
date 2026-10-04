# Use a currently public product with history enabled. Connected fixtures exercise hidden/variant boundaries separately.
GET {{base}}/api/products/{{slug}}/tabs?tab=price-history
HTTP 200
[Asserts]
jsonpath "$.variantId" == 0
jsonpath "$.items" isCollection
jsonpath "$.days" >= 30
jsonpath "$.days" <= 730
jsonpath "$.truncated" isBoolean

GET {{base}}/api/products/{{slug}}/tabs?tab=price-history&variantId=-1
HTTP 404
