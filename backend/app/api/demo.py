"""Guided demo endpoints: where each act starts, and a reset that only demo accounts can trigger."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.auth import User, current_user
from app.services import demo

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("")
def status():
    try:
        return demo.scenario_links()
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e


@router.post("/reset")
async def reset(user: User = Depends(current_user)):
    if not await asyncio.to_thread(demo.is_demo_user, user.id):
        raise HTTPException(403, "Only the demo accounts can reset the demo")
    try:
        await asyncio.to_thread(demo.reset)
    except RuntimeError as e:
        raise HTTPException(429, str(e)) from e
    return await asyncio.to_thread(demo.scenario_links)
