"""Rebuilds a clean, even white die-cut edge around cut-out art.

Usage: python3 -I die_cut.py <in_dir> <out_dir> [border_px]
Keeps only the inked character (drops the ragged original edge), then grows a smooth border of
`border_px` around it with a distance transform.
"""
import sys, glob, os
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as ndi
src_dir, out_dir, pad, border = sys.argv[1], sys.argv[2], 24, int(sys.argv[3]) if len(sys.argv) > 3 else 7
os.makedirs(out_dir, exist_ok=True)
for f in sorted(glob.glob(src_dir + "/*.png")):
    im = Image.open(f).convert("RGBA")
    a = np.array(im).astype(float)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb.mean(2); sat = rgb.max(2) - rgb.min(2)
    char = (al > 200) & ((lum < 236) | (sat > 22))
    char = ndi.binary_opening(char, iterations=1)
    lab, n = ndi.label(char)
    sizes = ndi.sum(char, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 120]
    char = np.isin(lab, keep)
    char = ndi.binary_closing(char, iterations=3)
    char = ndi.binary_fill_holes(char)
    H, W = char.shape
    P = pad
    big = np.zeros((H + 2 * P, W + 2 * P), bool); big[P:P + H, P:P + W] = char
    rgbbig = np.zeros((H + 2 * P, W + 2 * P, 3)); rgbbig[P:P + H, P:P + W] = rgb
    dist = ndi.distance_transform_edt(~big)
    sticker = np.clip(border + 0.5 - dist, 0, 1)
    sticker = np.array(Image.fromarray((sticker * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255
    sticker = np.clip((sticker - 0.5) * 3 + 0.5, 0, 1)
    inner = np.clip(1.6 - dist, 0, 1)  # soft char edge
    out = np.zeros((H + 2 * P, W + 2 * P, 4))
    white = np.array([255, 255, 255.0])
    out[..., :3] = rgbbig * inner[..., None] + white * (1 - inner[..., None])
    out[..., 3] = np.maximum(sticker, inner) * 255
    Image.fromarray(out.astype(np.uint8)).save(out_dir + "/" + os.path.basename(f))
