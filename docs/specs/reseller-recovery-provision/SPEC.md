# A reseller's sale recovered as the customer's account

## Audit

A reseller buys an account for one of their customers from wallet balance. After the invoice is settled, a `RESELLER_PROVISION` job creates the account for the customer, with the traffic, days and device limit the reseller chose.

The order worker has a recovery for paid orders that have no fulfillment job (the process stopped between settling and queueing). It queues the job through `enqueueOrderFulfillment`, which knew renewals and ordinary plan orders but not reseller sales. A recovered reseller sale was therefore queued as an ordinary `PROVISION_SUBSCRIPTION`: the account would be created for the **reseller's own user**, at the **plan's default allowance**, without the link to the reseller. The reseller's own retry then found "a subscription for this order" and reported the sale as done. Reproduced on `main` with the connected script.

## Behavior

`enqueueOrderFulfillment` recognises a reseller order by its stored terms and queues `RESELLER_PROVISION` with the customer, the reseller and the chosen allowance, under the same key the reseller flow itself uses, so the job exists once whoever queues it. A reseller order that does not say whose account it is cannot be provisioned for anyone: queueing it fails and the recovery reports it instead of guessing.

Ordinary plan orders and renewals are queued as before. No schema change.

## Owner

`fulfillment` owns the queue and the recovery; the reseller flow is unchanged.

## Acceptance

Real PostgreSQL: a paid reseller sale without a job is queued as the customer's account with its chosen allowance; an ordinary order and a renewal are queued as before; queued once across the recovery and a direct call; an incomplete reseller order is reported and not queued. Fault shown on `main` (`RESELLER_RECOVERY_BASELINE`). TypeScript, architecture, source and security checks, production build.

## Not in this slice

Accounts already created for a reseller's own user by this recovery before the change are not detected; they show as a subscription owned by the reseller on an order whose stored terms name another customer. A reseller sale that was charged but not settled still answers "requires manual review", as designed.
