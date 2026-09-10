import boto3
from botocore.config import Config

from app.config import get_settings

_client = None


def _s3():
    global _client
    if _client is None:
        settings = get_settings()
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.access_key_id,
            aws_secret_access_key=settings.secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    return _client


def presign_put(key: str, content_type: str, expires_in: int = 600) -> str:
    settings = get_settings()
    return _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def presign_get(key: str, expires_in: int = 3600) -> str:
    settings = get_settings()
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.bucket, "Key": key},
        ExpiresIn=expires_in,
    )


def get_bytes(key: str) -> bytes:
    settings = get_settings()
    response = _s3().get_object(Bucket=settings.bucket, Key=key)
    return response["Body"].read()


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    settings = get_settings()
    _s3().put_object(
        Bucket=settings.bucket, Key=key, Body=data, ContentType=content_type
    )


def delete_object(key: str) -> None:
    settings = get_settings()
    _s3().delete_object(Bucket=settings.bucket, Key=key)
