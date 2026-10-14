# META VIBER portrait — blocky robot rendered with 3D-style shading,
# matching the meta.jpg reference: BLUE head, near-black body, white visor,
# yellow accents. Same style family as the other robot portraits.
import zlib, struct

W = H = 1080
BG     = (235, 228, 212)
BLACK  = (20, 22, 26)      # #14161a outline
BLUE   = (30, 60, 255)     # #1e3cff head
BLUED  = (20, 40, 180)     # darker blue shade
BODY   = (20, 20, 28)      # #14141c near-black body
WHITE  = (245, 247, 255)   # #f5f7ff visor
YELLOW = (255, 230, 0)     # #ffe600 accents
OUT = 9

img = [[BG] * W for _ in range(H)]

def setpx(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img[y][x] = c

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def shade(c, f):
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

# --- Contact shadow ---
for y in range(880, 1010):
    for x in range(290, 790):
        dx = (x - 540) / 250
        dy = (y - 944) / 52
        r2 = dx * dx + dy * dy
        if r2 <= 1:
            a = (1 - r2) * 0.30
            img[y][x] = blend(img[y][x], (96, 86, 68), a)

def orect(x0, y0, x1, y1, c):
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

# --- Feet (black boots) ---
orect(390, 850, 484, 916, (10, 10, 14))
orect(596, 850, 690, 916, (10, 10, 14))

# --- Body (near-black) ---
orect(380, 570, 700, 858, BODY)
for x in range(380, 408):
    for y in range(570, 858):
        setpx(x, y, (12, 12, 16))
for x in range(672, 700):
    for y in range(570, 858):
        setpx(x, y, (12, 12, 16))

# --- Shoulder plates ---
orect(336, 586, 388, 700, (10, 10, 14))
orect(692, 586, 744, 700, (10, 10, 14))

# --- Arms (dark + yellow gauntlets) ---
orect(330, 580, 398, 742, (30, 30, 40))
orect(682, 580, 750, 742, (30, 30, 40))
orect(330, 690, 398, 750, YELLOW)
orect(682, 690, 750, 750, YELLOW)

# --- Yellow reactor core + white center ---
orect(468, 636, 612, 780, YELLOW)
orect(504, 668, 576, 744, WHITE)
orect(522, 688, 558, 724, (10, 10, 20))

# --- Head (blue) ---
orect(360, 368, 720, 590, BLUE)
for x in range(360, 390):
    for y in range(368, 590):
        setpx(x, y, BLUED)
for x in range(690, 720):
    for y in range(368, 590):
        setpx(x, y, BLUED)

# --- Dark headband ---
orect(352, 402, 728, 428, (10, 10, 14))

# --- White visor strip ---
orect(428, 442, 652, 478, WHITE)
# --- Yellow eye dots ---
orect(452, 496, 492, 532, YELLOW)
orect(588, 496, 628, 532, YELLOW)
# --- Mouth vent (dark) ---
orect(512, 548, 568, 560, (10, 10, 14))

# --- Antennae (blue shafts + yellow tips) ---
orect(478, 286, 498, 372, BLUE)
orect(582, 286, 602, 372, BLUE)
orect(470, 258, 506, 292, YELLOW)
orect(574, 258, 610, 292, YELLOW)

# --- PNG encode ---
raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in img)
def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
       + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
open('assets/robot6_portrait.png', 'wb').write(png)
print('written', len(png), 'bytes')
