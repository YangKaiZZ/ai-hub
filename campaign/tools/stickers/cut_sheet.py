"""Cuts every sticker out of a sticker sheet whose transparency is a baked-in checkerboard.

Usage: python3 -I cut_sheet.py <sheet.webp> <out_dir>   (writes s00.png, s01.png ... in reading order)
The checkerboard is flood-filled from the image border (grey, 180-241 luminance), so the white die-cut
edge of each sticker stops the fill; each remaining blob is one sticker.
"""
import sys
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as ndi
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.array(im).astype(int)
mx, mn = a.max(2), a.min(2)
lum = a.mean(2)
grey = (mx - mn) < 14
bgc = grey & (lum > 180) & (lum < 241.5)
lab, n = ndi.label(bgc)
# background = components touching the border
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
fg = ~bg
fg[:70] = False  # header text
fg = ndi.binary_opening(fg, iterations=2)
fg = ndi.binary_fill_holes(fg)
lab2, n2 = ndi.label(fg)
sizes = ndi.sum(fg, lab2, range(1, n2 + 1))
objs = ndi.find_objects(lab2)
k = 0
items = []
for i, (sl, s) in enumerate(zip(objs, sizes)):
    if s < 4000: continue
    items.append((sl[0].start, sl[1].start, i + 1, sl))
items.sort(key=lambda t: (round(t[0] / 200), t[1]))
for y, x, idx, sl in items:
    m = (lab2[sl] == idx)
    m = ndi.binary_erosion(m, iterations=1)
    alpha = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    crop = im.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)).convert("RGBA")
    crop.putalpha(alpha)
    crop.save(f"{out}/s{k:02d}.png")
    print(k, sl[1].start, sl[0].start, crop.size)
    k += 1
