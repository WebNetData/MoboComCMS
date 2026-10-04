# Complete product review dimension averages

Audit: the review tab's total/rating distribution aggregate all approved ProductReview rows, but quality/value/usability averages use an unordered first 500 rows. Larger products therefore show inconsistent dimension averages.

Move the existing calculation to Catalog's server service, scan approved rows for the current product by ascending ID in 500-row pages and retain three sum/count pairs. Keep existing per-dimension finite 1–5 validation, numeric-string tolerance, missing/malformed criteria handling, one-decimal rounding and empty zeros. No schema, setting, authorization, API shape, central-engine replacement or visual change. Scans do not provide snapshot isolation for concurrent moderation, matching existing independent aggregate queries.

Acceptance: 1001-row regression whose first 500 quality scores are 1 and later scores 5 produces quality 3; bounded ID pages, malformed/partial criteria, empty reviews, approved-only reads, current product/guest/publication gates and existing pagination. Run focused Store tests, TypeScript/source/architecture/security, full site suite, real PostgreSQL/API fixtures with cleanup, clean-source build and GitHub gates.
