# My reviews (account)

## Audit and owner

A member can rate and review software, games, films, albums and tracks (`reviews`, `ItemReview`) and store products (`catalog`, `ProductReview`). Each has its own moderation. Until now a member could only see a review on the page of the item it belongs to: there was no place listing what they had written, and no way to notice that a text was still waiting for approval or had been rejected. Public profiles list approved shared reviews only.

`reviews` and `catalog` stay the owners of their records and rules. `account` composes a private read from both, as it already does for the account home. No new table, no second review system, and `ProductReview` keeps its own dimensions.

## Behavior

`/dashboard/reviews` (signed-in only, not indexed) lists the member's own ratings and reviews from both sources in one list, last changed first, ten per page, up to 50 pages. Each row shows the reviewed item, the kind (game, product, …), the stars, the date, the title (product reviews), the text, and the moderation state: published, awaiting review, not approved. A rating without text is listed as such. A rejected text carries a hint that it can be edited on the item page; editing and deleting stay where they are.

The reviewed item is shown through its current public card. When the item or product is no longer public, the row stays but the item is not named or linked, so a withdrawn title does not leak through an old review.

Only the signed-in member's rows are read. When the reviews module is off its rows are left out; when the store is off product reviews are left out. Nothing is deleted in either case. The account menu shows the link when either is on.

## Compatibility

Additive: one page, one menu link, two read functions (`memberItemReviews`, `memberProductReviews`) and the composing `memberReviewPage`. No schema change, no API change, no change to existing review pages or moderation.

## Acceptance

Real PostgreSQL: merged order across both sources, pagination and page bounds, own rows only, unpublished item and non-public product unnamed, rejected and rating-only rows, each module disabled in turn with rows preserved. Browser, RTL, dark and light, desktop and mobile: empty state, list with every state, link to a public item opens, no horizontal overflow, signed-out visitor is sent to login. TypeScript, source, architecture, security, money-UI and i18n checks, production build.

## Managing from the list (second slice)

A shared review's row also shows its verified-experience badge and dimension scores, and has **Edit** and **Delete**. Edit opens the same form as the item page in place (stars, dimension scores, text) and saves through the same `POST /api/engage/review`; an edited text goes back to moderation by the existing rule and the row moves to the top. Delete uses the same `DELETE /api/engage/review`. When the item is no longer public the review can be deleted but not edited, and the item is still not named.

A store product review has neither button: the store accepts one review per verified buyer and has no edit or delete for members. Its rejected hint says so.

No schema change and no new endpoint; `memberItemReviews` returns the item reference, badge and scores as well.

## Article comments (third slice)

The list also shows the member's own article comments and replies (`PostComment`), read through `journal`'s `memberPostComments`, merged by last change with the reviews. They carry no rating. This is the only place a member can see that a comment is still waiting for a moderator or was not approved. An article that is not live (draft, scheduled or withdrawn) is not named or linked. With the journal module off the comments are left out and kept; the menu link is shown when the reviews module, the store or the journal is on. Read-only: there is no member edit or delete for article comments.

## Deleting an article comment (fourth slice)

A comment row has **Delete** (`DELETE /api/account/article-comments/:id`, signed-in, same-origin, rate-limited, the member's own comment only; anything else answers "not found"). It works in every moderation state and also when the article is no longer live.

The text is always erased. A comment nobody answered is removed. A comment with answers stays as an empty placeholder (`status = DELETED`) so the answers keep their place: under the article it reads "deleted by its author" without a name, for as long as it still has a published answer, and cannot be answered. Moderation does not list placeholders and refuses to change them; they leave the member's own list. There is no undo and no edit.

## Not covered

Editing or deleting product reviews (a store policy decision); an API for apps beyond the existing review endpoints.
