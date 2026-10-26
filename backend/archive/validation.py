from fastapi import HTTPException, UploadFile, status
from audit_log.service import log_audit
from auth.deps import EngineContext

MAX_SIZE_BYTES = 25 * 1024 * 1024  # bőven elég 1080p JPG-nek
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_DIMENSION = 6000  # px, "image bomb" elleni védelem

async def validate_archive_upload(file: UploadFile, size: int, ctx: EngineContext):
    if size > MAX_SIZE_BYTES:
        await log_audit(ctx, "archive_photo.upload", return_code=status.HTTP_413_CONTENT_TOO_LARGE,
                         meta={"filename": file.filename, "size": size,
                               "message": f"A kép mérete meghaladja a {MAX_SIZE_BYTES // (1024*1024)} MB-os limitet."})
        raise HTTPException(413, f"A kép mérete meghaladja a {MAX_SIZE_BYTES // (1024*1024)} MB-os limitet.")

    ext = ("." + file.filename.rsplit(".", 1)[-1].lower()) if file.filename and "." in file.filename else ""
    if file.content_type not in ALLOWED_MIME or ext not in ALLOWED_EXT:
        await log_audit(ctx, "archive_photo.upload", return_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                         meta={"filename": file.filename, "size": size, "message": "Csak JPG, PNG vagy WebP kép tölthető fel."})
        raise HTTPException(415, "Csak JPG, PNG vagy WebP kép tölthető fel.")