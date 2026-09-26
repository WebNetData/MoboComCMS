#!/usr/bin/env python3
from __future__ import annotations
import argparse, sqlite3, sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ZERO={"CLP","DJF","GNF","ISK","JPY","KMF","KRW","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"}
THREE={"BHD","IQD","JOD","KWD","LYD","OMR","TND"}
def exp(c): return 0 if (c or 'USD').upper() in ZERO else 3 if (c or 'USD').upper() in THREE else 2
def minor(v,c): return int((Decimal(str(v or 0))*(Decimal(10)**exp(c))).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
def valid_currency(c): return isinstance(c,str) and 3 <= len(c.strip()) <= 12 and c.strip().upper()==c.strip()

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('db', nargs='?', default='prisma/dev.db'); args=ap.parse_args()
    p=Path(args.db)
    if not p.exists(): raise SystemExit(f'database not found: {p}')
    con=sqlite3.connect(p); con.row_factory=sqlite3.Row
    errors=[]; warnings=[]
    pairs={
      'Plan':[('price','priceMinor')], 'Order':[('totalAmount','totalMinor')], 'OrderItem':[('price','priceMinor')],
      'ResellerPrice':[('price','priceMinor')], 'Product':[('price','priceMinor')],
      'Invoice':[('subtotal','subtotalMinor'),('discount','discountMinor'),('tax','taxMinor'),('total','totalMinor'),('walletApplied','walletAppliedMinor'),('paidAmount','paidAmountMinor')],
      'Payment':[('amount','amountMinor'),('fee','feeMinor')], 'WalletTx':[('amount','amountMinor'),('balanceAfter','balanceAfterMinor')],
      'Expense':[('amount','amountMinor')], 'Gateway':[('minAmount','minAmountMinor')],
    }
    for table, mappings in pairs.items():
      cols={r[1] for r in con.execute(f'pragma table_info("{table}")')}
      if not cols: errors.append(f'{table}: table missing'); continue
      cur_expr='currency' if 'currency' in cols else 'fiat' if 'fiat' in cols else None
      if table=='OrderItem':
        rows=con.execute('SELECT oi.*, COALESCE(o.currency,p.currency,\'USD\') AS _currency FROM OrderItem oi LEFT JOIN "Order" o ON o.id=oi.orderId LEFT JOIN Plan p ON p.id=oi.planId').fetchall(); cur_expr='_currency'
      elif table=='ResellerPrice':
        rows=con.execute('SELECT rp.*, COALESCE(p.currency,\'USD\') AS _currency FROM ResellerPrice rp LEFT JOIN Plan p ON p.id=rp.planId').fetchall(); cur_expr='_currency'
      else: rows=con.execute(f'SELECT * FROM "{table}"').fetchall()
      for r in rows:
        currency=(r[cur_expr] if cur_expr else 'USD') or 'USD'
        if cur_expr and not valid_currency(currency): errors.append(f'{table}#{r["id"]}: invalid currency {currency!r}')
        for legacy, exact in mappings:
          if int(r[exact] or 0) != minor(r[legacy],currency): errors.append(f'{table}#{r["id"]}: {legacy}/{exact} mismatch ({currency})')
    # percentage mirror
    for r in con.execute('SELECT id, feePercent, feeBps FROM Gateway'):
      expected=int((Decimal(str(r['feePercent'] or 0))*100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
      if int(r['feeBps'] or 0)!=expected: errors.append(f'Gateway#{r["id"]}: feePercent/feeBps mismatch')
    # invoices must balance before wallet/gateway split
    for r in con.execute('SELECT id, subtotalMinor, discountMinor, taxMinor, totalMinor FROM Invoice'):
      expected=int(r['subtotalMinor'])-int(r['discountMinor'])+int(r['taxMinor'])
      if expected != int(r['totalMinor']): errors.append(f'Invoice#{r["id"]}: total invariant failed ({expected} != {r["totalMinor"]})')
    # wallet account is the authoritative balance; legacy USD mirror must agree during transition
    accounts={(r['userId'],r['currency']): int(r['balanceMinor']) for r in con.execute('SELECT userId,currency,balanceMinor FROM WalletAccount')}
    for r in con.execute('SELECT id,walletBalance FROM User'):
      expected=minor(r['walletBalance'],'USD'); actual=accounts.get((r['id'],'USD'))
      if actual is None: errors.append(f'User#{r["id"]}: missing USD WalletAccount')
      elif actual != expected: errors.append(f'User#{r["id"]}: legacy USD wallet mirror mismatch ({expected} != {actual})')
    for (uid,currency), bal in accounts.items():
      if bal < 0: errors.append(f'WalletAccount user={uid} {currency}: negative balance {bal}')
    # Historical ledgers may pre-date exact-money; report gaps but do not rewrite history automatically.
    for (uid,currency), bal in accounts.items():
      row=con.execute("SELECT balanceAfterMinor FROM WalletTx WHERE userId=? AND currency=? AND status='DONE' ORDER BY id DESC LIMIT 1",(uid,currency)).fetchone()
      if row and int(row[0]) != bal: warnings.append(f'wallet ledger gap user={uid} {currency}: last tx={int(row[0])}, account={bal}')
      elif not row and bal != 0: warnings.append(f'wallet ledger missing history user={uid} {currency}: account={bal}')
    print(f'Money reconciliation: {len(errors)} error(s), {len(warnings)} warning(s)')
    for e in errors: print('ERROR:',e)
    for w in warnings: print('WARN :',w)
    con.close()
    if errors: sys.exit(1)

if __name__=='__main__': main()
