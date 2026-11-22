import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Usuario

SECRET_KEY = os.environ.get("ANDEN_SECRET_KEY", "anden-urbe-2026-dev-secret-key-cambia-en-produccion")
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 días
PBKDF2_ITERATIONS = 120_000

ROLES_VALIDOS = ("estudiante", "profesor", "admin_general")
ROLES_STAFF = ("profesor", "admin_general")

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        alg, iters_str, salt, expected_hex = stored_hash.split("$", 3)
        if alg != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iters_str),
        )
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def crear_token(usuario: Usuario) -> str:
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    now = int(time.time())
    payload_dict = {
        "sub": str(usuario.id),
        "username": usuario.username,
        "rol": usuario.rol,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    payload = _b64url_encode(json.dumps(payload_dict, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header}.{payload}".encode("ascii")
    sig = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url_encode(sig)}"


def verificar_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_encode(expected_sig), sig_b64):
            return None
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def extraer_iniciales(nombre: str) -> str:
    partes = [p for p in (nombre or "").strip().split() if p]
    if not partes:
        return "US"
    if len(partes) == 1:
        return partes[0][:2].upper()
    return (partes[0][0] + partes[-1][0]).upper()


def obtener_usuario_actual(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    if not creds or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Debes iniciar sesión para continuar.",
        )
    payload = verificar_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tu sesión venció o no es válida. Vuelve a iniciar sesión.",
        )
    usuario = db.get(Usuario, int(payload["sub"]))
    if not usuario or not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente.",
        )
    return usuario


def requerir_profesor_o_admin(usuario: Usuario = Depends(obtener_usuario_actual)) -> Usuario:
    if usuario.rol not in ROLES_STAFF:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta acción requiere perfil de Profesor o Administrador general.",
        )
    return usuario


def requerir_admin_general(usuario: Usuario = Depends(obtener_usuario_actual)) -> Usuario:
    if usuario.rol != "admin_general":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el Administrador general puede realizar esta acción.",
        )
    return usuario
