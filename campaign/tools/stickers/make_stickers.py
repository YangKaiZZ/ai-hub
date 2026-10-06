"""Builds the high-resolution AI Hub sticker set from the two supplied character sheets.

Usage (python3 -I, needs numpy, scipy, pillow, opencv):
  python3 -I make_stickers.py <sticker-sheet.webp> <sticker-sheet_x4.png> \
                              <character-sheet.webp> <character-sheet_x4.png> <laptop-screen.png> <out_dir>

The *_x4.png inputs are the sheets upscaled 4x by upscale.py (Real-ESRGAN anime 6B). Masks are found on the
1x sheets, where the flat backgrounds are easy to separate, then refined on the 4x art so the edges follow the
crisp upscaled outlines. Every sticker gets a rebuilt, even white die-cut edge. Output is lossless-quality
WebP at exactly 2x the size of the earlier set, so layouts that place the stickers keep working unchanged.

Left out on purpose (per the brief): every pose holding the matcha cup, and the green mascot.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

K = 4            # upscale factor of the *_x4 sheets
PAD = 24 * K     # transparent margin around each sticker
EDGE = 7 * K     # die-cut border width (hero: 9 * K)

SHEET1_NAMES = ['laptop-phone', 'arms-crossed', 'pack-bag', 'shout', 'shrug', 'sit-phone', 'trackpad',
                'walk-phone', 'celebrate', 'facepalm', 'idea', 'wave']
# component id on the 1x character sheet -> name (cup poses, cap pose and mascot excluded)
SHEET3_PARTS = {9: 'face-serious', 10: 'face-surprised', 8: 'face-annoyed', 37: 'face-tired', 33: 'face-smug',
                36: 'face-shy', 34: 'face-thinking', 56: 'pose-gaming', 55: 'pose-peace', 54: 'pose-fist',
                83: 'pose-hoodie', 81: 'pose-study', 82: 'pose-city', 122: 'item-headphones', 123: 'item-bag',
                126: 'item-laptop'}


def up_mask(mask1x, box):
    """Upsample a 1x boolean mask to the 4x grid (smooth, then threshold)."""
    m = Image.fromarray((mask1x * 255).astype(np.uint8)).resize(((box[2] - box[0]) * K, (box[3] - box[1]) * K), Image.BILINEAR)
    return np.asarray(m) > 127


def die_cut(rgb, region, border, force=None):
    """rgb: 4x crop; region: rough sticker area; force: pixels that are always art. Returns RGBA with a rebuilt die-cut edge."""
    rgb = rgb.astype(float)
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    char = region & ((lum < 236) | (sat > 22))
    char = ndi.binary_opening(char, iterations=K)
    if force is not None:
        char |= force
    lab, n = ndi.label(char)
    if n:
        sizes = ndi.sum(char, lab, range(1, n + 1))
        char = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 120 * K * K])
    char = ndi.binary_closing(char, iterations=3 * K)
    char = ndi.binary_fill_holes(char)
    H, W = char.shape
    big = np.zeros((H + 2 * PAD, W + 2 * PAD), bool)
    big[PAD:PAD + H, PAD:PAD + W] = char
    rgbbig = np.zeros((H + 2 * PAD, W + 2 * PAD, 3))
    rgbbig[PAD:PAD + H, PAD:PAD + W] = rgb
    dist = ndi.distance_transform_edt(~big)
    sticker = np.clip(border + 0.5 - dist, 0, 1)
    sticker = np.asarray(Image.fromarray((sticker * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2 * K / 2))).astype(float) / 255
    sticker = np.clip((sticker - 0.5) * 3 + 0.5, 0, 1)
    inner = np.clip(1 + 0.6 * K - dist, 0, 1)  # soft edge between art and the white border
    out = np.zeros((H + 2 * PAD, W + 2 * PAD, 4))
    out[..., :3] = rgbbig * inner[..., None] + 255 * (1 - inner[..., None])
    out[..., 3] = np.maximum(sticker, inner) * 255
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def flood_bg(a, lo, hi, satmax):
    """Background = pixels in [lo, hi] luminance with low saturation that touch the image border."""
    lum = a.mean(2)
    sat = a.max(2) - a.min(2)
    cand = (lum > lo) & (lum < hi) & (sat < satmax)
    lab, _ = ndi.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(edge))


def sheet1(src1, src4, out):
    a1 = np.asarray(Image.open(src1).convert('RGB')).astype(int)
    a4 = np.asarray(Image.open(src4).convert('RGB'))
    fg = ~flood_bg(a1, 180, 241.5, 14)
    fg[:70] = False  # header lettering
    fg = ndi.binary_fill_holes(ndi.binary_opening(fg, iterations=2))
    lab, n = ndi.label(fg)
    sizes = ndi.sum(fg, lab, range(1, n + 1))
    items = [(sl[0].start, sl[1].start, i + 1, sl) for i, sl in enumerate(ndi.find_objects(lab)) if sizes[i] >= 4000]
    items.sort(key=lambda t: (round(t[0] / 200), t[1]))
    for (y, x, idx, sl), name in zip(items, SHEET1_NAMES):
        box = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
        region = up_mask(ndi.binary_erosion(lab[sl] == idx, iterations=1), box)
        crop = a4[box[1] * K:box[3] * K, box[0] * K:box[2] * K]
        save(die_cut(crop, region, EDGE), out, name)


def sheet3_parts(src1, src4, out):
    a1 = np.asarray(Image.open(src1).convert('RGB')).astype(int)
    a4 = np.asarray(Image.open(src4).convert('RGB'))
    fg = ~flood_bg(a1, 228, 256, 20)
    lab, _ = ndi.label(ndi.binary_fill_holes(ndi.binary_opening(fg, iterations=1)))
    objs = ndi.find_objects(lab)
    for k, name in SHEET3_PARTS.items():
        sl = objs[k - 1]
        box = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
        rough = up_mask(ndi.binary_dilation(ndi.binary_fill_holes(lab[sl] == k), iterations=1), box)
        crop = a4[box[1] * K:box[3] * K, box[0] * K:box[2] * K]
        region = rough & ~flood_bg(np.pad(crop.astype(int), ((1, 1), (1, 1), (0, 0)), constant_values=255), 228, 256, 20)[1:-1, 1:-1]
        save(die_cut(crop, region, EDGE), out, name)


def hero(src4, screen, out):
    """The big standing pose, with AI Hub on his laptop and his phone UI in brand violet."""
    a = np.asarray(Image.open(src4).convert('RGB')).astype(np.float64)
    N = a.shape[0]
    # laptop screen: perspective-warp the AI Hub dashboard into the screen quad
    scr = cv2.imread(screen, cv2.IMREAD_COLOR)
    h, w = scr.shape[:2]
    quad = np.float32([[337.2, 417.2], [463.8, 416.2], [457.2, 510.4], [334.8, 506.4]]) * K
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), quad)
    S = 2
    big = cv2.warpPerspective(scr, np.diag([S, S, 1]) @ M, (N * S, N * S), flags=cv2.INTER_AREA)
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), np.diag([S, S, 1]) @ M, (N * S, N * S))
    warped = cv2.resize(big, (N, N), interpolation=cv2.INTER_AREA)[..., ::-1].astype(float)
    m = cv2.resize(mask, (N, N), interpolation=cv2.INTER_AREA).astype(float)[..., None] / 255
    a = a * (1 - m) + warped * m
    # phone: shift its red UI hues to the brand violet (#7c3aed hue) inside the phone quad
    q = Image.new('L', (N, N), 0)
    ImageDraw.Draw(q).polygon([(x * K, y * K) for x, y in [(79, 380), (116, 373), (140, 457), (101, 467)]], fill=255)
    qm = np.asarray(q) > 0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = qm & (r > 120) & (r > g * 1.5) & (r > b * 1.3)
    hsv = cv2.cvtColor(a.clip(0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    hsv[..., 0] = np.where(red, 132, hsv[..., 0])  # OpenCV hue 0-179: 132 ~ 264 deg
    a = np.where(red[..., None], cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB).astype(float), a)
    img = a.clip(0, 255).astype(np.uint8)
    # segment: flood the off-white page from the border, then mask out the neighbours
    fg = ~flood_bg(img.astype(int), 186, 256, 34)
    scr_mask = Image.new('L', (N, N), 0)
    ImageDraw.Draw(scr_mask).polygon([tuple(p) for p in quad], fill=255)
    scr_mask = np.asarray(scr_mask) > 0
    fg |= scr_mask   # the light dashboard must never read as page background
    keep = Image.new('L', (N, N), 255)
    d = ImageDraw.Draw(keep)
    sc = lambda pts: [(x * K, y * K) for x, y in pts]  # noqa: E731
    d.rectangle(sc([(0, 0), (1024, 150)]), fill=0)                                    # title lettering
    d.rectangle(sc([(0, 600), (171, 712)]), fill=0)                                   # cup + laptop on the table
    d.rectangle(sc([(0, 712), (153, 872)]), fill=0)                                   # table leg
    d.polygon(sc([(468, 380), (1024, 380), (1024, 1024), (440, 1024), (440, 590), (453, 560), (461, 522)]), fill=0)  # next pose
    d.rectangle(sc([(425, 563), (480, 660)]), fill=0)                                 # its hair under the hand
    d.rectangle(sc([(444, 551), (480, 566)]), fill=0)
    d.polygon(sc([(0, 872), (153, 872), (153, 893), (120, 904), (112, 910), (0, 910)]), fill=0)  # table foot
    d.polygon(sc([(150, 700), (167, 711), (165, 724), (150, 724)]), fill=0)          # table-top edge at the knee
    d.rectangle(sc([(0, 0), (70, 1024)]), fill=0)                                     # swatches + side lettering
    d.rectangle(sc([(478, 0), (1024, 1024)]), fill=0)                                 # right column
    fg &= np.asarray(keep) > 0
    # right next to his leg, slivers of the laptop (light) and the table top (wood brown) survive the cut
    zone = np.zeros_like(fg)
    zone[596 * K:716 * K, 160 * K:182 * K] = True
    f = img.astype(int)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    fg &= ~(zone & ((f.mean(2) > 120) | ((r - b > 35) & (r > g + 15))))
    fg = ndi.binary_opening(fg, iterations=K)
    lab, _ = ndi.label(fg)
    fg = ndi.binary_fill_holes(lab == lab[600 * K, 300 * K])
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    save(die_cut(img[y0:y1, x0:x1], fg[y0:y1, x0:x1], 9 * K, force=scr_mask[y0:y1, x0:x1]), out, 'hero')


def save(im, out, name):
    im.save(os.path.join(out, name + '.webp'), quality=92, method=6, alpha_quality=100)
    print(f'{name:16s} {im.size[0]}x{im.size[1]}')


if __name__ == '__main__':
    s1, s1x4, s3, s3x4, screen, out = sys.argv[1:7]
    os.makedirs(out, exist_ok=True)
    sheet1(s1, s1x4, out)
    sheet3_parts(s3, s3x4, out)
    hero(s3x4, screen, out)
