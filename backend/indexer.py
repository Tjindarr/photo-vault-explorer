import os
import hashlib
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import exifread
from PIL import Image

logger = logging.getLogger(__name__)

PHOTOS_DIR = os.environ.get("PHOTOS_DIR", "/data/photos")
THUMB_DIR = os.environ.get("THUMB_DIR", "/data/thumbnails")
THUMB_SIZE = (400, 400)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic", ".heif", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"}
ALL_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


def file_hash(filepath: str, chunk_size: int = 8192) -> str:
    """Quick hash using file size + first chunk for speed."""
    stat = os.stat(filepath)
    h = hashlib.md5(f"{stat.st_size}:{stat.st_mtime}".encode())
    with open(filepath, "rb") as f:
        h.update(f.read(chunk_size))
    return h.hexdigest()


def extract_exif(filepath: str) -> dict:
    """Extract EXIF metadata from an image file."""
    meta = {
        "date_taken": None,
        "camera": None,
        "lens": None,
        "iso": None,
        "aperture": None,
        "shutter_speed": None,
        "gps_lat": None,
        "gps_lng": None,
        "width": 0,
        "height": 0,
    }

    try:
        with open(filepath, "rb") as f:
            tags = exifread.process_file(f, details=False)

        # Date
        for tag_name in ["EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"]:
            if tag_name in tags:
                dt_str = str(tags[tag_name])
                try:
                    dt = datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
                    meta["date_taken"] = dt.isoformat()
                except ValueError:
                    pass
                break

        # Camera
        make = str(tags.get("Image Make", "")).strip()
        model = str(tags.get("Image Model", "")).strip()
        if model:
            # Avoid duplicate make in model string
            if make and not model.lower().startswith(make.lower()):
                meta["camera"] = f"{make} {model}"
            else:
                meta["camera"] = model

        # Lens
        lens = tags.get("EXIF LensModel")
        if lens:
            meta["lens"] = str(lens)

        # ISO
        iso = tags.get("EXIF ISOSpeedRatings")
        if iso:
            try:
                meta["iso"] = int(str(iso))
            except ValueError:
                pass

        # Aperture
        aperture = tags.get("EXIF FNumber")
        if aperture:
            try:
                val = aperture.values[0]
                meta["aperture"] = f"f/{float(val):.1f}"
            except (IndexError, TypeError, ValueError):
                pass

        # Shutter speed
        exposure = tags.get("EXIF ExposureTime")
        if exposure:
            try:
                val = exposure.values[0]
                if float(val) < 1:
                    meta["shutter_speed"] = f"1/{int(1/float(val))}"
                else:
                    meta["shutter_speed"] = f"{float(val):.1f}s"
            except (IndexError, TypeError, ValueError, ZeroDivisionError):
                pass

        # GPS
        meta["gps_lat"], meta["gps_lng"] = _extract_gps(tags)

        # Dimensions from EXIF
        w = tags.get("EXIF ExifImageWidth") or tags.get("Image ImageWidth")
        h = tags.get("EXIF ExifImageLength") or tags.get("Image ImageLength")
        if w:
            try:
                meta["width"] = int(str(w))
            except ValueError:
                pass
        if h:
            try:
                meta["height"] = int(str(h))
            except ValueError:
                pass

    except Exception as e:
        logger.warning(f"EXIF extraction failed for {filepath}: {e}")

    # Fallback: get dimensions from PIL
    if meta["width"] == 0 or meta["height"] == 0:
        try:
            with Image.open(filepath) as img:
                meta["width"], meta["height"] = img.size
        except Exception:
            pass

    return meta


def _extract_gps(tags: dict) -> tuple[Optional[float], Optional[float]]:
    """Extract GPS coordinates from EXIF tags."""
    try:
        lat_tag = tags.get("GPS GPSLatitude")
        lat_ref = tags.get("GPS GPSLatitudeRef")
        lng_tag = tags.get("GPS GPSLongitude")
        lng_ref = tags.get("GPS GPSLongitudeRef")

        if not all([lat_tag, lat_ref, lng_tag, lng_ref]):
            return None, None

        lat = _gps_to_decimal(lat_tag.values, str(lat_ref))
        lng = _gps_to_decimal(lng_tag.values, str(lng_ref))
        return lat, lng
    except Exception:
        return None, None


def _gps_to_decimal(values, ref: str) -> float:
    d = float(values[0])
    m = float(values[1])
    s = float(values[2])
    decimal = d + m / 60.0 + s / 3600.0
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def generate_thumbnail(filepath: str, photo_id: str) -> Optional[str]:
    """Generate a thumbnail and return its relative path."""
    try:
        os.makedirs(THUMB_DIR, exist_ok=True)

        # Use subdirectories based on first 2 chars of ID to avoid too many files in one dir
        sub_dir = os.path.join(THUMB_DIR, photo_id[:2])
        os.makedirs(sub_dir, exist_ok=True)

        thumb_filename = f"{photo_id}.jpg"
        thumb_path = os.path.join(sub_dir, thumb_filename)

        if os.path.exists(thumb_path):
            return f"{photo_id[:2]}/{thumb_filename}"

        with Image.open(filepath) as img:
            img.thumbnail(THUMB_SIZE, Image.LANCZOS)
            # Convert to RGB if necessary (handles RGBA, P mode, etc.)
            if img.mode not in ("RGB",):
                img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=82, optimize=True)

        return f"{photo_id[:2]}/{thumb_filename}"
    except Exception as e:
        logger.warning(f"Thumbnail generation failed for {filepath}: {e}")
        return None


def scan_directory(photos_dir: str = PHOTOS_DIR) -> list[dict]:
    """Scan directory recursively and return photo metadata dicts."""
    results = []
    photos_path = Path(photos_dir)

    if not photos_path.exists():
        logger.warning(f"Photos directory does not exist: {photos_dir}")
        return results

    for filepath in photos_path.rglob("*"):
        if not filepath.is_file():
            continue

        ext = filepath.suffix.lower()
        if ext not in ALL_EXTENSIONS:
            continue

        rel_path = str(filepath.relative_to(photos_path))
        folder = str(filepath.parent.relative_to(photos_path))
        if folder == ".":
            folder = "Root"

        file_stat = filepath.stat()
        fhash = file_hash(str(filepath))
        photo_id = hashlib.md5(rel_path.encode()).hexdigest()[:16]
        is_video = ext in VIDEO_EXTENSIONS

        # Extract EXIF for images
        meta = {}
        if not is_video:
            meta = extract_exif(str(filepath))

        # Fallback date from file modification time
        if not meta.get("date_taken"):
            meta["date_taken"] = datetime.fromtimestamp(file_stat.st_mtime).isoformat()

        # Generate thumbnail for images
        thumb_path = None
        if not is_video:
            thumb_path = generate_thumbnail(str(filepath), photo_id)

        results.append({
            "id": photo_id,
            "filename": filepath.name,
            "path": rel_path,
            "folder": folder,
            "type": "video" if is_video else "image",
            "width": meta.get("width", 0),
            "height": meta.get("height", 0),
            "file_size": file_stat.st_size,
            "date_taken": meta.get("date_taken"),
            "location": meta.get("location"),
            "camera": meta.get("camera"),
            "lens": meta.get("lens"),
            "iso": meta.get("iso"),
            "aperture": meta.get("aperture"),
            "shutter_speed": meta.get("shutter_speed"),
            "gps_lat": meta.get("gps_lat"),
            "gps_lng": meta.get("gps_lng"),
            "thumbnail_path": thumb_path,
            "file_hash": fhash,
            "file_modified_at": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
        })

    return results
