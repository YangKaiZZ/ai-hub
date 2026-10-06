"""Synthesizes the film's music bed and SFX palette from scratch (numpy + scipy, no samples, no licences).

Run from the film project root:  python3 tools/make_audio.py
Writes assets/audio/bgm.wav (55s, 96 BPM, bar 0 on a downbeat) and assets/audio/sfx/*.wav.
Everything is seeded, so a re-run produces identical files.
"""
import json
import os
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
ROOT = os.getcwd()
FILM = json.load(open(os.path.join(ROOT, "film.json"), encoding="utf-8"))
BPM = FILM["bpm"]
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = sum(b for _, b in FILM["scenes"]) * BAR


# ---------------------------------------------------------------- primitives
def t_of(d):
    return np.arange(int(round(d * SR))) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def filt(x, kind, f, order=2):
    nyq = SR / 2
    if kind == "bp":
        sos = butter(order, [f[0] / nyq, min(f[1] / nyq, 0.99)], btype="band", output="sos")
    else:
        sos = butter(order, min(f / nyq, 0.99), btype=kind, output="sos")
    return sosfilt(sos, x)


def sweep_filter(x, kind, f0, f1, steps=48):
    """Time-varying filter: process in overlapping blocks with a cutoff moving geometrically f0 -> f1."""
    out = np.zeros_like(x)
    n = len(x)
    blk = max(1, n // steps)
    win = np.hanning(2 * blk)
    for i in range(0, n, blk):
        a, b = max(0, i - blk // 2), min(n, i + blk + blk // 2)
        f = f0 * (f1 / f0) ** (i / max(1, n - 1))
        seg = filt(x[a:b], kind, f if kind != "bp" else (f * 0.7, f * 1.4))
        w = np.hanning(len(seg)) if len(seg) > 2 else np.ones(len(seg))
        out[a:b] += seg * w
    norm = np.zeros(n)
    for i in range(0, n, blk):
        a, b = max(0, i - blk // 2), min(n, i + blk + blk // 2)
        norm[a:b] += np.hanning(b - a) if b - a > 2 else 1
    return out / np.maximum(norm, 1e-3)


def env(n, a=0.005, tau=0.3, hold=0.0):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-np.maximum(t - a - hold, 0) / tau))
    return e


def fade(x, fin=0.003, fout=0.02):
    n = len(x)
    i, o = min(n, int(fin * SR)), min(n, int(fout * SR))
    if i:
        x[:i] *= np.linspace(0, 1, i)
    if o:
        x[n - o:] *= np.linspace(1, 0, o)
    return x


def reverb_ir(seconds=2.2, seed=3, damp=5000):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t / (seconds / 6.5))
    ir = np.stack([filt(ch, "low", damp) for ch in ir])
    ir[:, : int(0.012 * SR)] = 0
    return ir / np.abs(ir).sum(axis=1, keepdims=True) * 40


IR = reverb_ir()


def verb(st, mix=0.18):
    wet = np.stack([fftconvolve(st[c], IR[c])[: st.shape[1]] for c in range(2)])
    return st * (1 - mix * 0.5) + wet * mix


class Bus:
    def __init__(self, seconds):
        self.x = np.zeros((2, int(round(seconds * SR)) + 1))

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= self.x.shape[1]:
            return
        sig = sig[: self.x.shape[1] - i]
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.x[0, i : i + len(sig)] += sig * gain * l * 1.414
        self.x[1, i : i + len(sig)] += sig * gain * r * 1.414


# ---------------------------------------------------------------- instruments
def kick(soft=False):
    t = t_of(0.5)
    f = 48 + 82 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / (0.22 if not soft else 0.16))
    click = filt(np.random.default_rng(1).standard_normal(len(t)), "high", 2500) * np.exp(-t / 0.004) * 0.25
    return fade(np.tanh((body + click) * 1.6) * 0.9)


def snare(seed=2):
    t = t_of(0.4)
    rng = np.random.default_rng(seed)
    noise = filt(rng.standard_normal(len(t)), "bp", (1400, 7000)) * np.exp(-t / 0.075)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.55
    return fade((noise * 0.8 + tone) * 0.8)


def clap(seed=4):
    t = t_of(0.35)
    rng = np.random.default_rng(seed)
    n = filt(rng.standard_normal(len(t)), "bp", (900, 5200))
    e = np.zeros(len(t))
    for k, off in enumerate([0, 0.011, 0.022]):
        e += np.where(t >= off, np.exp(-(t - off) / (0.012 if k < 2 else 0.11)), 0)
    return fade(n * e * 0.6)


def hat(open_=False, seed=5):
    t = t_of(0.3 if open_ else 0.08)
    n = filt(np.random.default_rng(seed).standard_normal(len(t)), "high", 7500)
    return fade(n * np.exp(-t / (0.09 if open_ else 0.022)) * 0.5)


def crash(seed=6):
    t = t_of(2.4)
    n = filt(np.random.default_rng(seed).standard_normal(len(t)), "high", 4200)
    return fade(n * np.exp(-t / 0.7) * 0.35, 0.001, 0.3)


def rhodes(f, d, vel=1.0):
    t = t_of(d + 1.2)
    idx = 2.2 * np.exp(-t / 0.25) + 0.3
    mod = np.sin(2 * np.pi * f * t) * idx
    car = np.sin(2 * np.pi * f * t + mod)
    bell = np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / 0.09) * 0.12
    amp = env(len(t), 0.004, 1.1) * np.where(t > d, np.exp(-(t - d) / 0.18), 1)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return fade((car + bell) * amp * trem * 0.22 * vel)


def pad(notes, d, cutoff=900):
    t = t_of(d)
    x = np.zeros(len(t))
    for n in notes:
        for det in (-0.09, 0.0, 0.08):
            f = midi(n + det)
            x += 2 * ((f * t) % 1.0) - 1
    x = filt(x / (len(notes) * 3), "low", cutoff)
    a = np.minimum(t / 0.6, 1) * np.minimum((d - t) / 0.5, 1)
    return fade(x * a * 0.5)


def bass(f, d):
    t = t_of(d + 0.15)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    amp = env(len(t), 0.008, 0.9) * np.where(t > d, np.exp(-(t - d) / 0.05), 1)
    return fade(np.tanh(x * amp * 1.3) * 0.55)


def pluck(f, d=0.5):
    t = t_of(d + 0.3)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.08)
    return fade(x * env(len(t), 0.003, 0.28) * 0.28)


def bell(f, tau=0.8, partials=((1, 1), (2.76, 0.35), (5.4, 0.12)), d=None):
    d = d or tau * 4
    t = t_of(d)
    x = sum(a * np.sin(2 * np.pi * f * p * t) * np.exp(-t / (tau / p ** 0.5)) for p, a in partials)
    return fade(x * env(len(t), 0.002, 10) * 0.5)


# ---------------------------------------------------------------- the song
CHORDS = {
    "Fmaj7": ([53, 57, 60, 64], 41), "G6": ([55, 59, 62, 64], 43), "Em7": ([52, 55, 59, 62], 40),
    "Am7": ([57, 60, 64, 67], 45), "Am": ([45, 52, 57, 60], 33), "Cmaj9": ([48, 55, 59, 62, 64], 36),
    "Dm9": ([50, 53, 57, 60, 64], 38),
}
PROG = ["Fmaj7", "G6", "Em7", "Am7"]
MELODY = [  # (beat offset, midi, beats) per bar, C pentatonic hook
    [(0, 76, 0.5), (0.5, 74, 0.5), (1, 72, 0.5), (1.5, 69, 1), (2.5, 72, 0.5), (3, 74, 1)],
    [(0, 72, 0.5), (1, 74, 0.5), (1.5, 76, 0.5), (2, 79, 1), (3, 76, 0.5), (3.5, 74, 0.5)],
    [(0, 76, 1), (1, 79, 0.5), (1.5, 81, 0.5), (2, 79, 0.5), (2.5, 76, 0.5), (3, 74, 1)],
    [(0, 72, 1.5), (1.5, 69, 0.5), (2, 72, 0.5), (2.5, 74, 0.5), (3, 72, 1)],
]


def song():
    bus = Bus(TOTAL + 3)
    music = Bus(TOTAL + 3)  # chords/pad/bass/melody (ducked by the kick)
    kicks = []
    swing = 0.09 * BEAT
    rng = np.random.default_rng(11)
    nbars = int(round(TOTAL / BAR))
    DROP = 5          # bar the full groove lands on (the logo reveal)
    FINAL = nbars - 1  # the last bar: one chord rings out under the lockup

    for bar in range(nbars):
        t0 = bar * BAR
        # ---- harmony
        if bar < 3:  # pressure: dark pad, clock-tick hats, heartbeat kick
            if bar == 0:
                music.add(pad(CHORDS["Am"][0], 3 * BAR, cutoff=700), t0, 0.9)
            for b in range(4):
                bus.add(kick(soft=True), t0 + b * BEAT, 0.42 if b % 2 == 0 else 0.0)
                kicks.append(t0 + b * BEAT) if b % 2 == 0 else None
            for s in range(8):
                bus.add(hat(seed=20 + s), t0 + s * BEAT / 2, 0.16 + 0.06 * (s % 2) + 0.03 * bar, 0.3)
            music.add(bass(midi(33), BEAT * 0.9), t0, 0.5)
            music.add(bass(midi(33), BEAT * 0.5), t0 + 2.5 * BEAT, 0.35)
        elif bar < DROP:  # the idea: drums out, Rhodes in, riser into the drop
            name = "Fmaj7" if bar == 3 else "G6"
            for n in CHORDS[name][0]:
                music.add(rhodes(midi(n), BAR * 0.9, 0.9), t0 + 0.01 * (n % 3), 1.0, (n % 5 - 2) * 0.15)
            if bar == 4:
                for k in range(12):  # snare roll: 16ths on beat 3, 32nds on beat 4
                    tt = t0 + 2 * BEAT + k * BEAT / 4 if k < 4 else t0 + 3 * BEAT + (k - 4) * BEAT / 8
                    if tt < t0 + BAR - 0.08:
                        bus.add(snare(seed=40 + k), tt, 0.10 + 0.03 * k)
        elif bar < FINAL:
            name = PROG[(bar - DROP) % 4] if bar < FINAL - 2 else ("Dm9" if bar == FINAL - 2 else "G6")
            notes, root = CHORDS[name]
            for j, n in enumerate(notes):
                music.add(rhodes(midi(n), BEAT * 1.4, 0.95), t0 + 0.012 * j, 1.0, (j - 1.5) * 0.25)
                music.add(rhodes(midi(n), BEAT * 1.2, 0.6), t0 + 2.5 * BEAT + swing + 0.012 * j, 1.0, (j - 1.5) * 0.25)
            for bt, mult, dd in ((0, 1, 1.4), (1.75, 1, 0.4), (2.5, 1, 0.9), (3.5, 2, 0.4)):
                music.add(bass(midi(root) * mult, dd * BEAT), t0 + bt * BEAT + (swing if bt % 1 else 0), 0.7)
            # drums: boom-bap with swing
            for bt in (0, 1.75, 2.5):
                tt = t0 + bt * BEAT + (swing if bt % 1 else 0)
                bus.add(kick(), tt, 0.62)
                kicks.append(tt)
            for bt in (1, 3):
                bus.add(snare(seed=bar * 3 + bt), t0 + bt * BEAT, 0.42)
                if bar >= FINAL - 3:
                    bus.add(clap(seed=bar + bt), t0 + bt * BEAT + 0.004, 0.32)
            for s in range(8):
                tt = t0 + s * BEAT / 2 + (swing if s % 2 else 0)
                v = 0.2 if s % 2 == 0 else 0.12 + 0.03 * rng.random()
                bus.add(hat(open_=(s == 7 and bar % 2 == 1), seed=60 + s), tt, v, 0.25)
            if bar == DROP:
                bus.add(crash(), t0, 0.55, -0.2)
            # melody from the 4th groove bar on
            if bar >= DROP + 4:
                for bt, n, dd in MELODY[(bar - DROP) % 4]:
                    music.add(pluck(midi(n), dd * BEAT), t0 + bt * BEAT + (swing if bt % 1 else 0), 0.55, 0.3)
                    music.add(pluck(midi(n), dd * BEAT), t0 + bt * BEAT + 0.75 * BEAT + (swing if bt % 1 else 0), 0.18, -0.4)
        else:  # final bar: one big chord + crash, everything else drops out
            notes, root = CHORDS["Cmaj9"]
            for j, n in enumerate(notes):
                music.add(rhodes(midi(n), BAR * 0.95, 1.0), t0 + 0.015 * j, 1.0, (j - 2) * 0.2)
                music.add(rhodes(midi(n + 12), BAR * 0.9, 0.35), t0 + 0.02 * j, 1.0, (2 - j) * 0.2)
            music.add(bass(midi(root), BAR * 0.9), t0, 0.75)
            bus.add(kick(), t0, 0.6)
            bus.add(crash(), t0, 0.5, 0.2)
            kicks.append(t0)

    # riser + snare-roll gap before the drop
    t_r0, t_r1 = (DROP - 1) * BAR, DROP * BAR - 0.06
    n = int((t_r1 - t_r0) * SR)
    noise = np.random.default_rng(9).standard_normal(n)
    rise = sweep_filter(noise, "bp", 300, 7000) * np.linspace(0, 1, n) ** 2 * 0.5
    bus.add(fade(rise, 0.01, 0.01), t_r0, 0.7)

    # sidechain: duck the music under each kick
    t = np.arange(music.x.shape[1]) / SR
    duck = np.ones_like(t)
    for k in kicks:
        i = int(k * SR)
        seg = t[i:] - k
        duck[i:] = np.minimum(duck[i:], 1 - 0.38 * np.exp(-seg / 0.11))
    music.x *= duck

    mix = verb(music.x, 0.22) + verb(bus.x, 0.08)
    # lo-fi colour: gentle top roll-off + vinyl crackle bed
    mix = np.stack([filt(ch, "low", 11000) for ch in mix])
    crng = np.random.default_rng(12)
    crackle = np.zeros(mix.shape[1])
    pos = crng.integers(0, mix.shape[1], int(TOTAL * 9))
    crackle[pos] = crng.uniform(-1, 1, len(pos))
    crackle = filt(crackle, "bp", (1500, 9000)) * 0.35
    hiss = filt(crng.standard_normal(mix.shape[1]), "bp", (2000, 8000)) * 0.004
    mix += crackle + hiss
    end = int(TOTAL * SR)
    mix = mix[:, :end]
    tail = int(0.4 * SR)
    mix[:, -tail:] *= np.linspace(1, 0, tail) ** 1.5
    mix = np.tanh(mix / np.abs(mix).max() * 1.15) * 0.89
    return mix


# ---------------------------------------------------------------- SFX
def sfx():
    out = {}
    rng = lambda s: np.random.default_rng(s)  # noqa: E731

    t = t_of(0.08)
    c = filt(rng(1).standard_normal(len(t)), "high", 2500) * np.exp(-t / 0.004)
    c += np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.006) * 0.5 + np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.01) * 0.3
    out["click"] = c

    t = t_of(0.16)
    f = 380 + 620 * (1 - np.exp(-t / 0.03))
    out["pop"] = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.045)

    n = int(0.62 * SR)
    w = sweep_filter(rng(2).standard_normal(n), "bp", 350, 2600)
    hump = np.sin(np.linspace(0, np.pi, n)) ** 2
    out["whoosh"] = w * hump

    t = t_of(0.5)
    thump = np.sin(2 * np.pi * np.cumsum(60 + 90 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.13)
    ws = sweep_filter(rng(3).standard_normal(len(t)), "bp", 1800, 500) * np.exp(-t / 0.07)
    out["punch"] = thump * 0.9 + ws * 0.6

    t = t_of(1.8)
    boom = np.sin(2 * np.pi * np.cumsum(42 + 70 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.55)
    crack = filt(rng(4).standard_normal(len(t)), "low", 3500) * np.exp(-t / 0.09)
    sh = filt(rng(5).standard_normal(len(t)), "high", 5000) * np.exp(-t / 0.5) * 0.25
    out["impact"] = np.tanh((boom + crack * 0.6 + sh) * 1.4)

    p = bell(1318.5, 0.25, d=0.7)
    p2 = bell(1760, 0.3, d=0.7)
    pp = np.zeros(int(0.8 * SR))
    pp[: len(p)] += p
    i = int(0.085 * SR)
    pp[i : i + len(p2)] += p2[: len(pp) - i]
    out["ping"] = pp

    t = t_of(0.42)
    sq = np.sign(np.sin(2 * np.pi * 155 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * t))
    out["buzz"] = filt(sq, "low", 700) * np.minimum(t / 0.02, 1) * np.minimum((0.42 - t) / 0.04, 1)

    d = bell(2093, 0.9, d=1.6) + bell(3136, 0.5, d=1.6) * 0.4
    shimmer = filt(rng(6).standard_normal(len(d)), "high", 8000) * np.exp(-t_of(1.6) / 0.25) * 0.08
    out["ding"] = d + shimmer

    ch = np.zeros(int(1.9 * SR))
    for k, n in enumerate([72, 76, 79, 84, 88]):
        b = bell(midi(n) * 2, 0.6, d=1.4)
        i = int(k * 0.065 * SR)
        ch[i : i + len(b)] += b * (0.9 - k * 0.08)
    out["chime"] = ch

    kb = np.zeros(int(1.35 * SR))
    r = rng(7)
    tt = 0.0
    while tt < 1.2:
        tk = t_of(0.05)
        hit = filt(r.standard_normal(len(tk)), "bp", (1800, 6500)) * np.exp(-tk / 0.006) * r.uniform(0.6, 1)
        hit += np.sin(2 * np.pi * r.uniform(280, 360) * tk) * np.exp(-tk / 0.012) * 0.35
        i = int(tt * SR)
        kb[i : i + len(hit)] += hit[: len(kb) - i]
        tt += r.uniform(0.055, 0.12)
    out["keys"] = kb

    t = t_of(0.36)
    out["stamp"] = np.sin(2 * np.pi * np.cumsum(90 + 120 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.07) + \
        filt(rng(8).standard_normal(len(t)), "bp", (600, 3000)) * np.exp(-t / 0.02) * 0.6

    n = int(1.0 * SR)
    ri = sweep_filter(rng(9).standard_normal(n), "bp", 400, 6500) * np.linspace(0, 1, n) ** 2
    ri += np.sin(2 * np.pi * np.cumsum(np.linspace(200, 900, n)) / SR) * np.linspace(0, 1, n) ** 3 * 0.25
    out["rise"] = ri

    t = t_of(0.8)
    out["scan"] = np.sin(2 * np.pi * np.cumsum(np.linspace(1100, 2300, len(t))) / SR) * \
        (0.5 + 0.5 * np.sin(2 * np.pi * 14 * t)) * np.sin(np.linspace(0, np.pi, len(t))) * 0.5

    cf = np.zeros(int(1.5 * SR))
    r = rng(10)
    for k in range(26):
        tp = t_of(0.08)
        f0 = r.uniform(700, 2200)
        s = np.sin(2 * np.pi * np.cumsum(f0 + f0 * 0.8 * (1 - np.exp(-tp / 0.02))) / SR) * env(len(tp), 0.001, 0.02)
        i = int((r.uniform(0, 0.5) ** 1.6) * SR)
        cf[i : i + len(s)] += s * r.uniform(0.3, 0.8)
    cf += filt(rng(11).standard_normal(len(cf)), "high", 6000) * np.exp(-t_of(1.5) / 0.35) * 0.18
    out["confetti"] = cf

    su = np.zeros(int(0.9 * SR))
    for k, n in enumerate([79, 84]):
        b = bell(midi(n), 0.3, partials=((1, 1), (4, 0.2)), d=0.7)
        i = int(k * 0.1 * SR)
        su[i : i + len(b)] += b[: len(su) - i]
    out["success"] = su
    return out


# ---------------------------------------------------------------- io
def write(path, x):
    x = np.atleast_2d(x)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(os.path.join(ROOT, "assets", "audio", "sfx"), exist_ok=True)
    for name, x in sfx().items():
        x = fade(x / np.abs(x).max() * 0.9, 0.001, 0.015)
        write(os.path.join(ROOT, "assets", "audio", "sfx", name + ".wav"), x)
    bgm = song()
    write(os.path.join(ROOT, "assets", "audio", "bgm.wav"), bgm)
    print(f"bgm.wav {bgm.shape[1] / SR:.2f}s at {BPM} BPM; sfx written")


if __name__ == "__main__":
    main()
