import sqlite3
import os
from typing import Optional

DB_PATH = os.environ.get("DB_PATH", "/data/db/snapvault.db")


def get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            folder TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'image',
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            date_taken TEXT,
            location TEXT,
            camera TEXT,
            lens TEXT,
            iso INTEGER,
            aperture TEXT,
            shutter_speed TEXT,
            gps_lat REAL,
            gps_lng REAL,
            thumbnail_path TEXT,
            file_hash TEXT,
            indexed_at TEXT DEFAULT (datetime('now')),
            file_modified_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder);
        CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(date_taken);
        CREATE INDEX IF NOT EXISTS idx_photos_location ON photos(location);
        CREATE INDEX IF NOT EXISTS idx_photos_camera ON photos(camera);
        CREATE INDEX IF NOT EXISTS idx_photos_type ON photos(type);
        CREATE INDEX IF NOT EXISTS idx_photos_path ON photos(path);
        CREATE INDEX IF NOT EXISTS idx_photos_file_hash ON photos(file_hash);

        CREATE TABLE IF NOT EXISTS trash (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            original_path TEXT NOT NULL,
            trash_path TEXT NOT NULL,
            folder TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'image',
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            date_taken TEXT,
            location TEXT,
            camera TEXT,
            lens TEXT,
            iso INTEGER,
            aperture TEXT,
            shutter_speed TEXT,
            gps_lat REAL,
            gps_lng REAL,
            thumbnail_path TEXT,
            file_hash TEXT,
            file_modified_at TEXT,
            deleted_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at);
    """)
    conn.commit()
    conn.close()


def upsert_photo(photo: dict):
    conn = get_db()
    conn.execute("""
        INSERT INTO photos (id, filename, path, folder, type, width, height,
            file_size, date_taken, location, camera, lens, iso, aperture,
            shutter_speed, gps_lat, gps_lng, thumbnail_path, file_hash, file_modified_at)
        VALUES (:id, :filename, :path, :folder, :type, :width, :height,
            :file_size, :date_taken, :location, :camera, :lens, :iso, :aperture,
            :shutter_speed, :gps_lat, :gps_lng, :thumbnail_path, :file_hash, :file_modified_at)
        ON CONFLICT(path) DO UPDATE SET
            filename=:filename, folder=:folder, type=:type, width=:width, height=:height,
            file_size=:file_size, date_taken=:date_taken, location=:location, camera=:camera,
            lens=:lens, iso=:iso, aperture=:aperture, shutter_speed=:shutter_speed,
            gps_lat=:gps_lat, gps_lng=:gps_lng, thumbnail_path=:thumbnail_path,
            file_hash=:file_hash, file_modified_at=:file_modified_at,
            indexed_at=datetime('now')
    """, photo)
    conn.commit()
    conn.close()


def remove_missing_photos(existing_paths: set[str]):
    """Remove DB entries for files that no longer exist on disk. Returns list of removed (path, id, thumbnail_path)."""
    conn = get_db()
    cursor = conn.execute("SELECT path, id, thumbnail_path FROM photos")
    db_entries = {row["path"]: (row["id"], row["thumbnail_path"]) for row in cursor.fetchall()}
    removed_paths = set(db_entries.keys()) - existing_paths
    removed_info = []
    if removed_paths:
        for p in removed_paths:
            photo_id, thumb = db_entries[p]
            removed_info.append({"path": p, "id": photo_id, "thumbnail_path": thumb})
        conn.executemany("DELETE FROM photos WHERE path = ?", [(p,) for p in removed_paths])
        conn.commit()
    conn.close()
    return removed_info


def remove_photos_by_paths(paths: list[str]):
    """Remove specific DB entries by path. Returns list of removed (path, id, thumbnail_path)."""
    if not paths:
        return []

    unique_paths = list(dict.fromkeys(paths))
    placeholders = ",".join("?" for _ in unique_paths)

    conn = get_db()
    rows = conn.execute(
        f"SELECT path, id, thumbnail_path FROM photos WHERE path IN ({placeholders})",
        unique_paths,
    ).fetchall()

    removed_info = [
        {"path": row["path"], "id": row["id"], "thumbnail_path": row["thumbnail_path"]}
        for row in rows
    ]

    if removed_info:
        conn.executemany("DELETE FROM photos WHERE path = ?", [(row["path"],) for row in removed_info])
        conn.commit()

    conn.close()
    return removed_info


def search_photos(
    query: Optional[str] = None,
    folder: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    photo_type: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[dict], int]:
    conn = get_db()
    conditions = []
    params = []

    if query:
        conditions.append(
            "(filename LIKE ? OR location LIKE ? OR camera LIKE ? OR folder LIKE ?)"
        )
        q = f"%{query}%"
        params.extend([q, q, q, q])

    if folder:
        conditions.append("folder LIKE ?")
        params.append(f"{folder}%")

    if date_from:
        conditions.append("date_taken >= ?")
        params.append(date_from)

    if date_to:
        conditions.append("date_taken <= ?")
        params.append(date_to)

    if photo_type:
        conditions.append("type = ?")
        params.append(photo_type)

    where = " AND ".join(conditions) if conditions else "1=1"

    # Get total count
    count_row = conn.execute(f"SELECT COUNT(*) as cnt FROM photos WHERE {where}", params).fetchone()
    total = count_row["cnt"]

    # Get page
    rows = conn.execute(
        f"SELECT * FROM photos WHERE {where} ORDER BY date_taken DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    conn.close()
    return [dict(r) for r in rows], total


def get_folder_tree() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT folder, COUNT(*) as count FROM photos GROUP BY folder ORDER BY folder"
    ).fetchall()
    conn.close()

    # Build tree structure
    tree: dict = {}
    for row in rows:
        parts = row["folder"].split("/")
        current = tree
        for part in parts:
            if part not in current:
                current[part] = {"_count": 0, "_children": {}}
            current[part]["_count"] += row["count"]
            current = current[part]["_children"]

    def build_nodes(subtree: dict, prefix: str = "") -> list[dict]:
        nodes = []
        for name, data in sorted(subtree.items()):
            path = f"{prefix}/{name}" if prefix else name
            nodes.append({
                "path": path,
                "name": name,
                "photoCount": data["_count"],
                "children": build_nodes(data["_children"], path),
            })
        return nodes

    return build_nodes(tree)


def get_photo_by_id(photo_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_indexed_hashes() -> dict[str, str]:
    """Return a dict of {path: file_hash} for all indexed photos."""
    conn = get_db()
    rows = conn.execute("SELECT path, file_hash FROM photos").fetchall()
    conn.close()
    return {row["path"]: row["file_hash"] for row in rows}


def get_stats() -> dict:
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) as cnt FROM photos").fetchone()["cnt"]
    images = conn.execute("SELECT COUNT(*) as cnt FROM photos WHERE type='image'").fetchone()["cnt"]
    videos = conn.execute("SELECT COUNT(*) as cnt FROM photos WHERE type='video'").fetchone()["cnt"]
    total_size = conn.execute("SELECT COALESCE(SUM(file_size), 0) as s FROM photos").fetchone()["s"]
    locations = conn.execute("SELECT COUNT(DISTINCT location) as cnt FROM photos WHERE location IS NOT NULL").fetchone()["cnt"]

    by_camera = [dict(r) for r in conn.execute(
        "SELECT camera as name, COUNT(*) as count FROM photos WHERE camera IS NOT NULL GROUP BY camera ORDER BY count DESC"
    ).fetchall()]

    by_location = [dict(r) for r in conn.execute(
        "SELECT location as name, COUNT(*) as count FROM photos WHERE location IS NOT NULL GROUP BY location ORDER BY count DESC"
    ).fetchall()]

    by_year = [dict(r) for r in conn.execute(
        "SELECT strftime('%Y', date_taken) as name, COUNT(*) as count FROM photos WHERE date_taken IS NOT NULL GROUP BY name ORDER BY name"
    ).fetchall()]

    conn.close()
    return {
        "total": total,
        "images": images,
        "videos": videos,
        "totalSize": total_size,
        "locations": locations,
        "byCamera": by_camera,
        "byLocation": by_location,
        "byYear": by_year,
    }


def get_map_photos(
    query: Optional[str] = None,
    folder: Optional[str] = None,
    limit: int = 20000,
) -> list[dict]:
    conn = get_db()
    conditions = ["gps_lat IS NOT NULL", "gps_lng IS NOT NULL"]
    params = []

    if query:
        conditions.append(
            "(filename LIKE ? OR location LIKE ? OR camera LIKE ? OR folder LIKE ?)"
        )
        q = f"%{query}%"
        params.extend([q, q, q, q])

    if folder:
        conditions.append("folder LIKE ?")
        params.append(f"{folder}%")

    where = " AND ".join(conditions)

    rows = conn.execute(
        f"""
        SELECT id, filename, path, folder, type, width, height, file_size,
               date_taken, location, camera, lens, iso, aperture,
               shutter_speed, gps_lat, gps_lng, thumbnail_path, file_modified_at
        FROM photos
        WHERE {where}
        ORDER BY date_taken DESC
        LIMIT ?
        """,
        params + [limit],
    ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


def get_duplicate_photos() -> list[dict]:
    """Find duplicate photos by file_hash. Returns all photos grouped by hash."""
    conn = get_db()
    # Find hashes that appear more than once
    dup_hashes = conn.execute(
        "SELECT file_hash FROM photos WHERE file_hash IS NOT NULL GROUP BY file_hash HAVING COUNT(*) > 1"
    ).fetchall()

    if not dup_hashes:
        conn.close()
        return []

    hash_list = [row["file_hash"] for row in dup_hashes]
    placeholders = ",".join("?" for _ in hash_list)
    rows = conn.execute(
        f"SELECT * FROM photos WHERE file_hash IN ({placeholders}) ORDER BY file_hash, date_taken DESC",
        hash_list,
    ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


def delete_photos_by_ids(photo_ids: list[str]) -> list[dict]:
    """Delete photos by ID. Returns removed entries with full data for trash."""
    if not photo_ids:
        return []

    unique_ids = list(dict.fromkeys(photo_ids))
    placeholders = ",".join("?" for _ in unique_ids)

    conn = get_db()
    rows = conn.execute(
        f"SELECT * FROM photos WHERE id IN ({placeholders})",
        unique_ids,
    ).fetchall()

    removed_info = [dict(row) for row in rows]

    if removed_info:
        conn.executemany("DELETE FROM photos WHERE id = ?", [(row["id"],) for row in removed_info])
        conn.commit()

    conn.close()
    return removed_info


# ── Trash operations ──────────────────────────────────────────────

def add_to_trash(entry: dict):
    """Insert a record into the trash table."""
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO trash (id, filename, original_path, trash_path, folder, type,
            width, height, file_size, date_taken, location, camera, lens, iso, aperture,
            shutter_speed, gps_lat, gps_lng, thumbnail_path, file_hash, file_modified_at)
        VALUES (:id, :filename, :original_path, :trash_path, :folder, :type,
            :width, :height, :file_size, :date_taken, :location, :camera, :lens, :iso, :aperture,
            :shutter_speed, :gps_lat, :gps_lng, :thumbnail_path, :file_hash, :file_modified_at)
    """, entry)
    conn.commit()
    conn.close()


def get_trash_items() -> list[dict]:
    """Get all items in the trash, ordered by deletion date."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM trash ORDER BY deleted_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_trash_item_by_id(item_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM trash WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def remove_from_trash(item_ids: list[str]) -> list[dict]:
    """Remove items from trash table. Returns the removed entries."""
    if not item_ids:
        return []
    placeholders = ",".join("?" for _ in item_ids)
    conn = get_db()
    rows = conn.execute(f"SELECT * FROM trash WHERE id IN ({placeholders})", item_ids).fetchall()
    removed = [dict(r) for r in rows]
    if removed:
        conn.executemany("DELETE FROM trash WHERE id = ?", [(r["id"],) for r in removed])
        conn.commit()
    conn.close()
    return removed


def purge_expired_trash(days: int = 30) -> list[dict]:
    """Remove trash items older than N days. Returns purged entries."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM trash WHERE deleted_at < datetime('now', ?)",
        (f"-{days} days",),
    ).fetchall()
    expired = [dict(r) for r in rows]
    if expired:
        conn.executemany("DELETE FROM trash WHERE id = ?", [(r["id"],) for r in expired])
        conn.commit()
    conn.close()
    return expired
