"""
SQLite -> Supabase migration script for Lucy3000.
Reads from prisma/prisma/lucy3000.db, inserts into Supabase via REST API.
Run: python scripts/migrate-sqlite-to-supabase.py
"""

import sqlite3
import json
import subprocess
import sys
import os
import tempfile
from datetime import datetime, timezone, timedelta

SUPABASE_URL = "https://zcehjabyfbasmhtgtjfs.supabase.co"
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
DB_PATH = "prisma/prisma/lucy3000.db"
BATCH_SIZE = 500

CURL_HEADERS = [
    "-H", f"apikey: {SERVICE_KEY}",
    "-H", f"Authorization: Bearer {SERVICE_KEY}",
    "-H", "Content-Type: application/json",
    "-H", "Prefer: return=minimal",
]

# FK-safe insertion order
TABLES = [
    "tenants",
    "tenant_licenses",
    "users",
    "clients",
    "client_history",
    "services",
    "products",
    "appointment_legends",
    "appointments",
    "appointment_services",
    "bono_packs",
    "bono_sessions",
    "cash_registers",
    "sales",
    "sale_items",
    "pending_payments",
    "pending_payment_collections",
    "cash_movements",
    "cash_counts",
    "account_balance_movements",
    "stock_movements",
    "notifications",
    "settings",
    "google_calendar_config",
    "dashboard_reminders",
    "agenda_blocks",
    "agenda_day_notes",
    "quotes",
    "quote_items",
]


_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_MIN_DATE = datetime(1900, 1, 1, tzinfo=timezone.utc)
_MAX_DATE = datetime(2100, 1, 1, tzinfo=timezone.utc)


def safe_epoch_to_iso(v):
    """Convert epoch integer (ms or seconds) to ISO string, or None if out of range."""
    try:
        # Prisma stores as ms; legacy imports may use seconds
        if abs(v) >= 1_000_000_000_000:
            dt = _EPOCH + timedelta(milliseconds=v)
        else:
            dt = _EPOCH + timedelta(seconds=v)
        if dt < _MIN_DATE or dt > _MAX_DATE:
            return None
        return dt.isoformat()
    except (OverflowError, ValueError, OSError):
        return None


def normalize_row(row):
    """Convert epoch integers to ISO strings for datetime-looking fields."""
    result = {}
    for k, v in row.items():
        if isinstance(v, int) and abs(v) >= 1_000_000:
            converted = safe_epoch_to_iso(v)
            result[k] = converted  # None if out of range
        else:
            result[k] = v
    return result


def supabase_request(method, path, body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    cmd = ["curl", "-s", "-w", "|||STATUS:%{http_code}", "-X", method] + CURL_HEADERS + [url]
    if body is not None:
        payload = json.dumps(body)
        # Use temp file for large payloads (Windows cmd line limit)
        if len(payload) > 4000:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
                f.write(payload)
                tmp = f.name
            tmp_curl = tmp.replace("\\", "/")
            cmd += ["--data-binary", f"@{tmp_curl}"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            os.unlink(tmp)
        else:
            cmd += ["-d", payload]
            result = subprocess.run(cmd, capture_output=True, text=True)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True)
    out = result.stdout
    if "|||STATUS:" in out:
        body_part, status_part = out.rsplit("|||STATUS:", 1)
        return int(status_part.strip() or "0"), body_part.strip()
    return 0, out


def delete_all(table):
    # Use id neq impossible value — deletes all rows via REST
    status, body = supabase_request("DELETE", f"{table}?id=neq.___IMPOSSIBLE___")
    return status


def delete_tenant_cascade():
    """Delete test tenant created during bootstrap (cascades to all related data)."""
    print("  Limpiando datos de prueba en Supabase...")
    # Delete in reverse FK order
    for table in reversed(TABLES):
        if table in ("tenants",):
            continue
        supabase_request("DELETE", f"{table}?tenantId=neq.___IMPOSSIBLE___")
    # Delete tenants last
    supabase_request("DELETE", "tenants?id=neq.___IMPOSSIBLE___")
    print("  Borrado completo.")


def rows_to_dicts(cursor, rows):
    cols = [d[0] for d in cursor.description]
    result = []
    for row in rows:
        d = {col: val for col, val in zip(cols, row)}
        result.append(normalize_row(d))
    return result


def insert_batch(table, rows):
    status, body = supabase_request("POST", table, rows)
    if status not in (200, 201):
        raise Exception(f"INSERT {table} failed ({status}): {body[:300]}")


def migrate_table(conn, table):
    cur = conn.execute(f"SELECT * FROM {table}")
    rows = rows_to_dicts(cur, cur.fetchall())
    if not rows:
        print(f"  {table}: vacío, skip")
        return 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        insert_batch(table, batch)

    print(f"  {table}: {len(rows)} filas importadas")
    return len(rows)


def main():
    if not SERVICE_KEY:
        print("ERROR: Configura SUPABASE_SERVICE_ROLE_KEY en el entorno antes de ejecutar este script.")
        sys.exit(1)

    if not os.path.exists(DB_PATH):
        print(f"ERROR: No se encuentra {DB_PATH}")
        sys.exit(1)

    print(f"Conectando a SQLite: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    print("\n1. Limpiando Supabase (borrando datos previos)...")
    delete_tenant_cascade()

    print("\n2. Importando datos desde SQLite...")
    total = 0
    errors = []
    for table in TABLES:
        try:
            n = migrate_table(conn, table)
            total += n
        except Exception as e:
            import traceback
            errors.append(f"{table}: {e}")
            print(f"  ERROR {table}: {e}")
            traceback.print_exc()

    conn.close()

    print(f"\n=== RESULTADO ===")
    print(f"Total filas importadas: {total}")
    if errors:
        print(f"Errores ({len(errors)}):")
        for err in errors:
            print(f"  - {err}")
    else:
        print("Sin errores.")
    print("\nUsuario para login: lucy@lucy.com")
    print("Password: el mismo que usabas en local (bcrypt preservado).")


if __name__ == "__main__":
    main()
