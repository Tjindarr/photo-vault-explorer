import os
import time
import logging
import threading
import subprocess
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, upsert_photo, search_photos, get_folder_tree, get_photo_by_id, get_stats, remove_missing_photos, get_indexed_hashes
from indexer import scan_directory, PHOTOS_DIR, THUMB_DIR, generate_thumbnail, generate_video_thumbnail

logger = logging.getLogger("snapvault")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Track indexing state
indexing_status = {"running": False, "progress": 0, "total": 0, "last_run": None}


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

        existing_paths = set(known_hashes.keys())
        count = 0
        skipped = 0

        for photo in scan_directory(known_hashes=known_hashes):
            if photo is None:
                skipped += 1
                continue

            upsert_photo(photo)
            existing_paths.add(photo["path"])
            count += 1
            indexing_status["progress"] = count
            indexing_status["total"] = count

            if count % 100 == 0:
                logger.info(f"Indexed {count} new/changed files ({skipped} skipped)...")

        # Clean up removed files (DB entries + thumbnail/transcode files)
        removed = remove_missing_photos(existing_paths)
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
    allow_methods=["GET"],
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


@app.get("/api/photos/{photo_id}")
def get_photo(photo_id: str):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


@app.get("/api/thumbnails/{photo_id}")
def get_thumbnail(photo_id: str):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo["path"])
    if not os.path.exists(filepath):
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
def get_media(photo_id: str):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo["path"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")

    ext = os.path.splitext(filepath)[1].lower()

    # Transcode non-MP4 videos to H.264 for browser compatibility
    if ext in NEEDS_TRANSCODE:
        transcoded = transcode_to_mp4(filepath, photo_id)
        if transcoded:
            return FileResponse(
                transcoded,
                media_type="video/mp4",
                headers={"Cache-Control": "public, max-age=604800"},
            )
        # Fall through to serve original if transcode fails

    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
        ".tiff": "image/tiff", ".tif": "image/tiff", ".heic": "image/heic",
        ".avif": "image/avif",
        ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska", ".webm": "video/webm", ".m4v": "video/mp4",
    }

    return FileResponse(
        filepath,
        media_type=media_types.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=604800"},
    )


@app.get("/api/stats")
def stats():
    return get_stats()


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
