import base64
import hashlib
import hmac
import json
import secrets
import time

from .config import ACCESS_TOKEN_MINUTES, JWT_SECRET

PASSWORD_ITERATIONS = 310_000


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, encoded_salt, encoded_digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        expected = _b64decode(encoded_digest)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            _b64decode(encoded_salt),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def create_access_token(user_id: int, token_version: int) -> str:
    issued_at = int(time.time())
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64encode(
        json.dumps(
            {
                "sub": str(user_id),
                "ver": token_version,
                "iat": issued_at,
                "exp": issued_at + ACCESS_TOKEN_MINUTES * 60,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64encode(signature)}"


def decode_access_token(token: str) -> tuple[int, int] | None:
    try:
        header_part, payload_part, signature_part = token.split(".")
        signing_input = f"{header_part}.{payload_part}".encode("ascii")
        expected = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(signature_part)):
            return None

        header = json.loads(_b64decode(header_part))
        payload = json.loads(_b64decode(payload_part))
        if header != {"alg": "HS256", "typ": "JWT"}:
            return None
        if not isinstance(payload.get("exp"), int) or payload["exp"] <= int(time.time()):
            return None
        user_id = int(payload["sub"])
        token_version = payload.get("ver")
        if not isinstance(token_version, int) or token_version < 0:
            return None
        return (user_id, token_version) if user_id > 0 else None
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None
