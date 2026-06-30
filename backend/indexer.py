import os
import re
import hashlib
import subprocess
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional


# Match common date-in-filename patterns. Order matters: most specific first
# (date+time before date-only) so we capture the most precise timestamp.
#
# Camera / phone naming conventions covered:
#   Samsung:    20260526_212037, 20260526_212037000_iOS
#   Sony/Canon: 20170222-075200, DSC_20230101_120000
#   Android:    IMG_20230101_120000, IMG_20230101_120000_HDR,
#               VID_20230101_120000, PXL_20230101_120000123
#   Google:     PXL_20230101_120000123.MP, MVIMG_20230101_120000
#   Screenshot: Screenshot_20230101-120000, Screenshot 2023-01-01 12.00.00
#   WhatsApp:   IMG-20230101-WA0001, VID-20230101-WA0002
#   iOS export: 2023-01-01 12.00.00, 2023-01-01_12-00-00
#   Dotted:     2023.01.01_12.00.00, 2023.01.01-12.00.00
#   Underscored:2023_01_01_12_00_00
#   ISO basic:  20230101T120000
#   Older cams: 19990101_120000 (broadened year range)
_DSEP = r"[-_ T\.]"          # separator between date and time
_TSEP = r"[-_\.:]"           # separator between H/M/S components
_Y = r"(?P<Y>(?:19|20)\d{2})"
_FILENAME_DATE_PATTERNS = [
    # YYYY-MM-DD with time (any separators between components)
    re.compile(rf"{_Y}[-_\.](?P<m>\d{{2}})[-_\.](?P<d>\d{{2}}){_DSEP}(?P<H>\d{{2}}){_TSEP}(?P<M>\d{{2}}){_TSEP}(?P<S>\d{{2}})"),
    # YYYYMMDD with time (any separators), optional trailing ms / suffix
    re.compile(rf"{_Y}(?P<m>\d{{2}})(?P<d>\d{{2}}){_DSEP}(?P<H>\d{{2}})(?P<M>\d{{2}})(?P<S>\d{{2}})"),
    # YYYYMMDD with HHMM only (no seconds)
    re.compile(rf"{_Y}(?P<m>\d{{2}})(?P<d>\d{{2}}){_DSEP}(?P<H>\d{{2}})(?P<M>\d{{2}})"),
    # YYYY-MM-DD date only (WhatsApp, screenshots, etc.)
    re.compile(rf"{_Y}[-_\.](?P<m>\d{{2}})[-_\.](?P<d>\d{{2}})"),
    # YYYYMMDD date only
    re.compile(rf"{_Y}(?P<m>\d{{2}})(?P<d>\d{{2}})"),
]


def date_from_filename(name: str) -> Optional[str]:
    """Extract a capture date from a filename. Returns ISO string or None."""
    for pat in _FILENAME_DATE_PATTERNS:
        m = pat.search(name)
        if not m:
            continue
        try:
            g = m.groupdict()
            dt = datetime(
                int(g["Y"]), int(g["m"]), int(g["d"]),
                int(g.get("H") or 0), int(g.get("M") or 0), int(g.get("S") or 0),
            )
            return dt.isoformat()
        except (ValueError, KeyError):
            continue
    return None


import exifread
import imagehash
from PIL import Image, ExifTags, ImageOps
from pillow_heif import register_heif_opener

from geocoder import reverse_geocode

# Register HEIC/HEIF support with Pillow
register_heif_opener()

logger = logging.getLogger(__name__)

PHOTOS_DIR = os.environ.get("PHOTOS_DIR", "/data/photos")
THUMB_DIR = os.environ.get("THUMB_DIR", "/data/thumbnails")
THUMB_SIZE = (400, 400)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic", ".heif", ".avif"}
HEIF_EXTENSIONS = {".heic", ".heif"}
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

    suffix = Path(filepath).suffix.lower()

    try:
        # Only use exifread for JPEG/TIFF; everything else goes through Pillow
        if suffix not in (".jpg", ".jpeg", ".tiff", ".tif"):
            return _extract_exif_with_pillow(filepath, meta)

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

    if meta["width"] == 0 or meta["height"] == 0:
        try:
            with Image.open(filepath) as img:
                meta["width"], meta["height"] = img.size
        except Exception:
            pass

    return meta


def _extract_exif_with_pillow(filepath: str, meta: dict) -> dict:
    """Extract metadata for HEIC/HEIF using Pillow + pillow-heif."""
    try:
        with Image.open(filepath) as img:
            meta["width"], meta["height"] = img.size
            exif = img.getexif()

        if not exif:
            return meta

        exif_by_name = {
            ExifTags.TAGS.get(tag_id, str(tag_id)): value
            for tag_id, value in exif.items()
        }

        dt_str = exif_by_name.get("DateTimeOriginal") or exif_by_name.get("DateTimeDigitized") or exif_by_name.get("DateTime")
        if not dt_str:
            dt_str = _extract_date_from_xmp_or_png_text(filepath)
        if dt_str:
            parsed = _parse_exif_datetime(str(dt_str))
            if parsed:
                meta["date_taken"] = parsed

        make = str(exif_by_name.get("Make", "")).strip()
        model = str(exif_by_name.get("Model", "")).strip()
        if model:
            meta["camera"] = f"{make} {model}".strip() if make and not model.lower().startswith(make.lower()) else model

        lens = exif_by_name.get("LensModel")
        if lens:
            meta["lens"] = str(lens)

        iso = exif_by_name.get("ISOSpeedRatings")
        if iso is not None:
            try:
                meta["iso"] = int(iso)
            except (TypeError, ValueError):
                pass

        aperture = exif_by_name.get("FNumber")
        if aperture:
            try:
                meta["aperture"] = f"f/{float(aperture):.1f}"
            except (TypeError, ValueError, ZeroDivisionError):
                pass

        exposure = exif_by_name.get("ExposureTime")
        if exposure:
            try:
                exposure_value = float(exposure)
                meta["shutter_speed"] = f"1/{int(1/exposure_value)}" if exposure_value < 1 else f"{exposure_value:.1f}s"
            except (TypeError, ValueError, ZeroDivisionError):
                pass

        # GPS data from IFD
        try:
            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
            if gps_ifd:
                gps_by_name = {
                    ExifTags.GPSTAGS.get(k, str(k)): v
                    for k, v in gps_ifd.items()
                }
                lat = gps_by_name.get("GPSLatitude")
                lat_ref = gps_by_name.get("GPSLatitudeRef")
                lng = gps_by_name.get("GPSLongitude")
                lng_ref = gps_by_name.get("GPSLongitudeRef")
                if lat and lat_ref and lng and lng_ref:
                    meta["gps_lat"] = _pillow_gps_to_decimal(lat, lat_ref)
                    meta["gps_lng"] = _pillow_gps_to_decimal(lng, lng_ref)
        except Exception:
            pass

    except Exception as e:
        logger.warning(f"HEIC EXIF extraction failed for {filepath}: {e}")

    return meta


def _pillow_gps_to_decimal(coords, ref: str) -> float:
    """Convert Pillow GPS tuple (degrees, minutes, seconds) to decimal."""
    d = float(coords[0])
    m = float(coords[1])
    s = float(coords[2])
    decimal = d + m / 60.0 + s / 3600.0
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


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

        sub_dir = os.path.join(THUMB_DIR, photo_id[:2])
        os.makedirs(sub_dir, exist_ok=True)

        thumb_filename = f"{photo_id}.webp"
        thumb_path = os.path.join(sub_dir, thumb_filename)

        # Also accept legacy .jpg thumbnails
        legacy_path = os.path.join(sub_dir, f"{photo_id}.jpg")
        if os.path.exists(thumb_path):
            return f"{photo_id[:2]}/{thumb_filename}"
        if os.path.exists(legacy_path):
            return f"{photo_id[:2]}/{photo_id}.jpg"

        with Image.open(filepath) as img:
            img = ImageOps.exif_transpose(img)
            img.thumbnail(THUMB_SIZE, Image.LANCZOS)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            img.save(thumb_path, "WEBP", quality=80, method=4)

        return f"{photo_id[:2]}/{thumb_filename}"
    except Exception as e:
        logger.warning(f"Thumbnail generation failed for {filepath}: {e}")
        return None


def generate_thumbnail_and_phash(filepath: str, photo_id: str) -> tuple[Optional[str], Optional[str]]:
    """Generate thumbnail and compute pHash in a single image open. Returns (thumb_rel_path, phash_str)."""
    try:
        sub_dir = os.path.join(THUMB_DIR, photo_id[:2])
        os.makedirs(sub_dir, exist_ok=True)

        thumb_filename = f"{photo_id}.webp"
        thumb_path = os.path.join(sub_dir, thumb_filename)
        legacy_path = os.path.join(sub_dir, f"{photo_id}.jpg")

        # Check if thumbnail already exists
        thumb_exists = os.path.exists(thumb_path) or os.path.exists(legacy_path)
        existing_thumb = None
        if os.path.exists(thumb_path):
            existing_thumb = f"{photo_id[:2]}/{thumb_filename}"
        elif os.path.exists(legacy_path):
            existing_thumb = f"{photo_id[:2]}/{photo_id}.jpg"

        with Image.open(filepath) as img:
            # Compute pHash on original image
            phash_val = str(imagehash.phash(img))

            # Generate thumbnail if needed
            if not thumb_exists:
                img = ImageOps.exif_transpose(img)
                img.thumbnail(THUMB_SIZE, Image.LANCZOS)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGB")
                img.save(thumb_path, "WEBP", quality=80, method=4)
                existing_thumb = f"{photo_id[:2]}/{thumb_filename}"

        return existing_thumb, phash_val
    except Exception as e:
        logger.warning(f"Thumbnail+pHash failed for {filepath}: {e}")
        # Fall back to separate attempts
        thumb = generate_thumbnail(filepath, photo_id)
        phash_val = compute_phash(filepath)
        return thumb, phash_val


def compute_phash(filepath: str) -> Optional[str]:
    """Compute perceptual hash for an image file."""
    try:
        with Image.open(filepath) as img:
            h = imagehash.phash(img)
            return str(h)
    except Exception as e:
        logger.warning(f"pHash computation failed for {filepath}: {e}")
        return None


def generate_video_thumbnail(filepath: str, photo_id: str) -> Optional[str]:
    """Generate a thumbnail from a video file using ffmpeg (WebP output)."""
    try:
        os.makedirs(THUMB_DIR, exist_ok=True)

        sub_dir = os.path.join(THUMB_DIR, photo_id[:2])
        os.makedirs(sub_dir, exist_ok=True)

        thumb_filename = f"{photo_id}.webp"
        thumb_path = os.path.join(sub_dir, thumb_filename)

        # Accept legacy .jpg thumbnails
        legacy_path = os.path.join(sub_dir, f"{photo_id}.jpg")
        if os.path.exists(thumb_path):
            return f"{photo_id[:2]}/{thumb_filename}"
        if os.path.exists(legacy_path):
            return f"{photo_id[:2]}/{photo_id}.jpg"

        # Extract frame as PNG first, then convert to WebP via Pillow
        tmp_frame = os.path.join(sub_dir, f"{photo_id}_tmp.png")

        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", filepath,
                "-ss", "1", "-vframes", "1",
                "-vf", f"scale={THUMB_SIZE[0]}:{THUMB_SIZE[1]}:force_original_aspect_ratio=decrease",
                tmp_frame,
            ],
            capture_output=True, timeout=30,
        )

        if result.returncode != 0 or not os.path.exists(tmp_frame):
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", filepath,
                    "-vframes", "1",
                    "-vf", f"scale={THUMB_SIZE[0]}:{THUMB_SIZE[1]}:force_original_aspect_ratio=decrease",
                    tmp_frame,
                ],
                capture_output=True, timeout=30,
            )

        if os.path.exists(tmp_frame):
            with Image.open(tmp_frame) as img:
                if img.mode not in ("RGB",):
                    img = img.convert("RGB")
                img.save(thumb_path, "WEBP", quality=80, method=4)
            os.remove(tmp_frame)
            return f"{photo_id[:2]}/{thumb_filename}"

        return None
    except Exception as e:
        logger.warning(f"Video thumbnail generation failed for {filepath}: {e}")
        return None


def get_video_duration(filepath: str) -> Optional[float]:
    """Get video duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                filepath,
            ],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception as e:
        logger.warning(f"Failed to get video duration for {filepath}: {e}")
    return None


def scan_directory(photos_dir: str = PHOTOS_DIR, known_hashes: dict = None, geocode_lang: str = "en"):
    """Scan directory recursively. Yields None for skipped files, dict for new/changed."""
    if known_hashes is None:
        known_hashes = {}

    photos_path = Path(photos_dir)

    if not photos_path.exists():
        logger.warning(f"Photos directory does not exist: {photos_dir}")
        return

    for filepath in photos_path.rglob("*"):
        if not filepath.is_file():
            continue

        ext = filepath.suffix.lower()
        if ext not in ALL_EXTENSIONS:
            continue

        rel_path = str(filepath.relative_to(photos_path))

        try:
            file_stat = filepath.stat()
        except OSError as e:
            logger.warning(f"Cannot stat {filepath}: {e}")
            continue

        fhash = file_hash(str(filepath))

        photo_id = hashlib.md5(rel_path.encode()).hexdigest()[:16]
        expected_thumb_rel = f"{photo_id[:2]}/{photo_id}.jpg"
        expected_thumb_path = os.path.join(THUMB_DIR, expected_thumb_rel)

        # Skip only when the file is unchanged and its cached thumbnail still exists
        if rel_path in known_hashes and known_hashes[rel_path] == fhash and os.path.exists(expected_thumb_path):
            yield None
            continue

        folder = str(filepath.parent.relative_to(photos_path))
        if folder == ".":
            folder = "Root"

        photo_id = hashlib.md5(rel_path.encode()).hexdigest()[:16]
        is_video = ext in VIDEO_EXTENSIONS

        meta = {}
        if not is_video:
            meta = extract_exif(str(filepath))

        if not meta.get("date_taken"):
            # Try parsing the filename first (e.g. 20230101_120000_iOS.png)
            fname_date = date_from_filename(filepath.name)
            if fname_date:
                meta["date_taken"] = fname_date
            else:
                # Fallback chain: mtime is usually preserved when copying, so
                # prefer it over birthtime/ctime which reflect when the file
                # landed on this filesystem.
                ts = file_stat.st_mtime or getattr(file_stat, "st_birthtime", None) or file_stat.st_ctime
                meta["date_taken"] = datetime.fromtimestamp(ts).isoformat()


        thumb_path = None
        duration = None
        phash = None
        if is_video:
            thumb_path = generate_video_thumbnail(str(filepath), photo_id)
            duration = get_video_duration(str(filepath))
        else:
            # Single image open for both thumbnail and pHash
            thumb_path, phash = generate_thumbnail_and_phash(str(filepath), photo_id)

        # Reverse geocode GPS coordinates
        geo = {"country": None, "city": None, "location_name": None}
        gps_lat = meta.get("gps_lat")
        gps_lng = meta.get("gps_lng")
        if gps_lat is not None and gps_lng is not None:
            geo = reverse_geocode(gps_lat, gps_lng, lang=geocode_lang)

        location = geo.get("location_name") or meta.get("location")

        yield {
            "id": photo_id,
            "filename": filepath.name,
            "path": rel_path,
            "folder": folder,
            "type": "video" if is_video else "image",
            "width": meta.get("width", 0),
            "height": meta.get("height", 0),
            "file_size": file_stat.st_size,
            "duration": duration,
            "date_taken": meta.get("date_taken"),
            "location": location,
            "camera": meta.get("camera"),
            "lens": meta.get("lens"),
            "iso": meta.get("iso"),
            "aperture": meta.get("aperture"),
            "shutter_speed": meta.get("shutter_speed"),
            "gps_lat": gps_lat,
            "gps_lng": gps_lng,
            "thumbnail_path": thumb_path,
            "file_hash": fhash,
            "phash": phash,
            "country": geo.get("country"),
            "city": geo.get("city"),
            "file_modified_at": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
        }
