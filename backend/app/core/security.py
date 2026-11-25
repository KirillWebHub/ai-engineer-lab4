"""Пароли, токены сессий и их хранение."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

try:
    import bcrypt
except ImportError:  # bcrypt нужен только при HASH_SCHEME=bcrypt
    bcrypt = None

_hasher = PasswordHasher(
    time_cost=settings.argon2_time_cost,
    memory_cost=settings.argon2_memory_cost,
    parallelism=settings.argon2_parallelism,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)


def _bcrypt_value(password: str) -> bytes:
    # bcrypt обрезает вход после 72 байт, поэтому хэшируем пароль заранее.
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    if settings.hash_scheme == "bcrypt":
        if bcrypt is None:
            raise RuntimeError("Для HASH_SCHEME=bcrypt установите пакет bcrypt")
        return bcrypt.hashpw(_bcrypt_value(password), bcrypt.gensalt(rounds=12)).decode()
    if settings.hash_scheme != "argon2":
        raise RuntimeError("HASH_SCHEME должен быть argon2 или bcrypt")
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("$2"):
        if bcrypt is None:
            return False
        try:
            return bcrypt.checkpw(_bcrypt_value(password), password_hash.encode())
        except ValueError:
            return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    """В БД попадает только HMAC от токена, а не сам токен из cookie."""

    return hmac.new(
        settings.secret_key.encode(), token.encode(), hashlib.sha256
    ).hexdigest()
