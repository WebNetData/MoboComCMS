# Gift cards: one card per purchase, no lost or repeated value

## Audit

Gift cards are bought with wallet balance and redeemed into a wallet (`store`, `GiftCard`; money moves through `wallet`'s idempotent `moveWallet`). Three faults, each reproduced on `main` with the connected script.

1. **Two cards for one payment.** A purchase first looks for a card already bought with the same request key, then debits the wallet (idempotent), then stores the card. Nothing made the card itself unique per request. A second request with the same key that passed the lookup before the first stored its card (a double click, a client retry after a timeout) was debited nothing and stored a second, fully valid card.
2. **Value lost when a redemption was interrupted.** Redeeming claims the card (status `REDEEMED`, `redeemedBy`) and then credits the wallet. If the process stopped between the two, the card stayed claimed and the member was told "you have already used this card" on every retry, with nothing credited.
3. **A redeemed card could be made active again.** Enabling or disabling a card read it and then wrote the new status unconditionally. A card redeemed between the read and the write became `ACTIVE` or `DISABLED` again. Because the wallet credit is keyed by the card, a second member redeeming it was told it worked, shown the first member's resulting balance, and credited nothing.

## Behavior

- **One card per paid purchase.** `GiftCard.purchaseKey` (unique, nullable) holds the purchase's request marker. A second insert for the same purchase fails on that key and the request answers with the first card (`replayed: true`); only the request that created the card emails and notifies. Cards bought before the key existed are still found by their note.
- **An interrupted redemption is finished by its member, once.** When the card is already claimed for the member who is redeeming, the wallet credit is attempted again under the card's own key: if it had not been paid it is paid now and the redemption succeeds; if it had, the answer is "already used". Anyone else still gets "already used". The rollback after a failed credit only releases a claim that is still this member's.
- **A status change never touches a redeemed card.** The write is conditional on the card not being redeemed; otherwise it answers 409 as it already did for a card seen as redeemed.

## Data and compatibility

Additive migration `20261127120000_gift_card_purchase_key`: one nullable column and a unique index. Existing cards keep `NULL` (any number of NULLs is allowed) and nothing is backfilled, because cards already issued twice for one purchase would make a backfill fail. API responses are unchanged.

Duplicates created before this fix are not detected or removed here; they can be listed by a repeated `note` starting with `buy:`.

## Owner

`store` owns gift cards; `wallet` is used through its existing idempotent movement, unchanged.

## Acceptance

Real PostgreSQL with the real wallet: duplicate request past the lookup (one debit, one card, same code), ordinary retry, a second purchase, a legacy card without a key; interrupted redemption finished for its member and refused afterwards and for a stranger, ordinary redemption; stale status change on a redeemed card refused in both directions and the card not redeemable again; disable and enable of an unused card. Each fault shown on `main` (`GIFT_CARD_BASELINE`, `GIFT_CARD_SKIP`). TypeScript, architecture, source, schema, security and money checks, production build.
