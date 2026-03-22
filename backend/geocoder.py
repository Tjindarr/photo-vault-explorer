"""Reverse geocoding using OpenStreetMap Nominatim (free, no API key).

Results are persisted to a SQLite table so reindexes skip already-geocoded
grid cells. The in-memory cache is populated from DB on first use.
"""

import os
import time
import logging
import urllib.request
import json
import sqlite3
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DB_PATH", "/data/db/snapvault.db")

# Rate limit: max 1 request per second per Nominatim usage policy
_last_request_time = 0.0
_cache: dict[str, dict] | None = None  # lazy-loaded from DB


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _ensure_table():
    conn = _get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS geocode_cache (
            grid_key TEXT PRIMARY KEY,
            country TEXT,
            city TEXT,
            location_name TEXT
        )
    """)
    conn.commit()
    conn.close()


def _load_cache() -> dict[str, dict]:
    """Load entire geocode cache from DB into memory."""
    _ensure_table()
    conn = _get_db()
    rows = conn.execute("SELECT grid_key, country, city, location_name FROM geocode_cache").fetchall()
    conn.close()
    return {
        row["grid_key"]: {
            "country": row["country"],
            "city": row["city"],
            "location_name": row["location_name"],
        }
        for row in rows
    }


def _save_to_db(grid_key: str, result: dict):
    """Persist a geocode result to DB."""
    try:
        conn = _get_db()
        conn.execute(
            "INSERT OR REPLACE INTO geocode_cache (grid_key, country, city, location_name) VALUES (?, ?, ?, ?)",
            (grid_key, result.get("country"), result.get("city"), result.get("location_name")),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.debug(f"Failed to save geocode cache: {e}")


def _rate_limit():
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)
    _last_request_time = time.time()


def reverse_geocode(lat: float, lng: float) -> dict:
    """Reverse geocode coordinates to country/city/street.

    Uses a grid-based cache key (rounded to ~1km) to avoid redundant lookups
    for photos taken in the same area. Results persist across reindexes.
    """
    global _cache
    if _cache is None:
        _cache = _load_cache()
        logger.info(f"Loaded {len(_cache)} cached geocode entries from DB")

    # Round to ~1km grid to cache nearby locations together
    cache_key = f"{lat:.3f},{lng:.3f}"
    if cache_key in _cache:
        return _cache[cache_key]

    result = {"country": None, "city": None, "location_name": None}

    try:
        _rate_limit()
        url = (
            f"https://nominatim.openstreetmap.org/reverse?"
            f"lat={lat}&lon={lng}&format=json&addressdetails=1&zoom=16"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "ImgVault/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        addr = data.get("address", {})

        result["country"] = addr.get("country")

        for key in ("city", "town", "village", "municipality", "suburb", "county"):
            if key in addr:
                result["city"] = addr[key]
                break

        parts = []
        road = addr.get("road") or addr.get("pedestrian") or addr.get("neighbourhood")
        if road:
            parts.append(road)
        if result["city"]:
            parts.append(result["city"])
        if result["country"]:
            parts.append(result["country"])

        result["location_name"] = ", ".join(parts) if parts else None

    except Exception as e:
        logger.debug(f"Reverse geocode failed for {lat},{lng}: {e}")

    _cache[cache_key] = result
    _save_to_db(cache_key, result)
    return result
