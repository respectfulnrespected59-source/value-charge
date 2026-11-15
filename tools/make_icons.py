"""Draw the VALUE CHARGE app icons: the orange fuel drop with the cream bolt, on navy.

Same shapes as the header logo (42x50 SVG viewBox). Writes public/img/icon-512.png,
icon-192.png and apple-touch-icon.png (180). The mark sits inside the centre 60% so
Android's maskable crop never clips it.
Usage: python tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

NAVY = (8, 24, 38)
ORANGE = (207, 91, 46)
CREAM = (255, 224, 202)
SIZE = 512
SUPERSAMPLE = 4
OUT = Path(__file__).resolve().parent.parent / "public" / "img"

# The logo drop: four cubic segments, absolute coordinates in the 42x50 viewBox.
DROP = [
    ((21, 1), (11, 12), (3, 20), (3, 31)),
    ((3, 31), (3, 42), (11, 49), (21, 49)),
    ((21, 49), (31, 49), (39, 42), (39, 31)),
    ((39, 31), (39, 20), (31, 12), (21, 1)),
]
BOLT = [(23, 12), (12, 31), (20, 31), (18, 43), (31, 22), (22, 22), (23, 12)]


def cubic(p0, p1, p2, p3, steps=40):
    points = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def draw_icon() -> Image.Image:
    big = SIZE * SUPERSAMPLE
    img = Image.new("RGB", (big, big), NAVY)
    d = ImageDraw.Draw(img)
    scale = big * 0.58 / 50
    offset_x = (big - 42 * scale) / 2
    offset_y = (big - 50 * scale) / 2
    place = lambda pts: [(offset_x + x * scale, offset_y + y * scale) for x, y in pts]
    outline = [pt for seg in DROP for pt in cubic(*seg)]
    d.polygon(place(outline), fill=ORANGE)
    d.polygon(place(BOLT), fill=CREAM)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon = draw_icon()
    for name, px in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)):
        icon.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)
        print(f"wrote {name} {px}x{px}")


if __name__ == "__main__":
    main()
