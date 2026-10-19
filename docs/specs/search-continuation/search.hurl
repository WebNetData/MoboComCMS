# Owned fixture inputs: base_url, query, expected_total, newest_id, highest_id, dimension_total.
# GET-only public contract checks. No credentials or unrelated index rebuild.
GET {{base_url}}/api/search?q={{query}}&type=title&sort=rating
HTTP 200
[Captures]
next_cursor: jsonpath "$.nextCursor"
[Asserts]
header "Cache-Control" == "private, no-store"
jsonpath "$.facets.sort" == "rating"
jsonpath "$.total" == {{expected_total}}
jsonpath "$.hits[0].id" == {{highest_id}}
jsonpath "$.hits" count == 20

GET {{base_url}}/api/search?q={{query}}&type=title&sort=rating&cursor={{next_cursor}}
HTTP 200
[Asserts]
jsonpath "$.page" == 2
jsonpath "$.cursorReset" == false
jsonpath "$.hits" count == 5

GET {{base_url}}/api/search?q={{query}}&type=title&sort=newest
HTTP 200
[Asserts]
jsonpath "$.hits[0].id" == {{newest_id}}
jsonpath "$.facets.sort" == "newest"

GET {{base_url}}/api/search?q={{query}}&type=title&sort=newest&cursor={{next_cursor}}
HTTP 200
[Asserts]
jsonpath "$.cursorReset" == true
jsonpath "$.page" == 1

GET {{base_url}}/api/search?q={{query}}&type=title&dimension=acting&dimensionMin=4&sort=rating
HTTP 200
[Asserts]
jsonpath "$.total" == {{dimension_total}}
jsonpath "$.facets.dimension" == "acting"
jsonpath "$.hits[0].id" == {{highest_id}}

GET {{base_url}}/api/search?q={{query}}&suggest=1&types=title&sort=rating&dimension=acting
HTTP 200
[Asserts]
jsonpath "$.results" count == 8

GET {{base_url}}/api/search?q={{query}}&type=title
HTTP 200
[Asserts]
jsonpath "$.total" == {{expected_total}}
jsonpath "$.facets.sort" not exists
