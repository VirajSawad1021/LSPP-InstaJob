"""Render motion/reel.html to video, the way the post does it: every frame is seek(t) in a headless
browser, 4 subframes per frame blended by ffmpeg (tmix) for motion blur, at 60 fps.

    python motion/render.py --beats                      # QA: one frame per beat -> motion/out/beats.png
    python motion/render.py                              # full render -> public/motion/*.mp4 + poster

Needs the backend venv (Playwright) and ffmpeg on PATH. Audio comes from motion/sound.py.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
PUBLIC = ROOT.parent / "public" / "motion"
W, H, FPS, SUB = 1920, 1080, 60, 4
FFMPEG = shutil.which("ffmpeg") or sys.exit("ffmpeg not found on PATH")


def open_page(p):
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    page.goto((ROOT / "reel.html").as_uri() + "?render=1")
    page.wait_for_function("window.__ready === true", timeout=30000)
    return b, page


def frame(page, t: float) -> bytes:
    page.evaluate(f"seek({t:.6f})")
    return page.screenshot(type="png")


def beats() -> None:
    """One frame per beat, near the end of each beat (states settled), tiled 7x4."""
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        b, page = open_page(p)
        dur = page.evaluate("DUR")
        n = 28
        for i in range(n):
            (OUT / f"beat-{i:02d}.png").write_bytes(frame(page, i * dur / n + 0.42))
        b.close()
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(OUT / "beat-%02d.png"),
                    "-vf", "scale=480:-1,tile=7x4:padding=6:color=white", "-frames:v", "1", str(OUT / "beats.png")], check=True)
    print("wrote", OUT / "beats.png")


def full() -> None:
    OUT.mkdir(exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    wav = OUT / "sound.wav"
    subprocess.run([sys.executable, str(ROOT / "sound.py"), str(wav)], check=True)
    silent = OUT / "reel-silent.mp4"
    with sync_playwright() as p:
        b, page = open_page(p)
        dur = page.evaluate("DUR")
        frames = round(dur * FPS)
        # frame f blends subframes t = (f + s/SUB)/FPS; tmix averages 4, select keeps the 4th of each group
        ff = subprocess.Popen([
            FFMPEG, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS * SUB), "-i", "-",
            "-vf", f"tmix=frames={SUB},select=eq(mod(n\\,{SUB})\\,{SUB - 1}),setpts=N/({FPS}*TB)",
            "-r", str(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", str(silent),
        ], stdin=subprocess.PIPE)
        t0 = time.time()
        for f in range(frames):
            for s in range(SUB):
                ff.stdin.write(frame(page, (f + s / SUB) / FPS))
            if f % 60 == 0:
                print(f"  frame {f}/{frames}  {time.time() - t0:.0f}s", flush=True)
        ff.stdin.close()
        ff.wait()
        poster = frame(page, 4 * 0.5 * 3 + 0.4)  # the Build Plan, fully drawn
        b.close()
    (PUBLIC / "instajob-reel-poster.png").write_bytes(poster)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(PUBLIC / "instajob-reel-poster.png"), "-q:v", "3",
                    str(PUBLIC / "instajob-reel-poster.jpg")], check=True)
    (PUBLIC / "instajob-reel-poster.png").unlink()
    # with sound (for slides and sharing) and a lighter muted loop for the website
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(silent), "-i", str(wav), "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(PUBLIC / "instajob-reel.mp4")], check=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(silent), "-an", "-c:v", "libx264", "-preset", "slow",
                    "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(PUBLIC / "instajob-reel-web.mp4")], check=True)
    for f in ("instajob-reel.mp4", "instajob-reel-web.mp4", "instajob-reel-poster.jpg"):
        print(f"wrote public/motion/{f}  {(PUBLIC / f).stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--beats", action="store_true")
    beats() if ap.parse_args().beats else full()
