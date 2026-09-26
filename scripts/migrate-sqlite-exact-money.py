#!/usr/bin/env python3
"""Idempotent SQLite upgrade for MoboComCMS exact-money and delivery infrastructure.

This script only performs additive schema changes plus deterministic backfills. It
never drops legacy Float columns so the application can be rolled back while the
PostgreSQL cutover is rehearsed.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sqlite3
import sys
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

ZERO_DECIMAL = {"CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"}
THREE_DECIMAL = {"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"}


def exp(currency: str | None) -> int:
    code = (currency or "USD").strip().upper()
    if code in ZERO_DECIMAL:
        return 0
    if code in THREE_DECIMAL:
        return 3
    return 2


def minor(value, currency: str | None) -> int:
    if value is None:
        return 0
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise RuntimeError(f"invalid money value {value!r}") from exc
    scale = Decimal(10) ** exp(currency)
    return int((amount * scale).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def columns(con: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}


def add_column(con: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    if name not in columns(con, table):
        con.execute(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {ddl}')
        print(f"+ {table}.{name}")


def table_exists(con: sqlite3.Connection, table: str) -> bool:
    return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is not None


def migrate(db_path: Path, backup: bool) -> None:
    if not db_path.exists():
        raise SystemExit(f"database not found: {db_path}")
    if backup:
        backup_path = db_path.with_suffix(db_path.suffix + ".pre-exact-money.bak")
        if not backup_path.exists():
            shutil.copy2(db_path, backup_path)
            print(f"backup: {backup_path}")

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    now = int(time.time() * 1000)
    try:
        con.execute("BEGIN IMMEDIATE")

        # Additive columns. SQLite INTEGER safely stores Prisma BigInt values.
        additions = {
            "Plan": [("priceMinor", "INTEGER NOT NULL DEFAULT 0"), ("currency", "TEXT NOT NULL DEFAULT 'USD'")],
            "Order": [("totalMinor", "INTEGER NOT NULL DEFAULT 0"), ("idempotencyKey", "TEXT")],
            "OrderItem": [("priceMinor", "INTEGER NOT NULL DEFAULT 0")],
            "ResellerPrice": [("priceMinor", "INTEGER NOT NULL DEFAULT 0")],
            "Product": [("priceMinor", "INTEGER NOT NULL DEFAULT 0"), ("currency", "TEXT NOT NULL DEFAULT 'USD'")],
            "Gateway": [("feeBps", "INTEGER NOT NULL DEFAULT 0"), ("minAmountMinor", "INTEGER NOT NULL DEFAULT 0")],
            "Invoice": [
                ("subtotalMinor", "INTEGER NOT NULL DEFAULT 0"), ("discountMinor", "INTEGER NOT NULL DEFAULT 0"),
                ("taxMinor", "INTEGER NOT NULL DEFAULT 0"), ("totalMinor", "INTEGER NOT NULL DEFAULT 0"),
                ("walletAppliedMinor", "INTEGER NOT NULL DEFAULT 0"), ("paidAmountMinor", "INTEGER NOT NULL DEFAULT 0"),
                ("idempotencyKey", "TEXT"),
            ],
            "Payment": [("amountMinor", "INTEGER NOT NULL DEFAULT 0"), ("feeMinor", "INTEGER NOT NULL DEFAULT 0"), ("eventKey", "TEXT")],
            "WalletTx": [
                ("amountMinor", "INTEGER NOT NULL DEFAULT 0"), ("balanceAfterMinor", "INTEGER NOT NULL DEFAULT 0"),
                ("currency", "TEXT NOT NULL DEFAULT 'USD'"), ("idempotencyKey", "TEXT"),
            ],
            "Expense": [("amountMinor", "INTEGER NOT NULL DEFAULT 0")],
        }
        for table, defs in additions.items():
            if not table_exists(con, table):
                continue
            for name, ddl in defs:
                add_column(con, table, name, ddl)

        con.executescript("""
        CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
        CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");
        CREATE UNIQUE INDEX IF NOT EXISTS "Payment_eventKey_key" ON "Payment"("eventKey");
        CREATE UNIQUE INDEX IF NOT EXISTS "WalletTx_idempotencyKey_key" ON "WalletTx"("idempotencyKey");

        CREATE TABLE IF NOT EXISTS "WalletAccount" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "userId" INTEGER NOT NULL,
          "currency" TEXT NOT NULL,
          "balanceMinor" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "WalletAccount_userId_currency_key" ON "WalletAccount"("userId", "currency");
        CREATE INDEX IF NOT EXISTS "WalletAccount_currency_idx" ON "WalletAccount"("currency");

        CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
          "year" INTEGER NOT NULL PRIMARY KEY,
          "value" INTEGER NOT NULL DEFAULT 0,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "WebhookInbox" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "provider" TEXT NOT NULL,
          "eventKey" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "payload" TEXT NOT NULL,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "lockedAt" DATETIME,
          "processedAt" DATETIME,
          "lastError" TEXT NOT NULL DEFAULT '',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "WebhookInbox_provider_eventKey_key" ON "WebhookInbox"("provider", "eventKey");
        CREATE INDEX IF NOT EXISTS "WebhookInbox_status_lockedAt_idx" ON "WebhookInbox"("status", "lockedAt");

        CREATE TABLE IF NOT EXISTS "FulfillmentJob" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "kind" TEXT NOT NULL,
          "dedupeKey" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "payload" TEXT NOT NULL DEFAULT '{}',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lockedAt" DATETIME,
          "completedAt" DATETIME,
          "lastError" TEXT NOT NULL DEFAULT '',
          "orderId" INTEGER,
          "invoiceId" INTEGER,
          "subscriptionId" INTEGER,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "FulfillmentJob_dedupeKey_key" ON "FulfillmentJob"("dedupeKey");
        CREATE INDEX IF NOT EXISTS "FulfillmentJob_status_availableAt_idx" ON "FulfillmentJob"("status", "availableAt");
        CREATE INDEX IF NOT EXISTS "FulfillmentJob_orderId_idx" ON "FulfillmentJob"("orderId");
        CREATE INDEX IF NOT EXISTS "FulfillmentJob_invoiceId_idx" ON "FulfillmentJob"("invoiceId");

        CREATE TABLE IF NOT EXISTS "InventoryReservation" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "orderId" INTEGER NOT NULL,
          "productId" INTEGER NOT NULL,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          "finite" BOOLEAN NOT NULL DEFAULT true,
          "status" TEXT NOT NULL DEFAULT 'HELD',
          "expiresAt" DATETIME NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "InventoryReservation_orderId_key" ON "InventoryReservation"("orderId");
        CREATE INDEX IF NOT EXISTS "InventoryReservation_productId_status_idx" ON "InventoryReservation"("productId", "status");
        CREATE INDEX IF NOT EXISTS "InventoryReservation_expiresAt_status_idx" ON "InventoryReservation"("expiresAt", "status");
        """)

        # Deterministic backfill from legacy mirrors.
        if table_exists(con, "Plan"):
            for r in con.execute('SELECT id, price, currency FROM "Plan"'):
                con.execute('UPDATE "Plan" SET priceMinor=? WHERE id=?', (minor(r["price"], r["currency"]), r["id"]))
        if table_exists(con, "Product"):
            for r in con.execute('SELECT id, price, currency FROM "Product"'):
                con.execute('UPDATE "Product" SET priceMinor=? WHERE id=?', (minor(r["price"], r["currency"]), r["id"]))
        if table_exists(con, "Order"):
            for r in con.execute('SELECT id, totalAmount, currency FROM "Order"'):
                con.execute('UPDATE "Order" SET totalMinor=? WHERE id=?', (minor(r["totalAmount"], r["currency"]), r["id"]))
        if table_exists(con, "OrderItem"):
            rows = con.execute('SELECT oi.id, oi.price, COALESCE(o.currency, p.currency, \'USD\') currency FROM "OrderItem" oi LEFT JOIN "Order" o ON o.id=oi.orderId LEFT JOIN "Plan" p ON p.id=oi.planId').fetchall()
            for r in rows:
                con.execute('UPDATE "OrderItem" SET priceMinor=? WHERE id=?', (minor(r["price"], r["currency"]), r["id"]))
        if table_exists(con, "ResellerPrice"):
            rows = con.execute('SELECT rp.id, rp.price, COALESCE(p.currency, \'USD\') currency FROM "ResellerPrice" rp LEFT JOIN "Plan" p ON p.id=rp.planId').fetchall()
            for r in rows:
                con.execute('UPDATE "ResellerPrice" SET priceMinor=? WHERE id=?', (minor(r["price"], r["currency"]), r["id"]))
        if table_exists(con, "Gateway"):
            for r in con.execute('SELECT id, feePercent, minAmount, fiat FROM "Gateway"'):
                fee_bps = int((Decimal(str(r["feePercent"] or 0)) * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
                con.execute('UPDATE "Gateway" SET feeBps=?, minAmountMinor=? WHERE id=?', (fee_bps, minor(r["minAmount"], r["fiat"]), r["id"]))
        if table_exists(con, "Invoice"):
            for r in con.execute('SELECT id, subtotal, discount, tax, total, walletApplied, paidAmount, currency FROM "Invoice"'):
                cur = r["currency"]
                con.execute('''UPDATE "Invoice" SET subtotalMinor=?, discountMinor=?, taxMinor=?, totalMinor=?, walletAppliedMinor=?, paidAmountMinor=? WHERE id=?''',
                    (minor(r["subtotal"], cur), minor(r["discount"], cur), minor(r["tax"], cur), minor(r["total"], cur), minor(r["walletApplied"], cur), minor(r["paidAmount"], cur), r["id"]))
        if table_exists(con, "Payment"):
            for r in con.execute('SELECT id, amount, fee, currency FROM "Payment"'):
                con.execute('UPDATE "Payment" SET amountMinor=?, feeMinor=? WHERE id=?', (minor(r["amount"], r["currency"]), minor(r["fee"], r["currency"]), r["id"]))
        if table_exists(con, "WalletTx"):
            for r in con.execute('SELECT id, amount, balanceAfter, currency FROM "WalletTx"'):
                con.execute('UPDATE "WalletTx" SET amountMinor=?, balanceAfterMinor=? WHERE id=?', (minor(r["amount"], r["currency"]), minor(r["balanceAfter"], r["currency"]), r["id"]))
        if table_exists(con, "Expense"):
            for r in con.execute('SELECT id, amount, currency FROM "Expense"'):
                con.execute('UPDATE "Expense" SET amountMinor=? WHERE id=?', (minor(r["amount"], r["currency"]), r["id"]))

        # Existing User.walletBalance is the historical USD source-of-truth at migration time.
        for r in con.execute('SELECT id, walletBalance FROM "User"'):
            con.execute('''INSERT INTO "WalletAccount" ("userId","currency","balanceMinor","createdAt","updatedAt") VALUES (?,?,?,?,?)
                ON CONFLICT("userId","currency") DO UPDATE SET "balanceMinor"=excluded."balanceMinor", "updatedAt"=excluded."updatedAt"''',
                (r["id"], "USD", minor(r["walletBalance"], "USD"), now, now))

        # Continue historical invoice numbering without relying on row counts.
        per_year: dict[int, int] = {}
        for r in con.execute('SELECT number FROM "Invoice"'):
            m = re.search(r'(20\d{2})[^0-9]+(\d+)$', r["number"] or "")
            if m:
                year, seq = int(m.group(1)), int(m.group(2))
                per_year[year] = max(per_year.get(year, 0), seq)
        for year, value in per_year.items():
            con.execute('''INSERT INTO "InvoiceSequence" ("year","value","updatedAt") VALUES (?,?,?)
                ON CONFLICT("year") DO UPDATE SET "value"=MAX("value", excluded."value"), "updatedAt"=excluded."updatedAt"''', (year, value, now))

        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    print("SQLite exact-money migration complete")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db", nargs="?", default="prisma/dev.db")
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()
    migrate(Path(args.db), not args.no_backup)

if __name__ == "__main__":
    main()
