GET {{base_url}}/api/products/{{slug}}/bundles
HTTP 200
[Asserts]
header "Cache-Control" == "private, no-store"
jsonpath "$.items" count == 1
jsonpath "$.items[0].id" == {{bundle_id}}
jsonpath "$.items[0].total" == 5
jsonpath "$.items[0].buyable" == true
jsonpath "$.items[0].components" count == 2
jsonpath "$.items[0].components[1].variantId" == {{variant_id}}
jsonpath "$.items[0].components[1].quantity" == 2
jsonpath "$.items[0].components[1].downloadUrl" not exists
jsonpath "$.items[0].components[1].priceMinor" not exists

GET {{base_url}}/api/products/{{slug}}-missing/bundles
HTTP 404

# Existing product APIs preserve their shapes.
GET {{base_url}}/api/products/{{slug}}/tabs?tab=description
HTTP 200
[Asserts]
jsonpath "$.htmlFa" exists
jsonpath "$.htmlEn" exists

GET {{base_url}}/api/products/{{slug}}/tabs?tab=related-products
HTTP 200
[Asserts]
jsonpath "$.items" exists
