# META VIBER portrait — blocky robot rendered with 3D-style shading
# (orange head + cyan visor, gunmetal body, reactor core, antennae).
# Same style family as the other robot portraits. Pure stdlib PNG encoder.
import zlib, struct

W = H = 1080
BG     = (235, 228, 212)
BLACK  = (20, 22, 26)      # #14161a outline
ORANGE = (255, 140, 26)    # #ff8c1a head
CORE   = (255, 92, 26)     # #ff5c1a accent core
GUN    = (35, 35, 46)      # #23232e body
GUND   = (24, 24, 32)      # darker gunmetal shade
CYAN   = (0, 229, 255)     # #00e5ff visor
WHITE  = (232, 246, 255)   # #e8f6ff eye slits
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

# --- Feet (dark boots) ---
orect(390, 850, 484, 916, (17, 17, 24))
orect(596, 850, 690, 916, (17, 17, 24))

# --- Body (gunmetal) ---
orect(380, 570, 700, 858, GUN)
rect = None
# Side shading strips
for x in range(380, 408):
    for y in range(570, 858):
        setpx(x, y, GUND)
for x in range(672, 700):
    for y in range(570, 858):
        setpx(x, y, GUND)

# --- Shoulder plates ---
orect(336, 586, 388, 700, (12, 12, 18))
orect(692, 586, 744, 700, (12, 12, 18))

# --- Arms (gunmetal + orange gauntlets) ---
orect(330, 580, 398, 742, GUN)
orect(682, 580, 750, 742, GUN)
orect(330, 690, 398, 750, CORE)
orect(682, 690, 750, 750, CORE)

# --- Reactor core (orange ring + cyan center) ---
orect(468, 636, 612, 780, CORE)
orect(504, 668, 576, 744, CYAN)
orect(522, 688, 558, 724, (10, 10, 20))

# --- Head (orange) ---
orect(360, 368, 720, 590, ORANGE)
for x in range(360, 390):
    for y in range(368, 590):
        setpx(x, y, shade(ORANGE, -0.35))
for x in range(690, 720):
    for y in range(368, 590):
        setpx(x, y, shade(ORANGE, -0.35))

# --- Dark headband ---
orect(352, 402, 728, 428, (10, 10, 14))

# --- Cyan visor strip ---
orect(428, 442, 652, 478, CYAN)
# --- White eye slits ---
orect(452, 496, 492, 532, WHITE)
orect(588, 496, 628, 532, WHITE)
# --- Mouth vent (dark) ---
orect(512, 548, 568, 560, (10, 10, 14))

# --- Antennae ---
orect(478, 286, 498, 372, ORANGE)
orect(582, 286, 602, 372, ORANGE)
orect(470, 258, 506, 292, CYAN)
orect(574, 258, 610, 292, CYAN)

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
