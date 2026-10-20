# Search speed measurement

`scripts/search-measure.cjs` times the public search API (`/api/search`) of a running site. It is a measuring tool, not a test, and its numbers describe the machine and data it ran on.

## Safety

- Run it only against a **local or staging copy** of the database. It refuses to start without `--scratch-database`, and it refuses any `--base` address that is not local.
- The synthetic mode briefly adds published posts, and any visitor of that site could see them. It removes them afterwards (unless `--keep`) and restores the search index stamp.
- Both modes subtract the analytics search counts that their own requests added.
- The public search allows 60 requests a minute per address. The tool waits about 1.1 s between requests and waits out a 429 instead of getting around the limit.

## Usage

Run it where `DATABASE_URL` points at the same database as the app at `--base`. For the local stack, that means inside the app container:

```sh
docker cp scripts/search-measure.cjs mobocom-app:/tmp/search-measure.cjs
docker exec mobocom-app sh -c 'cd /app && NODE_PATH=/app/node_modules node /tmp/search-measure.cjs --scratch-database --docs=20000 --runs=5'
```

- `--docs=N` (default 20000, at most 500000): synthetic documents to add. Every document contains one marker word; every 2nd, 10th and 100th document, and exactly one document, contain further markers. The questions therefore match a known number of documents.
- `--runs=N` (default 5): timed requests per question, after one warm-up.
- `--real=N`: adds nothing. It replays the N searches that were asked most often in the last 30 days, taken from the analytics counts. On a copy restored from a production backup, this shows the real query distribution against the real index.
- `--container=NAME`: reports the container's memory before and after (needs the docker CLI where the tool runs).

## Local results, 2026-10-20

Setup: Windows 11 with Docker Desktop, the local preview app in development mode (`next dev --turbopack`), and PostgreSQL 17 in a container. Times are in milliseconds, measured at the client, and include Next.js. The text is synthetic. A production build adds less overhead per request, but most of the time goes to reading and ranking matches, which the build mode does not change.

| Question (matches) | 20,000 docs, median | 100,000 docs, median |
|---|---|---|
| one match | 29 | 62 |
| 1% | 37 (200) | 128 (1,000) |
| 10% | 293 (2,000) | 519 (10,000) |
| 50% | 424 (10,000) | 2,347 (50,000) |
| every document | 793 (20,000) | 4,451 (100,000) |
| every document, page 50 or past it (cursor) | 798 / 850 | 4,484 / 4,462 |
| a common Persian word (70% of documents) | 580 | 3,198 |
| autocomplete | 34 | 47 |

### What this shows

- **Time grows with the number of matching documents, not with the size of the index.** A search reads every match in batches of 500 (`SearchDocument` in id order, `LIKE '%word%'`), checks each batch against the owners' public cards, and ranks all of them. That costs about 45 µs per match here. A word that appears in most documents therefore costs seconds once an index reaches about 100,000 documents.
- **A rare word gets slower as the index grows.** No index serves `LIKE '%word%'`, so finding the first 500 matches is a full table scan: 7.6 ms on 20,000 rows and 37 ms on 100,000.
- **Autocomplete stays fast.** It reads a fixed sample of 400 candidates.

## Options, not yet decided

These are design choices for the owner. The measurement does not choose one.

1. Stop reading after a fixed number of matches (for example 5,000), rank only those, and show the total as "more than 5,000". This is the smallest change and keeps today's ranking.
2. Add a PostgreSQL trigram index (`pg_trgm`, GIN) on `SearchDocument.text`. This speeds up finding rare words. It does not help with words that match most documents.
3. Rank inside PostgreSQL with full-text search. This is a larger change, and Persian has no built-in dictionary.

Before choosing, run `--real` on a copy of the production data: the real query distribution decides how often common words are searched.
