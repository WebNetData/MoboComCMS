# Wallet renewals that stopped part-way

## Audit

A customer renews a subscription from wallet balance (`subscriptionAction(…, 'renew')`). The steps run one after the other: create the order and the invoice, charge the wallet, settle the invoice, queue the renewal. Each step is idempotent under the request's key.

A second request with the same key was answered from the existing order alone: "ok, already submitted, fulfillment pending", without looking at how far the first one had come. If the first request stopped after the wallet was charged but before the invoice was settled, the customer had paid, every retry said "pending", the invoice stayed unpaid and the renewal was never queued. Reproduced on `main` with the connected script. Nothing else looked for that state either.

## Behavior

- **A retry carries on.** When the order of an earlier attempt is still pending, the same request runs the remaining steps. All of them are keyed, so the wallet is charged once and the renewal queued once. The price and the allowance are the ones frozen by the first attempt, even if the plan changed since.
- **A failed attempt stays failed.** If the charge of an attempt failed, its order and invoice are closed and a retry under the same key is told to start a new attempt.
- **A finished attempt is replayed** as before.
- **Nobody retries.** A scheduled job (every five minutes) looks at the most recent orders for wallet renewals still pending after ten minutes. Where the wallet was charged it settles the invoice; the existing fulfillment recovery then queues the renewal for the paid order. Where the wallet was not charged it closes the attempt as failed and voids its invoice. One order that fails is logged and does not stop the others.

No schema change. The renewal response gains `replayed: true` on a resumed attempt, as it already had on a replay.

## Owner

`subscriptions` owns the renewal and the sweep; `billing` and `wallet` are used through their existing idempotent calls; the job is registered in the existing scheduler.

## Acceptance

Real PostgreSQL with the real wallet and billing: stop after the charge, then retry (settled, queued once, charged once); a later replay after a plan change; stop before the charge, then retry at the frozen price and allowance; a resumed attempt whose charge fails, then refused under its key; the sweep settling a charged attempt, closing an uncharged one and leaving a young one. Fault shown on `main` (`RENEWAL_BASELINE`). TypeScript, architecture, source, security and money checks, production build.

## Not in this slice

The sweep looks at the most recent 5,000 orders, so an attempt older than that is not found; a customer retry still finishes it. The gateway-paid renewal path is not part of this.
