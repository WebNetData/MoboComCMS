-- Tokens of a request that the AI service read from (or, for Claude, wrote to) its own prompt cache, so monitoring can
-- price them at the cheaper cache rate. Additive and nullable: older rows simply did not report them.
ALTER TABLE "AiInvocation" ADD COLUMN "cachedInputTokens" INTEGER;
ALTER TABLE "AiInvocation" ADD COLUMN "cacheWriteTokens" INTEGER;
