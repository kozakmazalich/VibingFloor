# Arena preview thumbnails — blocky neon renders matching each map's theme.
# Pure stdlib PNG encoder, 240x240 each.
import zlib, struct, math

W = H = 240
BG = (10, 10, 20)  # #0a0a14 void

img = [[BG] * W for _ in range(H)]

def setpx(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img[y][x] = c

def blendpx(x, y, c, a):
    if 0 <= x < W and 0 <= y < H:
        old = img[y][x]
        img[y][x] = tuple(int(old[i] + (c[i] - old[i]) * a) for i in range(3))

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def rect(x0, y0, x1, y1, c):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            setpx(x, y, c)

def orect(x0, y0, x1, y1, c, o=(3, 3, 5), alpha=0):
    # outline color o + fill c (alpha=0 → solid)
    for y in range(int(y0) - 4, int(y1) + 5):
        for x in range(int(x0) - 4, int(x1) + 5):
            inside = int(x0) <= x <= int(x1) and int(y0) <= y <= int(y1)
            if alpha:
                blendpx(x, y, o if not inside else c, alpha if inside else 0.9)
            else:
                setpx(x, y, c if inside else o)

def glow_rect(x0, y0, x1, y1, c):
    for (pad, a) in [(6, 0.18), (12, 0.08)]:
        for y in range(int(y0) - pad, int(y1) + pad + 1):
            for x in range(int(x0) - pad, int(x1) + pad + 1):
                inside = int(x0) <= x <= int(x1) and int(y0) <= y <= int(y1)
                if not inside:
                    blendpx(x, y, c, a)

def poly(verts, c):
    # convex polygon fill (ray cast)
    ys = [v[1] for v in verts]
    xs = [v[0] for v in verts]
    miny, maxy = max(0, int(min(ys))), min(H - 1, int(max(ys)))
    minx, maxx = max(0, int(min(xs))), min(W - 1, int(max(xs)))
    n = len(verts)
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            inside = False
            j = n - 1
            for i in range(n):
                xi, yi = verts[i]
                xj, yj = verts[j]
                if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                    inside = not inside
                j = i
            if inside:
                setpx(x, y, c)

def outlined_poly(verts, c, o, thick=4):
    cx = sum(v[0] for v in verts) / len(verts)
    cy = sum(v[1] for v in verts) / len(verts)
    outer = []
    for (x, y) in verts:
        dx, dy = x - cx, y - cy
        L = (dx * dx + dy * dy) ** 0.5 or 1
        outer.append((x + dx / L * thick * 1.3, y + dy / L * thick * 1.3))
    poly(outer, o)
    poly(verts, c)

def thick_line(x0, y0, x1, y1, c, t=3):
    steps = max(1, int(max(abs(x1 - x0), abs(y1 - y0))))
    for i in range(steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = y0 + (y1 - y0) * i / steps
        for dy in range(-t, t + 1):
            for dx in range(-t, t + 1):
                if dx * dx + dy * dy <= t * t:
                    setpx(int(x + dx), int(y + dy), c)

def hexagon(cx, cy, r, rot=0.0):
    return [
        (cx + r * math.cos(rot + math.pi / 3 * i), cy + r * math.sin(rot + math.pi / 3 * i))
        for i in range(6)
    ]

def save(name):
    raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in img)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(f"assets/{name}.png", "wb").write(png)
    print("written", name, len(png), "bytes")

def vignette():
    for y in range(H):
        for x in range(W):
            dx = (x - W / 2) / (W / 2)
            dy = (y - H / 2) / (H / 2)
            d = (dx * dx + dy * dy) ** 0.5
            if d > 0.75:
                blendpx(x, y, (0, 0, 0), (d - 0.75) * 0.5)

# ---------- 1. CYBER ARENA: cyan tile grid ----------
vignette()
for r in range(5):
    for c in range(5):
        x0 = 22 + c * 40
        y0 = 22 + r * 40
        glow_rect(x0, y0, x0 + 34, y0 + 34, (0, 229, 255))
        orect(x0, y0, x0 + 34, y0 + 34, (26, 32, 56), o=(0, 229, 255))
        # center tile core glow
        if r == 2 and c == 2:
            orect(x0 + 8, y0 + 8, x0 + 26, y0 + 26, (0, 229, 255), o=(0, 229, 255))
save("map_classic")

# ---------- 2. ISLAND ARCHIPELAGO: green islets + palms ----------
img = [[BG] * W for _ in range(H)]
vignette()
islets = [[(40, 44)], [(176, 44)], [(44, 176)], [(172, 172)]]
for cluster in islets:
    for (bx, by) in cluster:
        # 2x2 blob of tiles per islet
        tiles = [(bx, by), (bx + 18, by), (bx, by + 18), (bx + 18, by + 18)]
        for (x0, y0) in tiles:
            glow_rect(x0, y0, x0 + 16, y0 + 16, (43, 255, 158))
            orect(x0, y0, x0 + 16, y0 + 16, (20, 36, 29), o=(43, 255, 158))
        # palm: trunk + crown
        px, py = bx + 18, by + 18
        orect(px - 2, py - 14, px + 2, py, (150, 120, 70), o=(43, 255, 158))
        for (dx, dy) in [(-7, -18), (7, -18), (0, -22)]:
            rect(px + dx - 3, py + dy - 3, px + dx + 3, py + dy + 3, (43, 255, 158))
# central raised core
glow_rect(104, 104, 136, 136, (43, 255, 158))
orect(104, 104, 136, 136, (24, 60, 42), o=(43, 255, 158))
orect(112, 112, 128, 128, (43, 255, 158), o=(43, 255, 158))
save("map_archipelago")

# ---------- 3. TWIN CITADELS: two towers + bridge ----------
img = [[BG] * W for _ in range(H)]
vignette()
for tx in (44, 152):
    # tower body
    glow_rect(tx, 62, tx + 44, 190, (255, 176, 32))
    orect(tx, 62, tx + 44, 190, (36, 26, 14), o=(255, 176, 32))
    # crenellations
    for cx in range(tx + 2, tx + 42, 10):
        orect(cx, 50, cx + 7, 62, (36, 26, 14), o=(255, 176, 32))
    # magenta windows
    for wy in (84, 108, 132, 156):
        for wx in (tx + 9, tx + 25):
            rect(wx, wy, wx + 9, wy + 12, (255, 45, 149))
# bridge
glow_rect(88, 120, 152, 138, (255, 176, 32))
orect(88, 120, 152, 138, (36, 26, 14), o=(255, 176, 32))
thick_line(88, 129, 152, 129, (255, 45, 149), 2)
# base platform
orect(30, 192, 210, 206, (36, 26, 14), o=(255, 176, 32))
save("map_twin_citadels")

# ---------- 4. HONEYCOMB CHASM: violet hex ring + spire ----------
img = [[BG] * W for _ in range(H)]
vignette()
outer = hexagon(120, 120, 92)
inner = hexagon(120, 120, 66)
# ring = outer minus inner
outlined_poly(outer, (28, 20, 40), (180, 107, 255), thick=5)
poly(inner, BG)
poly(inner, (28, 20, 40))
# ring outline: inner rim too
outlined_poly(inner, (28, 20, 40), (180, 107, 255), thick=3)
# central spire
glow_rect(112, 112, 128, 128, (180, 107, 255))
orect(112, 112, 128, 128, (180, 107, 255), o=(180, 107, 255))
# spokes from ring to center
for i in range(6):
    ang = math.pi / 3 * i
    x1 = 120 + 74 * math.cos(ang)
    y1 = 120 + 74 * math.sin(ang)
    thick_line(120, 120, x1, y1, (80, 46, 130), 2)
save("map_chasm_ring")
