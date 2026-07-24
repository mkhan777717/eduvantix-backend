"""
services/storage_service.py — StorageService abstraction.
Supports local filesystem, S3, or disabled (no-op).
Saves 640x360 thumbnails only (never full-resolution frames).
"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StorageService(ABC):
    """Abstract interface for flagged-frame thumbnail storage."""

    @abstractmethod
    async def save_flagged_frame(
        self,
        session_id: str,
        flag: str,
        image_bytes: bytes,
        frame_number: int,
    ) -> str | None:
        """
        Persist a downscaled thumbnail.
        Returns the storage path/URL, or None if storage is disabled.
        """
        ...

    @abstractmethod
    async def get_thumbnail_url(self, path: str) -> str | None:
        """Return a URL/path suitable for display in the instructor report."""
        ...


class DisabledStorageService(StorageService):
    """No-op implementation — nothing is saved."""

    async def save_flagged_frame(self, session_id, flag, image_bytes, frame_number) -> None:
        return None

    async def get_thumbnail_url(self, path: str) -> None:
        return None


class LocalStorageService(StorageService):
    """
    Saves thumbnails to local filesystem under:
    {base_path}/{YYYY}/{MM}/{DD}/{session_id}/{flag}_{frame}.jpg
    """

    def __init__(self, base_path: str | None = None) -> None:
        self.base_path = Path(base_path or settings.local_storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _make_thumbnail(self, image_bytes: bytes) -> bytes | None:
        """Resize to max 640x360 at JPEG quality 75."""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return None
            h, w = img.shape[:2]
            target_w = settings.thumbnail_max_width
            target_h = settings.thumbnail_max_height
            scale = min(target_w / w, target_h / h, 1.0)
            if scale < 1.0:
                new_w, new_h = int(w * scale), int(h * scale)
                img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            _, encoded = cv2.imencode(
                ".jpg", img,
                [cv2.IMWRITE_JPEG_QUALITY, settings.thumbnail_jpeg_quality],
            )
            return encoded.tobytes()
        except Exception as exc:
            logger.error("[storage] thumbnail creation failed: %s", exc)
            return None

    async def save_flagged_frame(
        self, session_id: str, flag: str, image_bytes: bytes, frame_number: int
    ) -> str | None:
        thumbnail = self._make_thumbnail(image_bytes)
        if thumbnail is None:
            return None

        today = datetime.utcnow()
        dir_path = self.base_path / str(today.year) / f"{today.month:02d}" / f"{today.day:02d}" / session_id
        dir_path.mkdir(parents=True, exist_ok=True)

        filename = f"{flag}_{frame_number:06d}.jpg"
        file_path = dir_path / filename

        try:
            with open(file_path, "wb") as f:
                f.write(thumbnail)
            rel_path = str(file_path.relative_to(self.base_path.parent))
            logger.debug("[storage] saved thumbnail path=%s", rel_path)
            return rel_path
        except Exception as exc:
            logger.error("[storage] save failed: %s", exc)
            return None

    async def get_thumbnail_url(self, path: str) -> str | None:
        if path and os.path.exists(path):
            return f"/proctor-media/{path}"
        return None


class S3StorageService(StorageService):
    """
    Saves thumbnails to Amazon S3.
    Requires boto3 installed and AWS credentials configured.
    """

    def __init__(self) -> None:
        try:
            import boto3
            self._client = boto3.client(
                "s3",
                region_name=settings.aws_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )
            self._bucket = settings.s3_bucket
        except ImportError:
            raise RuntimeError("boto3 is required for S3 storage. Run: pip install boto3")

    async def save_flagged_frame(
        self, session_id: str, flag: str, image_bytes: bytes, frame_number: int
    ) -> str | None:
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            import cv2 as _cv2
            img = _cv2.imdecode(nparr, _cv2.IMREAD_COLOR)
            if img is None:
                return None
            target_w, target_h = settings.thumbnail_max_width, settings.thumbnail_max_height
            h, w = img.shape[:2]
            scale = min(target_w / w, target_h / h, 1.0)
            if scale < 1.0:
                img = _cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=_cv2.INTER_AREA)
            _, encoded = _cv2.imencode(".jpg", img, [_cv2.IMWRITE_JPEG_QUALITY, settings.thumbnail_jpeg_quality])

            today = datetime.utcnow()
            key = f"proctor/{today.year}/{today.month:02d}/{today.day:02d}/{session_id}/{flag}_{frame_number:06d}.jpg"
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=encoded.tobytes(),
                ContentType="image/jpeg",
            )
            return f"s3://{self._bucket}/{key}"
        except Exception as exc:
            logger.error("[s3_storage] upload failed: %s", exc)
            return None

    async def get_thumbnail_url(self, path: str) -> str | None:
        if not path or not path.startswith("s3://"):
            return None
        try:
            _, _, rest = path.partition("://")
            bucket, _, key = rest.partition("/")
            url = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=3600,
            )
            return url
        except Exception:
            return None


def build_storage_service() -> StorageService:
    """Factory: selects storage backend from settings."""
    backend = settings.storage_backend.lower()
    if not settings.store_flagged_images or backend == "disabled":
        return DisabledStorageService()
    if backend == "s3":
        return S3StorageService()
    return LocalStorageService()
