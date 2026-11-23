"""Shared validated image decoding and Supabase Storage helpers for branding and branch photos."""

import base64
import hashlib
import struct
from typing import Any, Literal

import httpx
from fastapi import HTTPException

ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def inspect_image_bytes(
    raw: bytes,
    declared_mime: str,
    *,
    max_bytes: int,
    min_dim: int,
    max_dim: int,
    max_size_label: str,
    subject_label: str = "Image",
) -> tuple[Literal["image/png", "image/jpeg", "image/webp"], int, int]:
    """Verify magic bytes, dimensions, and byte size without trusting filenames or client MIME claims."""
    if not raw or len(raw) > max_bytes:
        raise ValueError(f"{subject_label} must be between 1 byte and {max_size_label}")

    detected: Literal["image/png", "image/jpeg", "image/webp"] | None = None
    width = 0
    height = 0

    if raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 24:
        detected = "image/png"
        width, height = struct.unpack(">II", raw[16:24])
    elif raw.startswith(b"RIFF") and len(raw) >= 30 and raw[8:12] == b"WEBP":
        detected = "image/webp"
        chunk = raw[12:16]
        if chunk == b"VP8X" and len(raw) >= 30:
            width = 1 + int.from_bytes(raw[24:27], "little")
            height = 1 + int.from_bytes(raw[27:30], "little")
        elif chunk == b"VP8L" and len(raw) >= 25:
            bits = int.from_bytes(raw[21:25], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
        elif chunk == b"VP8 " and len(raw) >= 30:
            width = int.from_bytes(raw[26:28], "little") & 0x3FFF
            height = int.from_bytes(raw[28:30], "little") & 0x3FFF
    elif raw.startswith(b"\xff\xd8"):
        detected = "image/jpeg"
        idx = 2
        while idx + 4 < len(raw):
            if raw[idx] != 0xFF:
                idx += 1
                continue
            while idx < len(raw) and raw[idx] == 0xFF:
                idx += 1
            if idx >= len(raw):
                break
            marker = raw[idx]
            idx += 1
            if marker in (0xD8, 0xD9) or (0xD0 <= marker <= 0xD7) or marker == 0x01:
                continue
            if idx + 2 > len(raw):
                break
            seg_len = int.from_bytes(raw[idx:idx + 2], "big")
            if seg_len < 2 or idx + seg_len > len(raw):
                break
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if seg_len >= 7:
                    height, width = struct.unpack(">HH", raw[idx + 3:idx + 7])
                break
            idx += seg_len

    if not detected or detected != declared_mime:
        raise ValueError("Image content does not match an allowed PNG, JPEG, or WebP format")
    if not (min_dim <= width <= max_dim and min_dim <= height <= max_dim):
        raise ValueError(f"Image dimensions must be between {min_dim}px and {max_dim}px")
    return detected, width, height


def decode_and_inspect_image(
    data_base64: str,
    declared_mime: str,
    *,
    max_bytes: int,
    min_dim: int,
    max_dim: int,
    max_size_label: str,
    subject_label: str = "Image",
) -> tuple[bytes, Literal["image/png", "image/jpeg", "image/webp"], str, str]:
    """Decode base64 image payload, validate image bytes/dimensions, and return bytes, MIME, ext, and sha256 prefix."""
    try:
        raw_bytes = base64.b64decode(data_base64, validate=True)
    except Exception as exc:
        raise HTTPException(422, "Invalid base64 image payload") from exc

    try:
        detected_mime, _width, _height = inspect_image_bytes(
            raw_bytes,
            declared_mime,
            max_bytes=max_bytes,
            min_dim=min_dim,
            max_dim=max_dim,
            max_size_label=max_size_label,
            subject_label=subject_label,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    ext = ALLOWED_IMAGE_TYPES[detected_mime]
    digest = hashlib.sha256(raw_bytes).hexdigest()[:12]
    return raw_bytes, detected_mime, ext, digest


def upload_storage_object(
    supabase_url: str,
    secret: str,
    bucket: str,
    object_path: str,
    raw_bytes: bytes,
    content_type: str,
    *,
    unavailable_detail: str,
    failed_detail: str,
    http_client: Any = httpx,
) -> str:
    """Upload validated bytes into a public-read Supabase Storage bucket and return its public URL."""
    upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{object_path}"
    try:
        resp = http_client.post(
            upload_url,
            content=raw_bytes,
            headers={
                "apikey": secret,
                "Authorization": f"Bearer {secret}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            timeout=15,
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, unavailable_detail) from exc

    if resp.status_code not in (200, 201):
        raise HTTPException(503, failed_detail)

    return f"{supabase_url}/storage/v1/object/public/{bucket}/{object_path}"


def delete_storage_object_best_effort(
    supabase_url: str,
    secret: str,
    bucket: str,
    object_path: str | None,
    *,
    http_client: Any = httpx,
) -> None:
    """Best-effort delete of an object from Supabase Storage without failing committed caller workflows."""
    if not object_path or not secret:
        return
    try:
        http_client.delete(
            f"{supabase_url}/storage/v1/object/{bucket}/{object_path}",
            headers={"apikey": secret, "Authorization": f"Bearer {secret}"},
            timeout=5,
        )
    except Exception:
        pass
