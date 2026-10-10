# CHOG VIBER portrait generator — blocky character rendered with 3D-style
# shading (directional light, gradients, contact shadow, black outline) to
# match the look of the other robot portraits. Pure stdlib PNG encoder.
import zlib, struct

W = H = 1080
BG     = (235, 228, 212)
BLACK  = (20, 22, 26)      # #14161a outline
PURPLE = (92, 54, 176)     # #5c36b0 body
BLUE   = (104, 111, 254)   # #686ffe tint
CREAM  = (253, 247, 211)   # #fdf7d3 face/spikes
OUT = 9

img = [[BG] * W for _ in range(H)]

def setpx(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img[y][x] = c

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def shade(c, f):  # f>0 -> toward white, f<0 -> toward black
    if f >= 0:
        return lerp(c, (255, 255, 255), min(1.0, f))
    return lerp(c, (0, 0, 0), min(1.0, -f))

def blend(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# --- Background: soft vignette ---
for y in range(H):
    for x in range(W):
        dx = (x - W / 2) / (W / 2)
        dy = (y - H / 2) / (H / 2)
        d = (dx * dx + dy * dy) ** 0.5
        a = max(0.0, d - 0.82) * 0.5
        img[y][x] = blend(BG, (208, 198, 176), a)

# --- Contact shadow ellipse ---
for y in range(880, 1010):
    for x in range(290, 790):
        dx = (x - 540) / 250
        dy = (y - 944) / 52
        r2 = dx * dx + dy * dy
        if r2 <= 1:
            a = (1 - r2) * 0.30
            img[y][x] = blend(img[y][x], (96, 86, 68), a)

# --- Gradient-filled rect with cylindrical shading (light top-left) ---
def orect(x0, y0, x1, y1, c):
    rect = lambda a0, b0, a1, b1, col: None
    # outline
    for y in range(y0 - OUT, y1 + OUT + 1):
        for x in range(x0 - OUT, x1 + OUT + 1):
            setpx(x, y, BLACK)
    w, hgt = x1 - x0, y1 - y0
    for y in range(y0, y1 + 1):
        ty = (y - y0) / max(1, hgt)
        row = lerp(shade(c, 0.42), shade(c, -0.32), ty)
        for x in range(x0, x1 + 1):
            tx = (x - x0) / max(1, w)
            col = row
            if tx < 0.30:
                col = blend(col, shade(c, 0.50), 1 - tx / 0.30)
            if tx > 0.70:
                col = blend(col, shade(c, -0.48), (tx - 0.70) / 0.30)
            setpx(x, y, col)

# --- Gradient triangle (outlined) ---
def fill_tri_grad(v0, v1, v2, c):
    (x0, y0), (x1, y1), (x2, y2) = v0, v1, v2
    miny, maxy = max(0, int(min(y0, y1, y2))), min(H - 1, int(max(y0, y1, y2)))
    minx, maxx = max(0, int(min(x0, x1, x2))), min(W - 1, int(max(x0, x1, x2)))
    span = max(1, maxy - miny)
    for y in range(miny, maxy + 1):
        t = (y - miny) / span
        base = lerp(shade(c, 0.45), shade(c, -0.30), t)
        for x in range(minx, maxx + 1):
            d0 = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)
            d1 = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
            d2 = (x0 - x2) * (y - y2) - (y0 - y2) * (x - x2)
            neg = (d0 < 0) or (d1 < 0) or (d2 < 0)
            pos = (d0 > 0) or (d1 > 0) or (d2 > 0)
            if not (neg and pos):
                setpx(x, y, base)

def fill_tri_flat(v0, v1, v2, c):
    (x0, y0), (x1, y1), (x2, y2) = v0, v1, v2
    miny, maxy = max(0, int(min(y0, y1, y2))), min(H - 1, int(max(y0, y1, y2)))
    minx, maxx = max(0, int(min(x0, x1, x2))), min(W - 1, int(max(x0, x1, x2)))
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            d0 = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)
            d1 = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
            d2 = (x0 - x2) * (y - y2) - (y0 - y2) * (x - x2)
            neg = (d0 < 0) or (d1 < 0) or (d2 < 0)
            pos = (d0 > 0) or (d1 > 0) or (d2 > 0)
            if not (neg and pos):
                setpx(x, y, c)

def otri(v0, v1, v2, c):
    cx = (v0[0] + v1[0] + v2[0]) / 3
    cy = (v0[1] + v1[1] + v2[1]) / 3
    def ex(v):
        dx, dy = v[0] - cx, v[1] - cy
        L = (dx * dx + dy * dy) ** 0.5
        if L < 1e-6: return v
        k = OUT * 1.4 / L
        return (v[0] + dx * k, v[1] + dy * k)
    fill_tri_flat(ex(v0), ex(v1), ex(v2), BLACK)
    fill_tri_grad(v0, v1, v2, c)

# --- Feet / boots (blue) ---
orect(388, 838, 478, 908, BLUE)
orect(602, 838, 692, 908, BLUE)
orect(384, 872, 482, 910, (72, 78, 190))   # darker soles
orect(598, 872, 696, 910, (72, 78, 190))

# --- Body (purple) ---
orect(370, 560, 710, 848, PURPLE)

# --- Big body spikes (cream quills out the sides, 3x) ---
otri((378, 596), (392, 716), (216, 636), CREAM)
otri((376, 668), (384, 756), (196, 738), CREAM)
otri((702, 596), (688, 716), (864, 636), CREAM)
otri((704, 668), (696, 756), (884, 738), CREAM)

# --- Belly plate (blue) ---
orect(438, 620, 642, 780, BLUE)

# --- Arms (purple with blue paws) ---
orect(322, 570, 396, 730, PURPLE)
orect(684, 570, 758, 730, PURPLE)
orect(322, 678, 396, 738, BLUE)   # paws
orect(684, 678, 758, 738, BLUE)

# --- Head (purple) ---
orect(342, 350, 738, 592, PURPLE)

# --- Giant head spikes (cream mohawk, 3x) ---
otri((378, 388), (468, 372), (384, 178), CREAM)
otri((452, 378), (542, 366), (462, 132), CREAM)
otri((526, 376), (616, 368), (540, 108), CREAM)
otri((600, 378), (690, 366), (624, 132), CREAM)
otri((690, 372), (774, 388), (702, 178), CREAM)
# Side head spikes
otri((342, 392), (356, 510), (176, 452), CREAM)
otri((738, 392), (724, 510), (904, 452), CREAM)

# --- Blue top band on head ---
orect(352, 372, 728, 400, BLUE)

# --- Face plate (cream) ---
orect(398, 418, 682, 566, CREAM)
# Blue cheek tints
orect(398, 492, 428, 532, BLUE)
orect(652, 492, 682, 532, BLUE)

# --- Eyes (black, glossy glint) ---
orect(442, 448, 496, 508, BLACK)
orect(584, 448, 638, 508, BLACK)
rect_flat = orect  # reuse gradient fill for glints
for x in range(462, 488):
    for y in range(462, 488):
        setpx(x, y, CREAM)
for x in range(604, 630):
    for y in range(462, 488):
        setpx(x, y, CREAM)

# --- Nose (black) ---
orect(524, 500, 556, 538, BLACK)

# --- Mouth (dark) ---
orect(516, 550, 564, 558, BLACK)

# --- PNG encode ---
raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in img)
def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
       + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
open('assets/robot5_portrait.png', 'wb').write(png)
print('written', len(png), 'bytes')
