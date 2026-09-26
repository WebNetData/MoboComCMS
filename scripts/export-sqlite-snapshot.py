#!/usr/bin/env python3
"""Export an SQLite database to a precision-safe JSON snapshot for PostgreSQL import."""
from __future__ import annotations
import argparse, base64, hashlib, json, sqlite3
from pathlib import Path

def encode(value):
    if value is None or isinstance(value, str): return value
    if isinstance(value, bool): return {"$bool": value}
    if isinstance(value, int): return {"$int": str(value)}
    if isinstance(value, float): return {"$float": repr(value)}
    if isinstance(value, bytes): return {"$bytes": base64.b64encode(value).decode('ascii')}
    raise TypeError(type(value).__name__)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('db', nargs='?', default='prisma/dev.db'); ap.add_argument('out', nargs='?', default='var/sqlite-export.json'); args=ap.parse_args()
    db=Path(args.db); out=Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    con=sqlite3.connect(db); con.row_factory=sqlite3.Row
    con.execute('BEGIN')  # all tables must belong to one consistent snapshot
    names=[r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name")]
    tables={}
    for name in names:
      rows=[]
      for row in con.execute(f'SELECT * FROM "{name}"'):
        rows.append({k:encode(row[k]) for k in row.keys()})
      tables[name]=rows
    payload={"format":"happvpn-sqlite-snapshot-v1","source":str(db),"tables":tables}
    raw=json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',',':')).encode('utf8')
    payload["sha256"]=hashlib.sha256(raw).hexdigest()
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf8')
    con.close()
    print(f'Exported {sum(map(len,tables.values()))} rows across {len(tables)} tables -> {out}')
    print(f'Snapshot SHA-256: {payload["sha256"]}')
if __name__=='__main__': main()
