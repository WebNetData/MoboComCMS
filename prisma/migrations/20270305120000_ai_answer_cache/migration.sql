-- An AI answer given from the cache (the same request within its purpose's cache time) is noted for monitoring as
-- transport 'cache', so the page can show what was not paid for again. Widens one check; every row stays valid.
ALTER TABLE "AiInvocation" DROP CONSTRAINT "AiInvocation_transport_check";
ALTER TABLE "AiInvocation" ADD CONSTRAINT "AiInvocation_transport_check" CHECK ("transport" IN ('api', 'personal', 'cache'));
CREATE INDEX "AiInvocation_purpose_transport_startedAt_idx" ON "AiInvocation"("purpose", "transport", "startedAt");
