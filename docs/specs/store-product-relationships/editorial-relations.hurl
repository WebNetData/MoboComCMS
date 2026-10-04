GET {{base_url}}/api/products/{{slug}}/tabs?tab=compatible-products
HTTP 200
[Asserts]
jsonpath "$.items" count == 1
jsonpath "$.items[0].id" == {{compatible_id}}
jsonpath "$.items[0].name" exists
jsonpath "$.items[0].price" exists
jsonpath "$.items[0].userId" not exists

GET {{base_url}}/api/products/{{slug}}/tabs?tab=complementary-products
HTTP 200
[Asserts]
jsonpath "$.items" count == 1
jsonpath "$.items[0].id" == {{complementary_id}}

GET {{base_url}}/api/products/{{slug}}-missing/tabs?tab=compatible-products
HTTP 404

GET {{base_url}}/api/products/{{slug}}/tabs?tab=related-products
HTTP 200
[Asserts]
jsonpath "$.items[0].id" == {{complementary_id}}

GET {{base_url}}/api/products/{{slug}}/tabs?tab=description
HTTP 200
[Asserts]
jsonpath "$.htmlFa" exists
jsonpath "$.htmlEn" exists
