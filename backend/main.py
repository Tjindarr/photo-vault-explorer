import os
import time
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, upsert_photo, search_photos, get_folder_tree, get_photo_by_id, get_stats, remove_missing_photos
from indexer import scan_directory, PHOTOS_DIR, THUMB_DIR

logger = logging.getLogger("snapvault")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Track indexing state
indexing_status = {"running": False, "progress": 0, "total": 0, "last_run": None}


def run_indexer():
    """Background indexing task."""
    indexing_status["running"] = True
    indexing_status["progress"] = 0
    logger.info(f"Starting index scan of {PHOTOS_DIR}...")

    try:
        photos = scan_directory()
        indexing_status["total"] = len(photos)

        existing_paths = set()
        for i, photo in enumerate(photos):
            upsert_photo(photo)
            existing_paths.add(photo["path"])
            indexing_status["progress"] = i + 1

            if (i + 1) % 100 == 0:
                logger.info(f"Indexed {i + 1}/{len(photos)} files...")

        # Clean up removed files
        removed = remove_missing_photos(existing_paths)
        if removed:
            logger.info(f"Removed {removed} entries for deleted files")

        indexing_status["last_run"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        logger.info(f"Indexing complete: {len(photos)} files indexed")

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
    limit: int = Query(200, ge=1, le=1000),
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
    if not photo or not photo.get("thumbnail_path"):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    thumb_path = os.path.join(THUMB_DIR, photo["thumbnail_path"])
    if not os.path.exists(thumb_path):
        raise HTTPException(status_code=404, detail="Thumbnail file missing")

    return FileResponse(thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000"})


@app.get("/api/media/{photo_id}")
def get_media(photo_id: str):
    photo = get_photo_by_id(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo["path"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Determine media type
    ext = os.path.splitext(filepath)[1].lower()
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
