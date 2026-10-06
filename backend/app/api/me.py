from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.common import developer_row
from app.auth import User, current_user, forget_profile
from app.db import db

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("")
def me(user: User = Depends(current_user)):
    dev = developer_row(user_id=user.id)
    return {"id": user.id, "email": user.email, "role": user.role, "full_name": user.full_name, "developer": dev}


class RoleBody(BaseModel):
    role: Literal["client", "developer"]


@router.post("/role")
def set_role(body: RoleBody, user: User = Depends(current_user)):
    if user.role and user.role != body.role:
        raise HTTPException(409, f"This account is already a {user.role} account")
    db().table("profiles").update({"role": body.role}).eq("id", user.id).execute()
    forget_profile(user.id)
    return {"role": body.role}
