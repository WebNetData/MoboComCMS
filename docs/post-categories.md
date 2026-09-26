# Article categories

Create categories in Admin → Journal → Article categories. Choose a parent to
create a subcategory, or leave it empty for a root category. Descendants cannot
be selected as a parent. Deleting a category keeps its posts and moves its direct
children to the root; other category assignments remain intact.

The article editor supports multiple checkboxes, search, and full category paths.
Filtering the journal by a parent includes articles assigned to any descendant.

## Upgrading an existing installation

Back up the database, stop the app, then run:

```sh
npm run db:push
npm run db:migrate-post-categories
npm run build
npm start
```

For PostgreSQL, ship a committed Prisma migration and apply it with
`npm run db:migrate:postgres`; never use `db push` on production. Then run
`npm run build:postgres`. Both development and production schemas must stay in parity.
The migration preserves legacy assignments and can be rerun. Legacy `categoryId`
remains compatible; new clients should send `categoryIds: [1, 2]` (or `[]` to
clear all categories). Omitting the field on PATCH leaves assignments unchanged.
