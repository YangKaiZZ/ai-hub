"""Cuts the big standing pose out of the character sheet and puts AI Hub on his laptop.

Usage: python3 -I cut_hero.py <character-sheet.webp> <laptop-screen.png> <out.png>
laptop-screen.png is laptop-screen.html rendered at 700x500 @2x. The screen is warped into the
laptop with a perspective transform, the phone UI is recoloured to the brand violet, and the
matcha table, the cup and the neighbouring pose are masked out.
"""
import sys, colorsys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, cv2
from scipy import ndimage as ndi
src, screen, out = sys.argv[1:4]
im = Image.open(src).convert("RGB")
a = np.array(im).astype(np.float64)
# 1) laptop screen swap (perspective warp)
scr = cv2.imread(screen, cv2.IMREAD_COLOR)
h, w = scr.shape[:2]
dst = np.float32([[337.5, 420], [463.5, 419], [457, 510], [335, 506]])
M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), dst)
S = 4  # supersample the warp
big = cv2.warpPerspective(scr, M @ np.diag([1, 1, 1]) if False else np.diag([S, S, 1]) @ M, (1024 * S, 1024 * S), flags=cv2.INTER_AREA)
mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), np.diag([S, S, 1]) @ M, (1024 * S, 1024 * S))
warped = cv2.resize(big, (1024, 1024), interpolation=cv2.INTER_AREA)[..., ::-1].astype(float)
m = cv2.resize(mask, (1024, 1024), interpolation=cv2.INTER_AREA).astype(float)[..., None] / 255
a = a * (1 - m) + warped * m
# 2) phone screen: shift red UI hues to brand violet inside the phone quad
q = Image.new("L", (1024, 1024), 0)
ImageDraw.Draw(q).polygon([(79, 380), (116, 373), (140, 457), (101, 467)], fill=255)
qm = np.array(q) > 0
r, g, b = a[..., 0], a[..., 1], a[..., 2]
red = qm & (r > 120) & (r > g * 1.5) & (r > b * 1.3)
for y, x in zip(*np.nonzero(red)):
    hh, ll, ss = colorsys.rgb_to_hls(*(a[y, x] / 255))
    nr = colorsys.hls_to_rgb(0.735, ll, ss)
    a[y, x] = np.array(nr) * 255
im2 = a.clip(0, 255).astype(np.uint8)
# 3) segment the hero
lum = im2.mean(2); sat = im2.max(2).astype(int) - im2.min(2)
bgc = (lum > 186) & (sat < 34)
lab, n = ndi.label(bgc)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
fg = ~np.isin(lab, list(edge))
keep = Image.new("L", (1024, 1024), 255)
d = ImageDraw.Draw(keep)
d.rectangle((0, 0, 1024, 150), fill=0)            # title lettering
d.rectangle((478, 0, 1024, 1024), fill=0)         # right column
d.polygon([(468, 380), (1024, 380), (1024, 1024), (440, 1024), (440, 590), (453, 560), (461, 522)], fill=0)  # "on the go" pose
d.rectangle((425, 563, 480, 660), fill=0); d.rectangle((444, 551, 480, 566), fill=0)          # its hair under the hand
d.rectangle((0, 600, 171, 712), fill=0)           # cup + laptop on table
d.rectangle((0, 712, 153, 872), fill=0)           # table leg
d.polygon([(0, 872), (153, 872), (153, 893), (120, 904), (0, 904)], fill=0)  # table foot
d.rectangle((0, 0, 70, 1024), fill=0)             # swatches + side lettering
fg &= np.array(keep) > 0
fg = ndi.binary_opening(fg, iterations=1)
lab2, _ = ndi.label(fg)
fg = lab2 == lab2[600, 300]
fg = ndi.binary_fill_holes(fg)
ys, xs = np.nonzero(fg)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
rgba = np.dstack([im2, (fg * 255).astype(np.uint8)])[y0:y1, x0:x1]
Image.fromarray(rgba).save(out)
print("hero", x0, y0, x1, y1)
