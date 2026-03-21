import os
import time
import logging
import threading
import subprocess
from typing import Optional
from contextlib import asynccontextmanager

from pydantic import BaseModel
from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, upsert_photo, search_photos, get_folder_tree, get_photo_by_id, get_stats, remove_missing_photos, get_indexed_hashes, remove_photos_by_paths, get_map_photos, get_duplicate_photos, delete_photos_by_ids
from indexer import scan_directory, PHOTOS_DIR, THUMB_DIR, ALL_EXTENSIONS, generate_thumbnail, generate_video_thumbnail

logger = logging.getLogger("snapvault")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Track indexing state
indexing_status = {"running": False, "progress": 0, "total": 0, "last_run": None}


def get_current_media_paths() -> set[str]:
    """Return all current media paths on disk relative to PHOTOS_DIR."""
    current_paths = set()
    for root, _, files in os.walk(PHOTOS_DIR):
        for filename in files:
            if os.path.splitext(filename)[1].lower() in ALL_EXTENSIONS:
                full_path = os.path.join(root, filename)
                current_paths.add(os.path.relpath(full_path, PHOTOS_DIR))
    return current_paths


def run_indexer():
    """Background indexing task — skips files already indexed with same hash."""
    indexing_status["running"] = True
    indexing_status["progress"] = 0
    indexing_status["total"] = 0
    logger.info(f"Starting index scan of {PHOTOS_DIR}...")

    try:
        # Load existing indexed hashes to skip unchanged files
        known_hashes = get_indexed_hashes()
        logger.info(f"Found {len(known_hashes)} already-indexed files in DB")

        current_paths = get_current_media_paths()
        logger.info(f"Found {len(current_paths)} media files on disk")

        count = 0
        skipped = 0

        for photo in scan_directory(known_hashes=known_hashes):
            if photo is None:
                skipped += 1
                continue

            upsert_photo(photo)
            count += 1
            indexing_status["progress"] = count
            indexing_status["total"] = count

            if count % 100 == 0:
                logger.info(f"Indexed {count} new/changed files ({skipped} skipped)...")

        # Clean up removed files (DB entries + thumbnail/transcode files)
        removed = remove_missing_photos(current_paths)
        if removed:
            for entry in removed:
                # Remove thumbnail
                if entry.get("thumbnail_path"):
                    thumb_file = os.path.join(THUMB_DIR, entry["thumbnail_path"])
                    if os.path.exists(thumb_file):
                        os.remove(thumb_file)
                # Remove transcoded video
                transcode_file = os.path.join(TRANSCODE_DIR, f"{entry['id']}.mp4")
                if os.path.exists(transcode_file):
                    os.remove(transcode_file)
            logger.info(f"Removed {len(removed)} entries + files for deleted photos")

        indexing_status["last_run"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        logger.info(f"Indexing complete: {count} new/changed, {skipped} skipped")

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
    finally:
        indexing_status["running"] = False


def purge_stale_photos(paths: list[str]) -> list[dict]:
    """Delete stale DB rows and cached files for media paths that no longer exist."""
    removed = remove_photos_by_paths(paths)
    for entry in removed:
        if entry.get("thumbnail_path"):
            thumb_file = os.path.join(THUMB_DIR, entry["thumbnail_path"])
            if os.path.exists(thumb_file):
                os.remove(thumb_file)

        transcode_file = os.path.join(TRANSCODE_DIR, f"{entry['id']}.mp4")
        if os.path.exists(transcode_file):
            os.remove(transcode_file)

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
        items.append({
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
            },
            "createdAt": p["date_taken"] or p["file_modified_at"],
        })

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

    items = []
    for p in photos:
        items.append({
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
            },
            "createdAt": p["date_taken"] or p["file_modified_at"],
        })

    return {"items": items, "total": len(items)}


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

    return FileResponse(thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000"})


TRANSCODE_DIR = os.environ.get("TRANSCODE_DIR", "/data/transcoded")
os.makedirs(TRANSCODE_DIR, exist_ok=True)

# Extensions that need transcoding for browser compatibility
NEEDS_TRANSCODE = {".mov", ".avi", ".mkv", ".wmv", ".flv", ".m4v"}
# Image formats that browsers can't display natively — convert to JPEG
NEEDS_IMAGE_CONVERT = {".heic", ".heif", ".tiff", ".tif", ".bmp", ".avif"}
CONVERT_DIR = os.environ.get("CONVERT_DIR", "/data/converted")
os.makedirs(CONVERT_DIR, exist_ok=True)


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
        },
        "createdAt": p["date_taken"] or p["file_modified_at"],
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
    """Delete photos by ID — removes source files, DB entries, and all cached files."""
    removed = delete_photos_by_ids(req.ids)
    deleted_from_disk = 0
    for entry in removed:
        # Delete original file from disk
        source_file = os.path.join(PHOTOS_DIR, entry["path"])
        if os.path.exists(source_file):
            try:
                os.remove(source_file)
                deleted_from_disk += 1
                logger.info(f"Deleted source file: {entry['path']}")
            except OSError as e:
                logger.warning(f"Failed to delete source file {entry['path']}: {e}")

        # Delete cached files
        if entry.get("thumbnail_path"):
            thumb_file = os.path.join(THUMB_DIR, entry["thumbnail_path"])
            if os.path.exists(thumb_file):
                os.remove(thumb_file)
        transcode_file = os.path.join(TRANSCODE_DIR, f"{entry['id']}.mp4")
        if os.path.exists(transcode_file):
            os.remove(transcode_file)
        convert_file = os.path.join(CONVERT_DIR, f"{entry['id']}.jpg")
        if os.path.exists(convert_file):
            os.remove(convert_file)

    return {"deleted": len(removed), "deletedFromDisk": deleted_from_disk, "ids": [r["id"] for r in removed]}


@app.post("/api/reindex")
def reindex():
    if indexing_status["running"]:
        return JSONResponse(
            status_code=409,
            content={"message": "Indexing already in progress", "status": indexing_status},
        )

    thread = threading.Thread(target=run_indexer, daemon=True)
    thread.start()
    return {"message": "Reindexing started", "status": indexing_status}


@app.get("/api/index-status")
def index_status():
    return indexing_status


@app.get("/api/health")
def health():
    return {"status": "ok", "photos_dir": PHOTOS_DIR}
