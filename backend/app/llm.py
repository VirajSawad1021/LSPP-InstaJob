"""Thin Gemini wrapper: structured generation + embeddings.

No silent fallbacks: if the model fails we raise LLMError and the caller surfaces it.
A faked answer in an agent marketplace is worse than a visible error.
"""
from __future__ import annotations

import asyncio
import math
from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import EMBEDDING_DIM, GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL, GEMINI_MODEL

T = TypeVar("T", bound=BaseModel)

_client = genai.Client(api_key=GEMINI_API_KEY)
_RETRYABLE = {429, 500, 502, 503, 504}
# Several negotiations run in parallel; cap concurrent model calls to stay under rate limits.
_sem = asyncio.Semaphore(4)


class LLMError(RuntimeError):
    pass


async def _with_retry(fn, what: str):
    delay = 2.0
    for attempt in range(4):
        try:
            async with _sem:
                return await fn()
        except errors.APIError as e:
            if getattr(e, "code", None) in _RETRYABLE and attempt < 3:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise LLMError(f"{what} failed: {e}") from e
    raise LLMError(f"{what} failed after retries")


async def generate(
    schema: type[T],
    system: str,
    messages: list[tuple[str, str]] | str,
    temperature: float = 0.4,
) -> T:
    """messages: plain prompt, or [(role, text)] with role in {'user','model'}."""
    if isinstance(messages, str):
        contents = messages
    else:
        contents = [types.Content(role=r, parts=[types.Part(text=t)]) for r, t in messages]

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
        response_schema=schema,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    async def call():
        return await _client.aio.models.generate_content(model=GEMINI_MODEL, contents=contents, config=config)

    resp = await _with_retry(call, f"{schema.__name__} generation")
    parsed = resp.parsed
    if isinstance(parsed, schema):
        return parsed
    try:
        return schema.model_validate_json(resp.text or "")
    except Exception as e:
        raise LLMError(f"{schema.__name__}: model returned invalid JSON") from e


def _normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


async def embed(text: str, task: str = "SEMANTIC_SIMILARITY") -> list[float]:
    config = types.EmbedContentConfig(task_type=task, output_dimensionality=EMBEDDING_DIM)

    async def call():
        return await _client.aio.models.embed_content(model=GEMINI_EMBEDDING_MODEL, contents=text[:8000], config=config)

    resp = await _with_retry(call, "embedding")
    if not resp.embeddings or not resp.embeddings[0].values:
        raise LLMError("embedding returned no values")
    # Truncated (<3072-d) Gemini embeddings must be re-normalized for cosine distance.
    return _normalize(list(resp.embeddings[0].values))
