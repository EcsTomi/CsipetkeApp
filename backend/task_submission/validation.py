# task_submission/validation.py
from fastapi import HTTPException, UploadFile, status
from audit_log.service import log_audit
from auth.deps import EngineContext
from models.task import FileUpload, Task

MAX_SIZE_BYTES = {
    FileUpload.file_upload_vid: 2048 * 1024 * 1024,   # 2048 MB = 2 GB
    FileUpload.file_upload_doc: 200 * 1024 * 1024,
    FileUpload.file_upload_img: 150 * 1024 * 1024,
    FileUpload.file_upload_any: 2048 * 1024 * 1024,   # 2048 MB = 2 GB
}

ALLOWED = {
    FileUpload.file_upload_vid: {
        "mime": {"video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav", "audio/ogg"},
        "ext": {".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg"},
    },
    FileUpload.file_upload_doc: {
        "mime": {
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
        },
        "ext": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"},
    },
    FileUpload.file_upload_img: {
        "mime": {"image/jpeg", "image/png", "image/webp", "image/gif"},
        "ext": {".jpg", ".jpeg", ".png", ".webp", ".gif"},
    },
}

async def validate_submission(file: UploadFile, task: Task, size: int, ctx: EngineContext):
    if task.file_upload == FileUpload.file_upload_not:
        await log_audit(ctx, "task_submission.upload", target_id=task.id, target_name=task.name, return_code=status.HTTP_400_BAD_REQUEST, meta={"filename": file.filename, "size": size, "message": "Ehhez a feladathoz nem tartozik fájlfeltöltés."})
        raise HTTPException(400, "Ehhez a feladathoz nem tartozik fájlfeltöltés.")

    limit = MAX_SIZE_BYTES.get(task.file_upload, 20 * 1024 * 1024)
    if size > limit:
        await log_audit(ctx, "task_submission.upload", target_id=task.id, target_name=task.name, return_code=status.HTTP_413_CONTENT_TOO_LARGE, meta={"filename": file.filename, "size": size, "message": f"A fájl mérete meghaladja a {limit // (1024*1024)} MB-os limitet."})
        raise HTTPException(413, f"A fájl mérete meghaladja a {limit // (1024*1024)} MB-os limitet.")

    if task.file_upload == FileUpload.file_upload_any:
        return  # bármi mehet

    rule = ALLOWED[task.file_upload]
    ext = ("." + file.filename.rsplit(".", 1)[-1].lower()) if "." in file.filename else ""
    if file.content_type not in rule["mime"] or ext not in rule["ext"]:
        await log_audit(ctx, "task_submission.upload", target_id=task.id, target_name=task.name, return_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, meta={"filename": file.filename, "size": size, f"message": "Nem támogatott fájltípus ehhez a feladathoz."})
        raise HTTPException(415, "Nem támogatott fájltípus ehhez a feladathoz.")