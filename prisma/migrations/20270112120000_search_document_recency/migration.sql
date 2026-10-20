-- The search reads matches newest published first and stops at MAX_SCANNED_MATCHES; this index serves that order.
CREATE INDEX "SearchDocument_publishedAt_id_idx" ON "SearchDocument"("publishedAt", "id");
