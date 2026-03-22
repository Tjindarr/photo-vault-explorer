"""Reverse geocoding using OpenStreetMap Nominatim (free, no API key)."""

import time
import logging
import urllib.request
import urllib.parse
import json
from typing import Optional

logger = logging.getLogger(__name__)

# Rate limit: max 1 request per second per Nominatim usage policy
_last_request_time = 0.0
_cache: dict[str, dict] = {}


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
    for photos taken in the same area.
    """
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

        # Country
        result["country"] = addr.get("country")

        # City: try multiple keys in order of specificity
        for key in ("city", "town", "village", "municipality", "suburb", "county"):
            if key in addr:
                result["city"] = addr[key]
                break

        # Build a readable location name
        parts = []
        # Street/road
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
    return result
