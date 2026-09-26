#!/usr/bin/env python3
import sqlite3, sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'prisma/dev.db')
if not path.exists():
    raise SystemExit(f'database not found: {path}')
con = sqlite3.connect(path)
try:
    con.executescript('''
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "actorUserId" INTEGER NOT NULL,
      "actorEmail" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL DEFAULT '',
      "requestId" TEXT NOT NULL DEFAULT '',
      "ip" TEXT NOT NULL DEFAULT '',
      "metadata" TEXT NOT NULL DEFAULT '{}',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
    CREATE INDEX IF NOT EXISTS "AuditLog_requestId_idx" ON "AuditLog"("requestId");
    ''')
    # Existing deployments may have a persisted admin role created before audit.view existed.
    row = con.execute('SELECT id, permissions FROM "Role" WHERE name = ?', ('admin',)).fetchone()
    if row:
        perms = [item.strip() for item in (row[1] or '').split(',') if item.strip()]
        if 'audit.view' not in perms:
            perms.append('audit.view')
            con.execute('UPDATE "Role" SET permissions = ? WHERE id = ?', (','.join(perms), row[0]))
    con.commit()
    print('AuditLog migration OK')
finally:
    con.close()
