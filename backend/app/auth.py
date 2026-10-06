from __future__ import annotations

import time
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException

from app.config import SUPABASE_URL
from app.db import db, one

# Supabase signs access tokens with an asymmetric key (ES256) and publishes it as a JWKS,
# so tokens are verified locally instead of a network round trip per request.
_jwks = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
_ISSUER = f"{SUPABASE_URL}/auth/v1"

_PROFILE_TTL = 30.0
_profiles: dict[str, tuple[float, dict]] = {}


@dataclass
class User:
    id: str
    email: str | None
    role: str | None
    full_name: str | None


def _profile(user_id: str) -> dict:
    hit = _profiles.get(user_id)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    p = one("profiles", id=user_id) or {}
    _profiles[user_id] = (time.monotonic() + _PROFILE_TTL, p)
    return p


def forget_profile(user_id: str) -> None:
    _profiles.pop(user_id, None)


def _verify(token: str) -> dict:
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        # leeway: a token used right after login can look "issued in the future" by a
        # fraction of a second when this machine's clock lags Supabase's.
        return jwt.decode(token, key, algorithms=["ES256", "RS256"], audience="authenticated", issuer=_ISSUER, leeway=60)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired, please sign in again")
    except jwt.PyJWKClientError:
        # Unknown key id (e.g. legacy HS256 token): fall back to asking Supabase.
        res = db().auth.get_user(token)
        if not res or not res.user:
            raise HTTPException(401, "Invalid session")
        return {"sub": res.user.id, "email": res.user.email}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid session")


def current_user(authorization: str = Header(default="")) -> User:
    """Validate the Supabase access token sent by the frontend as `Bearer <jwt>`."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in required")
    claims = _verify(authorization.split(" ", 1)[1].strip())
    profile = _profile(claims["sub"])
    return User(id=claims["sub"], email=claims.get("email"), role=profile.get("role"), full_name=profile.get("full_name"))


def require_role(user: User, role: str) -> None:
    if user.role != role:
        raise HTTPException(403, f"This action is for {role} accounts")
