"""Synthesise the reel's soundtrack: a 120 BPM, 7-bar loop plus UI sounds placed on the reel's events.

    python motion/sound.py motion/out/sound.wav

Everything is generated here (no samples), so it's royalty-free by construction. Sounds that ring
past the end wrap around to the start, so the audio loops as seamlessly as the picture.
Event times mirror EVENTS in reel.html.
"""
from __future__ import annotations

import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BARS = 7
DUR = BARS * 4 * BEAT  # 14 s
N = int(SR * DUR)
rng = np.random.default_rng(7)  # deterministic

L = np.zeros(N)
R = np.zeros(N)


def B(n: float) -> float:
    return n * BEAT


def add(sig: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mix a mono signal in at time t (seconds), wrapping past the end for a seamless loop."""
    i0 = int(round(t * SR)) % N
    idx = (np.arange(len(sig)) + i0) % N
    gl, gr = gain * np.sqrt((1 - pan) / 2), gain * np.sqrt((1 + pan) / 2)
    np.add.at(L, idx, sig * gl)
    np.add.at(R, idx, sig * gr)


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / max(decay, 1e-4))


def lowpass(x: np.ndarray, width: int) -> np.ndarray:
    k = np.hanning(width * 2 + 1)
    return np.convolve(x, k / k.sum(), mode="same")


def highpass(x: np.ndarray, width: int) -> np.ndarray:
    return x - lowpass(x, width)


def note(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---------------- music ----------------
def kick(t: float) -> None:
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    f = 42 + 70 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    add(np.sin(ph) * env(n, 0.002, 0.16), t, 0.55)


def clap(t: float) -> None:
    n = int(0.18 * SR)
    s = highpass(rng.standard_normal(n), 6) * env(n, 0.001, 0.045)
    add(s, t, 0.10, 0.05)


def hat(t: float, gain: float) -> None:
    n = int(0.05 * SR)
    add(highpass(rng.standard_normal(n), 2) * env(n, 0.0005, 0.012), t, gain, 0.25)


def tone(freq: float, dur: float, attack: float, decay: float, bright: float = 0.25) -> np.ndarray:
    n = int(dur * SR)
    tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * tt) + bright * np.sin(2 * np.pi * 2 * freq * tt) + 0.08 * np.sin(2 * np.pi * 3 * freq * tt)
    return s * env(n, attack, decay)


# Fmaj7 - G6 - Em7 - Am7 - Fmaj7 - G - Csus2 (leads back to F)
CHORDS = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [48, 55, 60, 62]]

for bar, chord in enumerate(CHORDS):
    t0 = B(bar * 4)
    for beat in range(4):
        if beat in (0, 2):
            kick(t0 + B(beat))
        if beat in (1, 3):
            clap(t0 + B(beat))
        for sub in (0.5,):
            hat(t0 + B(beat + sub), 0.05)
        hat(t0 + B(beat), 0.018)
    # bass: root on 1 and the "and" of 3
    root = note(chord[0] - 12)
    add(tone(root, 1.0, 0.01, 0.35, 0.1), t0, 0.22)
    add(tone(root, 0.8, 0.01, 0.25, 0.1), t0 + B(2.5), 0.16)
    # pad: soft chord for the whole bar
    for i, m in enumerate(chord):
        pad = tone(note(m), 2.3, 0.35, 1.6, 0.05)
        add(pad, t0, 0.035, -0.3 + 0.2 * i)
    # pluck arpeggio on 8ths, an octave up
    arp = [chord[0], chord[1], chord[2], chord[3], chord[2], chord[1], chord[2], chord[3]]
    for k, m in enumerate(arp):
        add(tone(note(m + 12), 0.4, 0.002, 0.11, 0.35), t0 + B(k * 0.5), 0.05, 0.3 if k % 2 else -0.3)

# ---------------- UI sounds, on the reel's events ----------------
def tick(t: float, gain: float = 0.05) -> None:
    n = int(0.012 * SR)
    add(highpass(rng.standard_normal(n), 1) * env(n, 0.0003, 0.003), t, gain, rng.uniform(-0.2, 0.2))


def click(t: float) -> None:
    n = int(0.03 * SR)
    tt = np.arange(n) / SR
    s = 0.6 * highpass(rng.standard_normal(n), 1) * env(n, 0.0003, 0.004) + np.sin(2 * np.pi * 1850 * tt) * env(n, 0.0005, 0.006)
    add(s, t, 0.22)


def whoosh(t: float, gain: float = 0.05) -> None:
    n = int(0.28 * SR)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 2
    s = lowpass(highpass(rng.standard_normal(n), 3), 5) * shape
    add(s / (np.abs(s).max() + 1e-9), t - 0.1, gain)


def chime(t: float, gain: float = 0.09) -> None:
    add(tone(note(88), 0.9, 0.002, 0.28, 0.15), t, gain, -0.1)   # E6
    add(tone(note(95), 1.0, 0.002, 0.34, 0.15), t + 0.07, gain * 0.85, 0.1)  # B6


def pop(t: float) -> None:
    n = int(0.09 * SR)
    tt = np.arange(n) / SR
    f = 700 + 900 * (1 - np.exp(-tt * 60))
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.03), t, 0.10)


TEXT = "Booking app for home tutors"
T0, T1 = 0.08, B(1.85)
for k in range(len(TEXT)):
    tick(T0 + k * (T1 - T0) / len(TEXT), 0.045 if TEXT[k] != " " else 0.03)

for c in (B(3), B(13), B(15), B(21)):
    click(c)
click(B(16.6))           # grab the card
click(B(18.1) + 0.02)    # drop it

MORPHS = [2, 3.25, 4, 8, 11, 12, 14, 15.25, 16, 20, 21.25, 22, 23, 24, 25, 26, 27]
for b in MORPHS:
    whoosh(B(b), 0.035)

for b in (4.15, 5, 6, 7):          # milestones landing
    tick(B(b), 0.06)
for b in (11.05, 15.3, 21.3):      # agreed, secured, released
    chime(B(b))
for b in (12.35, 13.1, 19.1):      # signatures and verification checks
    chime(B(b), 0.045)
pop(B(22.3))
pop(B(23.1))

# ---------------- master ----------------
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)       # gentle glue
mix *= 0.89 / (np.abs(mix).max() + 1e-9)       # -1 dBFS peak
pcm = (mix * 32767).astype(np.int16)

out = sys.argv[1] if len(sys.argv) > 1 else "sound.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {out}  {DUR:.1f}s")
