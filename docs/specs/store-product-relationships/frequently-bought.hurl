# Run against owned public fixtures with rollout enabled and three qualifying buyers.
GET {{base_url}}/api/products/{{slug}}/tabs?tab=frequently-bought
HTTP 200
[Asserts]
jsonpath "$.items" count == 1
jsonpath "$.items[0].id" == {{target_id}}
jsonpath "$.items[0].slug" == "{{target_slug}}"
jsonpath "$.items[0].name" exists
jsonpath "$.items[0].nameEn" exists
jsonpath "$.items[0].image" exists
jsonpath "$.items[0].userId" not exists
jsonpath "$.items[0].orderId" not exists
jsonpath "$.items[0].buyers" not exists

GET {{base_url}}/api/products/{{slug}}-missing/tabs?tab=frequently-bought
HTTP 404

# Existing tabs remain available with their original response shapes.
GET {{base_url}}/api/products/{{slug}}/tabs?tab=description
HTTP 200
[Asserts]
jsonpath "$.htmlFa" exists
jsonpath "$.htmlEn" exists

GET {{base_url}}/api/products/{{slug}}/tabs?tab=related-products
HTTP 200
[Asserts]
jsonpath "$.items" exists
