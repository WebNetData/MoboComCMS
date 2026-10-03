-- Support due-time Journal queries without rewriting existing post data.
-- PostgreSQL runs this outside a transaction so writes can continue.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");
