# Article comment notifications

## Audit and owner

Members comment on articles and answer each other (`PostComment`, one level of replies). By default a comment waits for a moderator. Nothing told anyone what happened next: the author did not learn that the comment was published, and the member who was answered did not learn about the answer. Reviews and the forum already send such notices through the shared inbox (`createInboxEvent`).

`journal` owns the rule; delivery, the private inbox, per-kind mutes and push stay in `notifications`. No new table.

## Behavior

When a comment becomes public:

- **Approved by a moderator**: its author gets "your comment is live". A comment published without review (auto-approve on) sends nothing to its author, who has just posted it.
- **It answers someone**: the author of the answered comment gets "new reply to your comment", with the first 160 characters of the reply. Not when members answer themselves, not when the answered comment is not shown, and not when either of the two has blocked the other.

Nothing is sent for a comment that is not approved, or under an article that is not live (draft or scheduled). Approving the same comment again sends nothing new (stable dedupe keys). A notification failure is logged and never undoes or fails the approval.

Two kinds are added to the notification preferences, where members can mute their push copy: `COMMENT_APPROVED` and `COMMENT_REPLY`. The link opens the article.

## Compatibility

Additive. No schema change, no API change; the comment and moderation endpoints answer as before.

## Acceptance

Real PostgreSQL with a recording inbox: author on moderator approval, no author notice on auto-approval, answered author on reply, own reply, pending, scheduled article, hidden parent, missing comment, block in each direction, a Persian slug producing an inbox-safe link, inbox failure contained. Through the real routes on a dev server with the real inbox: a pending reply sends nothing, approval sends both notices, reject then approve again sends nothing new, the two kinds appear in the preference catalogue. TypeScript, architecture, source, security and i18n checks, production build.

## Not in this slice

A place for members to see their own pending or rejected article comments; telling the author about a rejection; email or SMS templates for these kinds.
