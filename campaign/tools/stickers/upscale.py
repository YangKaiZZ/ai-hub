"""4x upscale with Real-ESRGAN (anime 6B) via spandrel, tiled for CPU."""
import sys, time
import numpy as np, torch
from PIL import Image
from spandrel import ModelLoader
src, out, weights = sys.argv[1:4]
torch.set_num_threads(4)
model = ModelLoader().load_from_file(weights).eval()
S = model.scale
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
H, W, _ = im.shape
T, O = 256, 24
res = np.zeros((H * S, W * S, 3), np.float32); wsum = np.zeros((H * S, W * S, 1), np.float32)
t0 = time.time()
with torch.inference_mode():
    for y in range(0, H, T):
        for x in range(0, W, T):
            y0, x0, y1, x1 = max(0, y - O), max(0, x - O), min(H, y + T + O), min(W, x + T + O)
            t = torch.from_numpy(im[y0:y1, x0:x1]).permute(2, 0, 1)[None]
            o = model(t)[0].permute(1, 2, 0).clamp(0, 1).numpy()
            # feathered weights so tile seams blend
            hh, ww = o.shape[:2]
            wy = np.minimum(np.arange(hh) + 1, np.arange(hh)[::-1] + 1).clip(max=O * S)[:, None]
            wx = np.minimum(np.arange(ww) + 1, np.arange(ww)[::-1] + 1).clip(max=O * S)[None, :]
            w = (wy * wx).astype(np.float32)[..., None]
            res[y0 * S:y1 * S, x0 * S:x1 * S] += o * w; wsum[y0 * S:y1 * S, x0 * S:x1 * S] += w
        print(f"row {y} done {time.time()-t0:.0f}s", flush=True)
Image.fromarray((res / wsum * 255).round().clip(0, 255).astype(np.uint8)).save(out)
print("saved", out, res.shape)
