import os
import shutil
import time
import logging
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from contextlib import asynccontextmanager

from pydantic import BaseModel
from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from database import (
    init_db, upsert_photo, upsert_photos_batch, search_photos, get_folder_tree, get_photo_by_id,
    get_stats, remove_missing_photos, get_indexed_hashes, remove_photos_by_paths,
    get_map_photos, get_map_clusters, get_map_countries, get_map_cities,
    get_duplicate_photos, delete_photos_by_ids,
    add_to_trash, get_trash_items, get_trash_item_by_id, remove_from_trash, purge_expired_trash,
    get_cleanup_data,
    create_album, get_albums, get_album_by_id, update_album, delete_album,
    add_photos_to_album, remove_photos_from_album, get_album_photos, get_recent_photos,
    get_setting, set_setting, get_all_settings,
)
from indexer import scan_directory, PHOTOS_DIR, THUMB_DIR, ALL_EXTENSIONS, generate_thumbnail, generate_video_thumbnail

logger = logging.getLogger("snapvault")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Track indexing state
indexing_status = {"running": False, "progress": 0, "total": 0, "last_run": None}

TRANSCODE_DIR = os.environ.get("TRANSCODE_DIR", "/data/transcoded")
os.makedirs(TRANSCODE_DIR, exist_ok=True)

CONVERT_DIR = os.environ.get("CONVERT_DIR", "/data/converted")
os.makedirs(CONVERT_DIR, exist_ok=True)

TRASH_DIR = os.environ.get("TRASH_DIR", "/data/trash")
os.makedirs(TRASH_DIR, exist_ok=True)

# Extensions that need transcoding for browser compatibility
NEEDS_TRANSCODE = {".mov", ".avi", ".mkv", ".wmv", ".flv", ".m4v"}
# Image formats that browsers can't display natively — convert to JPEG
NEEDS_IMAGE_CONVERT = {".heic", ".heif", ".tiff", ".tif", ".bmp", ".avif"}


def get_current_media_paths() -> set[str]:
    """Return all current media paths on disk relative to PHOTOS_DIR."""
    current_paths = set()
    for root, _, files in os.walk(PHOTOS_DIR):
        for filename in files:
            if os.path.splitext(filename)[1].lower() in ALL_EXTENSIONS:
                full_path = os.path.join(root, filename)
                current_paths.add(os.path.relpath(full_path, PHOTOS_DIR))
    return current_paths


BATCH_SIZE = 50  # Commit every N photos
WORKER_THREADS = 4  # Parallel file processing threads


def _process_single_file(args):
    """Process a single file: extract EXIF, thumbnail, pHash, geocode. Runs in thread pool."""
    filepath_str, photos_dir, known_hashes, geocode_lang = args
    # Re-use scan logic but for a single file
    from indexer import (
        file_hash, extract_exif, generate_thumbnail_and_phash,
        generate_video_thumbnail, get_video_duration, reverse_geocode,
        IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, THUMB_DIR,
    )
    from pathlib import Path
    import hashlib as _hashlib
    from datetime import datetime as _dt

    filepath = Path(filepath_str)
    photos_path = Path(photos_dir)
    ext = filepath.suffix.lower()
    rel_path = str(filepath.relative_to(photos_path))

    try:
        file_stat = filepath.stat()
    except OSError:
        return None

    fhash = file_hash(str(filepath))

    photo_id = _hashlib.md5(rel_path.encode()).hexdigest()[:16]

    # Check for existing thumbnail (webp or jpg)
    import os as _os
    expected_webp = _os.path.join(THUMB_DIR, photo_id[:2], f"{photo_id}.webp")
    expected_jpg = _os.path.join(THUMB_DIR, photo_id[:2], f"{photo_id}.jpg")
    if rel_path in known_hashes and known_hashes[rel_path] == fhash and (
        _os.path.exists(expected_webp) or _os.path.exists(expected_jpg)
    ):
        return None  # Skip unchanged

    folder = str(filepath.parent.relative_to(photos_path))
    if folder == ".":
        folder = "Root"

    is_video = ext in VIDEO_EXTENSIONS

    meta = {}
    if not is_video:
        meta = extract_exif(str(filepath))

    if not meta.get("date_taken"):
        meta["date_taken"] = _dt.fromtimestamp(file_stat.st_mtime).isoformat()

    thumb_path = None
    duration = None
    phash = None
    if is_video:
        thumb_path = generate_video_thumbnail(str(filepath), photo_id)
        duration = get_video_duration(str(filepath))
    else:
        thumb_path, phash = generate_thumbnail_and_phash(str(filepath), photo_id)

    # Reverse geocode GPS coordinates
    geo = {"country": None, "city": None, "location_name": None}
    gps_lat = meta.get("gps_lat")
    gps_lng = meta.get("gps_lng")
    if gps_lat is not None and gps_lng is not None:
        from geocoder import reverse_geocode
        geo = reverse_geocode(gps_lat, gps_lng, lang=geocode_lang)

    location = geo.get("location_name") or meta.get("location")

    return {
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
        "file_modified_at": _dt.fromtimestamp(file_stat.st_mtime).isoformat(),
    }


def run_indexer(force_full: bool = False):
    """Background indexing task with parallel processing and batch DB commits."""
    indexing_status["running"] = True
    indexing_status["progress"] = 0
    indexing_status["total"] = 0
    logger.info(f"Starting index scan of {PHOTOS_DIR}...")

    try:
        # Auto-purge expired trash items (>30 days)
        expired = purge_expired_trash(30)
        for entry in expired:
            trash_file = os.path.join(TRASH_DIR, entry["trash_path"])
            if os.path.exists(trash_file):
                os.remove(trash_file)
            _cleanup_cached_files(entry["id"], entry.get("thumbnail_path"))
        if expired:
            logger.info(f"Purged {len(expired)} expired trash items")

        # Load existing indexed hashes to skip unchanged files
        known_hashes = {} if force_full else get_indexed_hashes()
        if force_full:
            logger.info("Running full reindex; all files will be reprocessed")
        else:
            logger.info(f"Found {len(known_hashes)} already-indexed files in DB")

        current_paths = get_current_media_paths()
        logger.info(f"Found {len(current_paths)} media files on disk")

        # Collect all file paths to process
        from pathlib import Path as _Path
        from indexer import ALL_EXTENSIONS as _ALL_EXT
        all_files = []
        photos_path = _Path(PHOTOS_DIR)
        for fp in photos_path.rglob("*"):
            if fp.is_file() and fp.suffix.lower() in _ALL_EXT:
                all_files.append(str(fp))

        indexing_status["total"] = len(all_files)
        logger.info(f"Processing {len(all_files)} files with {WORKER_THREADS} threads...")

        geocode_lang = get_setting("geocode_language", "en")
        count = 0
        skipped = 0
        batch = []

        with ThreadPoolExecutor(max_workers=WORKER_THREADS) as executor:
            futures = {
                executor.submit(_process_single_file, (fp, PHOTOS_DIR, known_hashes, geocode_lang)): fp
                for fp in all_files
            }

            for future in as_completed(futures):
                try:
                    result = future.result()
                except Exception as e:
                    logger.warning(f"Processing failed for {futures[future]}: {e}")
                    skipped += 1
                    indexing_status["progress"] = count + skipped
                    continue

                if result is None:
                    skipped += 1
                    indexing_status["progress"] = count + skipped
                    continue

                batch.append(result)
                count += 1
                indexing_status["progress"] = count + skipped

                # Flush batch
                if len(batch) >= BATCH_SIZE:
                    upsert_photos_batch(batch)
                    batch = []
                    if count % 200 == 0:
                        logger.info(f"Indexed {count} new/changed files ({skipped} skipped)...")

        # Flush remaining
        if batch:
            upsert_photos_batch(batch)

        # Clean up removed files
        removed = remove_missing_photos(current_paths)
        if removed:
            for entry in removed:
                _cleanup_cached_files(entry["id"], entry.get("thumbnail_path"))
            logger.info(f"Removed {len(removed)} entries + files for deleted photos")

        indexing_status["last_run"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        logger.info(f"Indexing complete: {count} new/changed, {skipped} skipped")

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
    finally:
        indexing_status["running"] = False


def _cleanup_cached_files(photo_id: str, thumbnail_path: Optional[str] = None):
    """Remove thumbnail, transcode, and convert cache for a photo."""
    if thumbnail_path:
        thumb_file = os.path.join(THUMB_DIR, thumbnail_path)
        if os.path.exists(thumb_file):
            os.remove(thumb_file)
    transcode_file = os.path.join(TRANSCODE_DIR, f"{photo_id}.mp4")
    if os.path.exists(transcode_file):
        os.remove(transcode_file)
    convert_file = os.path.join(CONVERT_DIR, f"{photo_id}.jpg")
    if os.path.exists(convert_file):
        os.remove(convert_file)


def purge_stale_photos(paths: list[str]) -> list[dict]:
    """Delete stale DB rows and cached files for media paths that no longer exist."""
    removed = remove_photos_by_paths(paths)
    for entry in removed:
        _cleanup_cached_files(entry["id"], entry.get("thumbnail_path"))
    return removed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: init DB and run initial index
    init_db()
    thread = threading.Thread(target=run_indexer, daemon=True)
    thread.start()
    yield
    # Shutdown: nothing needed


app = FastAPI(title="SnapVault API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/photos")
def list_photos(
    q: str = Query(None, description="Search query"),
    folder: str = Query(None, description="Filter by folder path"),
    date_from: str = Query(None, description="Filter from date (ISO format)"),
    date_to: str = Query(None, description="Filter to date (ISO format)"),
    type: str = Query(None, description="Filter by type: image or video"),
    limit: int = Query(200, ge=1, le=50000),
    offset: int = Query(0, ge=0),
):
    photos, total = search_photos(
        query=q, folder=folder, date_from=date_from, date_to=date_to,
        photo_type=type, limit=limit, offset=offset,
    )

    stale_paths = [
        p["path"] for p in photos
        if not os.path.exists(os.path.join(PHOTOS_DIR, p["path"]))
    ]
    if stale_paths:
        purge_stale_photos(stale_paths)
        photos = [p for p in photos if p["path"] not in set(stale_paths)]
        total = max(0, total - len(set(stale_paths)))

    # Format for frontend
    items = []
    for p in photos:
        items.append(_format_photo(p))

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.get("/api/folders")
def list_folders():
    return get_folder_tree()


@app.get("/api/map-photos")
def list_map_photos(
    q: str = Query(None, description="Search query"),
    folder: str = Query(None, description="Filter by folder path"),
    limit: int = Query(20000, ge=1, le=100000),
):
    photos = get_map_photos(query=q, folder=folder, limit=limit)

    stale_paths = [
        p["path"] for p in photos
        if not os.path.exists(os.path.join(PHOTOS_DIR, p["path"]))
    ]
    if stale_paths:
        purge_stale_photos(stale_paths)
        stale_path_set = set(stale_paths)
        photos = [p for p in photos if p["path"] not in stale_path_set]

    items = [_format_photo(p) for p in photos]
    return {"items": items, "total": len(items)}


@app.get("/api/map-clusters")
def list_map_clusters(
    q: str = Query(None),
    folder: str = Query(None),
    country: str = Query(None),
    city: str = Query(None),
):
    """Return pre-clustered map data for fast rendering."""
    clusters = get_map_clusters(query=q, folder=folder, country=country, city=city)
    return {
        "clusters": [
            {
                "id": c["cluster_key"],
                "label": c["label"],
                "country": c["country"],
                "city": c["city"],
                "lat": c["lat"],
                "lng": c["lng"],
                "count": c["count"],
                "thumbnailUrl": f"/api/thumbnails/{c['sample_id']}" if c.get("sample_thumb") else None,
            }
            for c in clusters
        ],
        "total": sum(c["count"] for c in clusters),
    }


@app.get("/api/map-countries")
def list_map_countries():
    return get_map_countries()


@app.get("/api/map-cities")
def list_map_cities(country: str = Query(None)):
    return get_map_cities(country=country)


@app.get("/api/photos/{photo_id}")
def get_photo(photo_id: str):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo["path"])
    if not os.path.exists(filepath):
        purge_stale_photos([photo["path"]])
        raise HTTPException(status_code=404, detail="Photo not found")

    return photo


@app.get("/api/thumbnails/{photo_id}")
def get_thumbnail(photo_id: str):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo["path"])
    if not os.path.exists(filepath):
        purge_stale_photos([photo["path"]])
        raise HTTPException(status_code=404, detail="File not found on disk")

    thumb_path = None
    if photo.get("thumbnail_path"):
        thumb_path = os.path.join(THUMB_DIR, photo["thumbnail_path"])

    if not thumb_path or not os.path.exists(thumb_path):
        regenerated_rel = (
            generate_video_thumbnail(filepath, photo_id)
            if photo.get("type") == "video"
            else generate_thumbnail(filepath, photo_id)
        )
        if not regenerated_rel:
            raise HTTPException(status_code=404, detail="Thumbnail file missing")
        thumb_path = os.path.join(THUMB_DIR, regenerated_rel)

    media_type = "image/webp" if thumb_path.endswith(".webp") else "image/jpeg"
    return FileResponse(thumb_path, media_type=media_type, headers={"Cache-Control": "public, max-age=2592000"})


def convert_image_to_jpeg(source: str, photo_id: str) -> Optional[str]:
    """Convert HEIC/TIFF/BMP etc to JPEG for browser compatibility. Cached."""
    out_path = os.path.join(CONVERT_DIR, f"{photo_id}.jpg")
    if os.path.exists(out_path):
        return out_path
    try:
        from PIL import Image, ImageOps
        from pillow_heif import register_heif_opener
        register_heif_opener()
        with Image.open(source) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB",):
                img = img.convert("RGB")
            img.save(out_path, "JPEG", quality=90, optimize=True)
        return out_path
    except Exception as e:
        logger.warning(f"Image conversion failed for {source}: {e}")
        return None


def ranged_file_response(filepath: str, media_type: str, request: Request):
    """Serve a file with HTTP Range support for efficient video streaming."""
    file_size = os.path.getsize(filepath)
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(filepath, media_type=media_type, headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=604800",
        })

    # Parse Range: bytes=start-end
    range_spec = range_header.replace("bytes=", "").strip()
    parts = range_spec.split("-")
    start = int(parts[0]) if parts[0] else 0
    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
    end = min(end, file_size - 1)
    length = end - start + 1

    def file_chunk():
        with open(filepath, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        file_chunk(),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(length),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=604800",
        },
    )


def transcode_to_mp4(source: str, photo_id: str) -> Optional[str]:
    """Transcode a video to H.264 MP4 for browser compatibility. Returns cached path."""
    out_path = os.path.join(TRANSCODE_DIR, f"{photo_id}.mp4")
    if os.path.exists(out_path):
        return out_path
    try:
        subprocess.run(
            [
                "ffmpeg", "-i", source,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                "-y", out_path,
            ],
            capture_output=True, timeout=600,
        )
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            return out_path
        return None
    except Exception as e:
        logger.warning(f"Transcode failed for {source}: {e}")
        return None


@app.get("/api/media/{photo_id}")
def get_media(photo_id: str, request: Request):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo["path"])
    if not os.path.exists(filepath):
        purge_stale_photos([photo["path"]])
        raise HTTPException(status_code=404, detail="File not found on disk")

    ext = os.path.splitext(filepath)[1].lower()

    # Convert unsupported image formats to JPEG
    if ext in NEEDS_IMAGE_CONVERT:
        converted = convert_image_to_jpeg(filepath, photo_id)
        if converted:
            return FileResponse(converted, media_type="image/jpeg", headers={
                "Cache-Control": "public, max-age=2592000",
            })

    # Transcode non-MP4 videos to H.264 for browser compatibility
    if ext in NEEDS_TRANSCODE:
        transcoded = transcode_to_mp4(filepath, photo_id)
        if transcoded:
            return ranged_file_response(transcoded, "video/mp4", request)
        # Fall through to serve original if transcode fails

    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
        ".tiff": "image/tiff", ".tif": "image/tiff", ".heic": "image/heic",
        ".avif": "image/avif",
        ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska", ".webm": "video/webm", ".m4v": "video/mp4",
    }

    mt = media_types.get(ext, "application/octet-stream")

    # Use range response for all video files
    if mt.startswith("video/"):
        return ranged_file_response(filepath, mt, request)

    return FileResponse(filepath, media_type=mt, headers={"Cache-Control": "public, max-age=604800"})


@app.get("/api/stats")
def stats():
    return get_stats()


def _format_photo(p: dict) -> dict:
    return {
        "id": p["id"],
        "filename": p["filename"],
        "path": p["path"],
        "folder": p["folder"],
        "type": p["type"],
        "width": p["width"],
        "height": p["height"],
        "thumbnailUrl": f"/api/thumbnails/{p['id']}" if p.get("thumbnail_path") else None,
        "fullUrl": f"/api/media/{p['id']}",
        "fileSize": p["file_size"],
        "fileHash": p.get("file_hash"),
        "duration": p.get("duration"),
        "metadata": {
            "dateTaken": p["date_taken"],
            "location": p["location"],
            "camera": p["camera"],
            "lens": p["lens"],
            "iso": p["iso"],
            "aperture": p["aperture"],
            "shutterSpeed": p["shutter_speed"],
            "gpsLat": p["gps_lat"],
            "gpsLng": p["gps_lng"],
            "country": p.get("country"),
            "city": p.get("city"),
        },
        "createdAt": p["date_taken"] or p["file_modified_at"],
    }


def _format_trash_item(p: dict) -> dict:
    return {
        "id": p["id"],
        "filename": p["filename"],
        "originalPath": p["original_path"],
        "folder": p["folder"],
        "type": p["type"],
        "width": p["width"],
        "height": p["height"],
        "thumbnailUrl": f"/api/trash/thumbnails/{p['id']}" if p.get("thumbnail_path") else None,
        "fileSize": p["file_size"],
        "deletedAt": p["deleted_at"],
        "metadata": {
            "dateTaken": p["date_taken"],
            "location": p["location"],
            "camera": p["camera"],
        },
    }


@app.get("/api/duplicates")
def list_duplicates():
    photos = get_duplicate_photos()

    # Purge stale
    stale_paths = [
        p["path"] for p in photos
        if not os.path.exists(os.path.join(PHOTOS_DIR, p["path"]))
    ]
    if stale_paths:
        purge_stale_photos(stale_paths)
        stale_set = set(stale_paths)
        photos = [p for p in photos if p["path"] not in stale_set]

    # Group by file_hash
    groups: dict[str, list] = {}
    for p in photos:
        h = p["file_hash"]
        if h not in groups:
            groups[h] = []
        groups[h].append(_format_photo(p))

    # Only keep groups with 2+ items
    result = [{"hash": h, "photos": items} for h, items in groups.items() if len(items) >= 2]

    total_duplicates = sum(len(g["photos"]) - 1 for g in result)
    return {"groups": result, "totalGroups": len(result), "totalDuplicates": total_duplicates}


class DeletePhotosRequest(BaseModel):
    ids: list[str]


@app.post("/api/photos/delete")
def delete_photos_endpoint(req: DeletePhotosRequest):
    """Delete photos by ID — moves files to trash for 30-day recovery."""
    removed = delete_photos_by_ids(req.ids)
    moved_to_trash = 0

    for entry in removed:
        source_file = os.path.join(PHOTOS_DIR, entry["path"])
        trash_filename = f"{entry['id']}_{entry['filename']}"
        trash_path = os.path.join(TRASH_DIR, trash_filename)

        file_moved = False
        if os.path.exists(source_file):
            try:
                shutil.move(source_file, trash_path)
                file_moved = True
                moved_to_trash += 1
                logger.info(f"Moved to trash: {entry['path']}")
            except OSError as e:
                logger.warning(f"Failed to move to trash {entry['path']}: {e}")

        # Add to trash DB table
        add_to_trash({
            "id": entry["id"],
            "filename": entry["filename"],
            "original_path": entry["path"],
            "trash_path": trash_filename if file_moved else "",
            "folder": entry["folder"],
            "type": entry["type"],
            "width": entry["width"],
            "height": entry["height"],
            "file_size": entry["file_size"],
            "duration": entry.get("duration"),
            "date_taken": entry.get("date_taken"),
            "location": entry.get("location"),
            "camera": entry.get("camera"),
            "lens": entry.get("lens"),
            "iso": entry.get("iso"),
            "aperture": entry.get("aperture"),
            "shutter_speed": entry.get("shutter_speed"),
            "gps_lat": entry.get("gps_lat"),
            "gps_lng": entry.get("gps_lng"),
            "thumbnail_path": entry.get("thumbnail_path"),
            "file_hash": entry.get("file_hash"),
            "file_modified_at": entry.get("file_modified_at"),
        })

    return {"deleted": len(removed), "movedToTrash": moved_to_trash, "ids": [r["id"] for r in removed]}


# ── Trash endpoints ───────────────────────────────────────────────

@app.get("/api/trash")
def list_trash():
    """List all items currently in the trash."""
    items = get_trash_items()
    return {
        "items": [_format_trash_item(i) for i in items],
        "total": len(items),
    }


@app.get("/api/trash/thumbnails/{item_id}")
def get_trash_thumbnail(item_id: str):
    """Serve thumbnail for a trashed item (thumbnails are kept until permanent delete)."""
    item = get_trash_item_by_id(item_id)
    if not item or not item.get("thumbnail_path"):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    thumb_path = os.path.join(THUMB_DIR, item["thumbnail_path"])
    if not os.path.exists(thumb_path):
        raise HTTPException(status_code=404, detail="Thumbnail file missing")

    return FileResponse(thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000"})


class RestoreRequest(BaseModel):
    ids: list[str]


@app.post("/api/trash/restore")
def restore_from_trash(req: RestoreRequest):
    """Restore items from trash back to their original location."""
    items = remove_from_trash(req.ids)
    restored = 0

    for item in items:
        trash_file = os.path.join(TRASH_DIR, item["trash_path"]) if item.get("trash_path") else None
        original_path = os.path.join(PHOTOS_DIR, item["original_path"])

        if trash_file and os.path.exists(trash_file):
            try:
                os.makedirs(os.path.dirname(original_path), exist_ok=True)
                shutil.move(trash_file, original_path)
                restored += 1
                logger.info(f"Restored from trash: {item['original_path']}")

                # Re-add to photos DB so it shows up immediately
                upsert_photo({
                    "id": item["id"],
                    "filename": item["filename"],
                    "path": item["original_path"],
                    "folder": item["folder"],
                    "type": item["type"],
                    "width": item["width"],
                    "height": item["height"],
                    "file_size": item["file_size"],
                    "duration": item.get("duration"),
                    "date_taken": item.get("date_taken"),
                    "location": item.get("location"),
                    "camera": item.get("camera"),
                    "lens": item.get("lens"),
                    "iso": item.get("iso"),
                    "aperture": item.get("aperture"),
                    "shutter_speed": item.get("shutter_speed"),
                    "gps_lat": item.get("gps_lat"),
                    "gps_lng": item.get("gps_lng"),
                    "thumbnail_path": item.get("thumbnail_path"),
                    "file_hash": item.get("file_hash"),
                    "file_modified_at": item.get("file_modified_at"),
                })
            except OSError as e:
                logger.warning(f"Failed to restore {item['original_path']}: {e}")

    return {"restored": restored, "ids": [i["id"] for i in items]}


class EmptyTrashRequest(BaseModel):
    ids: Optional[list[str]] = None  # None = empty all


@app.post("/api/trash/empty")
def empty_trash(req: EmptyTrashRequest):
    """Permanently delete items from trash. Pass ids=null to empty all."""
    if req.ids:
        items = remove_from_trash(req.ids)
    else:
        items = get_trash_items()
        remove_from_trash([i["id"] for i in items])

    deleted = 0
    for item in items:
        # Delete the trashed file
        if item.get("trash_path"):
            trash_file = os.path.join(TRASH_DIR, item["trash_path"])
            if os.path.exists(trash_file):
                try:
                    os.remove(trash_file)
                    deleted += 1
                except OSError as e:
                    logger.warning(f"Failed to permanently delete {trash_file}: {e}")

        # Clean up cached files
        _cleanup_cached_files(item["id"], item.get("thumbnail_path"))

    return {"deleted": deleted}


@app.post("/api/reindex")
def reindex(full: bool = Query(True, description="Reprocess all files, even unchanged ones")):
    if indexing_status["running"]:
        return JSONResponse(
            status_code=409,
            content={"message": "Indexing already in progress", "status": indexing_status},
        )

    thread = threading.Thread(target=run_indexer, kwargs={"force_full": full}, daemon=True)
    thread.start()
    return {"message": "Reindexing started", "status": indexing_status, "full": full}


@app.get("/api/index-status")
def index_status():
    return indexing_status


_cleanup_cache = {"data": None, "ts": 0}

@app.get("/api/cleanup")
def cleanup_suggestions():
    """Analyze library for cleanup: screenshots, short videos, large videos, similar groups, duplicates."""
    import time
    now = time.time()
    # Cache for 60 seconds to avoid expensive recomputation
    if _cleanup_cache["data"] is not None and now - _cleanup_cache["ts"] < 60:
        return _cleanup_cache["data"]

    data = get_cleanup_data()

    # Format all items
    result = {
        "screenshots": [_format_photo(p) for p in data["screenshots"]],
        "shortVideos": [_format_photo(p) for p in data["shortVideos"]],
        "largeVideos": [_format_photo(p) for p in data["largeVideos"]],
        "similarGroups": [
            [_format_photo(p) for p in group]
            for group in data["similarGroups"]
        ],
        "duplicateGroups": [
            [_format_photo(p) for p in group]
            for group in data["duplicateGroups"]
        ],
    }

    # Summary stats
    result["summary"] = {
        "screenshotCount": len(result["screenshots"]),
        "screenshotSize": sum(p["fileSize"] for p in result["screenshots"]),
        "shortVideoCount": len(result["shortVideos"]),
        "shortVideoSize": sum(p["fileSize"] for p in result["shortVideos"]),
        "largeVideoCount": len(result["largeVideos"]),
        "largeVideoSize": sum(p["fileSize"] for p in result["largeVideos"]),
        "similarGroupCount": len(result["similarGroups"]),
        "similarPhotoCount": sum(len(g) for g in result["similarGroups"]),
        "duplicateGroupCount": len(result["duplicateGroups"]),
        "duplicatePhotoCount": sum(len(g) for g in result["duplicateGroups"]),
        "duplicateSize": sum(
            sum(p["fileSize"] for p in g[1:])  # wasted size (all but first)
            for g in result["duplicateGroups"]
        ),
    }

    _cleanup_cache["data"] = result
    _cleanup_cache["ts"] = now
    return result


@app.get("/api/health")
def health():
    return {"status": "ok", "photos_dir": PHOTOS_DIR}


# ── Album endpoints ──────────────────────────────────────────────

class CreateAlbumRequest(BaseModel):
    name: str
    description: str = ""

class UpdateAlbumRequest(BaseModel):
    name: str
    description: str = ""
    cover_photo_id: Optional[str] = None

class AlbumPhotosRequest(BaseModel):
    photo_ids: list[str]


@app.get("/api/albums")
def list_albums():
    albums = get_albums()
    return {
        "items": [
            {
                "id": a["id"],
                "name": a["name"],
                "description": a.get("description", ""),
                "photoCount": a["photo_count"],
                "coverUrl": _album_cover_url(a),
                "createdAt": a["created_at"],
                "updatedAt": a["updated_at"],
            }
            for a in albums
        ]
    }


def _album_cover_url(a: dict) -> Optional[str]:
    """Resolve album cover thumbnail URL: explicit cover_photo_id first, then latest photo."""
    if a.get("cover_photo_id"):
        photo = get_photo_by_id(a["cover_photo_id"])
        if photo and photo.get("thumbnail_path"):
            return f"/api/thumbnails/{photo['id']}"
    if a.get("cover_thumb"):
        # Fallback: latest photo thumbnail
        try:
            thumb = a["cover_thumb"]
            # Extract photo id from thumbnail path
            base = os.path.splitext(os.path.basename(thumb))[0]
            return f"/api/thumbnails/{base}"
        except Exception:
            pass
    return None


@app.post("/api/albums")
def create_album_endpoint(req: CreateAlbumRequest):
    import uuid
    album_id = str(uuid.uuid4())[:8]
    album = create_album(album_id, req.name, req.description)
    return {"id": album["id"], "name": album["name"]}


@app.put("/api/albums/{album_id}")
def update_album_endpoint(album_id: str, req: UpdateAlbumRequest):
    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    update_album(album_id, req.name, req.description, req.cover_photo_id)
    return {"ok": True}


@app.delete("/api/albums/{album_id}")
def delete_album_endpoint(album_id: str):
    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    delete_album(album_id)
    return {"ok": True}


@app.get("/api/albums/{album_id}/photos")
def list_album_photos(
    album_id: str,
    limit: int = Query(500, ge=1, le=50000),
    offset: int = Query(0, ge=0),
):
    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    photos, total = get_album_photos(album_id, limit=limit, offset=offset)
    return {"items": [_format_photo(p) for p in photos], "total": total}


@app.post("/api/albums/{album_id}/photos")
def add_to_album(album_id: str, req: AlbumPhotosRequest):
    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    add_photos_to_album(album_id, req.photo_ids)
    return {"ok": True, "added": len(req.photo_ids)}


@app.post("/api/albums/{album_id}/photos/remove")
def remove_from_album(album_id: str, req: AlbumPhotosRequest):
    album = get_album_by_id(album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    remove_photos_from_album(album_id, req.photo_ids)
    return {"ok": True, "removed": len(req.photo_ids)}


# ── Recently added endpoint ───────────────────────────────────────

@app.get("/api/recent")
def list_recent(limit: int = Query(200, ge=1, le=5000)):
    photos, total = get_recent_photos(limit=limit)
    return {"items": [_format_photo(p) for p in photos], "total": total}


# ── Settings endpoints ────────────────────────────────────────────

class SettingUpdate(BaseModel):
    value: str

@app.get("/api/settings")
def list_settings():
    return get_all_settings()

@app.put("/api/settings/{key}")
def update_setting(key: str, body: SettingUpdate):
    allowed_keys = {"geocode_language"}
    if key not in allowed_keys:
        raise HTTPException(status_code=400, detail=f"Unknown setting: {key}")
    set_setting(key, body.value)
    return {"ok": True, "key": key, "value": body.value}
