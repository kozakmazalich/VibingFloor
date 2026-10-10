import zlib, struct

W = H = 1080
BG     = (235, 228, 212)
BLACK  = (20, 22, 26)     # #14161a
PURPLE = (92, 54, 176)    # #5c36b0
PURD   = (72, 41, 140)    # darker purple shade (depth)
BLUE   = (104, 111, 254)  # #686ffe
CREAM  = (253, 247, 211)  # #fdf7d3
OUT = 9                    # outline thickness

img = [[BG] * W for _ in range(H)]

def setpx(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img[y][x] = c

def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            setpx(x, y, c)

def orect(x0, y0, x1, y1, c):
    rect(x0 - OUT, y0 - OUT, x1 + OUT, y1 + OUT, BLACK)
    rect(x0, y0, x1, y1, c)

def fill_tri(v0, v1, v2, c):
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
        k = OUT * 1.35 / L
        return (v[0] + dx * k, v[1] + dy * k)
    fill_tri(ex(v0), ex(v1), ex(v2), BLACK)
    fill_tri(v0, v1, v2, c)

# --- Feet / boots (blue) ---
orect(388, 838, 478, 908, BLUE)
orect(602, 838, 692, 908, BLUE)
rect(388, 872, 478, 908, PURD)   # sole depth
rect(602, 872, 692, 908, PURD)

# --- Body (purple) ---
orect(370, 560, 710, 848, PURPLE)
# Side shading strips for depth
rect(370, 560, 396, 848, PURD)
rect(684, 560, 710, 848, PURD)

# --- Body spikes (cream quills poking out the sides) ---
otri((370, 600), (378, 700), (268, 650), CREAM)
otri((368, 640), (372, 720), (255, 700), CREAM)
otri((710, 600), (702, 700), (812, 650), CREAM)
otri((712, 640), (708, 720), (825, 700), CREAM)

# --- Belly plate (blue) ---
orect(438, 620, 642, 780, BLUE)

# --- Arms (purple with blue paws) ---
orect(322, 570, 396, 730, PURPLE)
orect(684, 570, 758, 730, PURPLE)
orect(322, 680, 396, 738, BLUE)   # paws
orect(684, 680, 758, 738, BLUE)

# --- Head (purple) ---
orect(342, 360, 738, 592, PURPLE)
rect(342, 360, 372, 592, PURD)    # side shading
rect(708, 360, 738, 592, PURD)

# --- Head spikes (cream mohawk, outlined) ---
otri((398, 396), (462, 390), (408, 268), CREAM)
otri((458, 388), (522, 384), (472, 246), CREAM)
otri((518, 386), (582, 384), (536, 234), CREAM)
otri((578, 384), (642, 388), (600, 246), CREAM)
otri((638, 390), (702, 396), (668, 268), CREAM)
# Side head spikes
otri((342, 400), (352, 490), (238, 452), CREAM)
otri((738, 400), (728, 490), (842, 452), CREAM)

# --- Blue top band on head ---
rect(360, 372, 720, 398, BLUE)

# --- Face plate (cream) ---
orect(398, 418, 682, 566, CREAM)
# Blue cheek tints
orect(398, 492, 428, 532, BLUE)
orect(652, 492, 682, 532, BLUE)

# --- Eyes (black) ---
orect(442, 448, 496, 508, BLACK)
orect(584, 448, 638, 508, BLACK)
# Cream eye glints
rect(466, 466, 484, 484, CREAM)
rect(608, 466, 626, 484, CREAM)

# --- Nose (black) ---
orect(524, 500, 556, 538, BLACK)

# --- Mouth (dark thin) ---
rect(516, 550, 564, 558, BLACK)

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
