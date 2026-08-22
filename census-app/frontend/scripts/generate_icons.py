#!/usr/bin/env python3
"""Generate the PWA icon set for the India Census 2026-27 app.

Uses only the Python standard library (zlib + struct) so icons can be
regenerated on any machine without installing image libraries:

    python3 scripts/generate_icons.py

Writes public/icons/icon-192.png, icon-512.png and icon-maskable-512.png.
The matching vector icon lives at public/icons/icon.svg.
"""

from __future__ import annotations

import math
import pathlib
import struct
import zlib

SAFFRON = (255, 153, 51)
WHITE = (255, 255, 255)
GREEN = (19, 136, 8)
NAVY = (0, 0, 128)

SUPERSAMPLE = 3
SPOKES = 24


def _rounded_rect_contains(x: float, y: float, radius: float) -> bool:
    """Point-in-rounded-unit-square test, coordinates in 0..1."""
    cx = min(max(x, radius), 1.0 - radius)
    cy = min(max(y, radius), 1.0 - radius)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= radius * radius


def _chakra_color(x: float, y: float, outer: float) -> tuple[int, int, int] | None:
    """Return the navy chakra colour at a point, or None if it is not covered."""
    dx, dy = x - 0.5, y - 0.5
    dist = math.hypot(dx, dy)
    if dist > outer:
        return None

    rim_inner = outer * 0.84
    if dist >= rim_inner:
        return NAVY
    if dist <= outer * 0.14:  # hub
        return NAVY

    # Spokes: radial lines every 360/24 degrees, thickness grows with radius so
    # they read as a wheel rather than a starburst.
    angle = math.atan2(dy, dx)
    step = 2 * math.pi / SPOKES
    offset = abs(((angle + step / 2) % step) - step / 2)
    half_width = (outer * 0.035) / max(dist, 1e-6)
    if offset <= half_width:
        return NAVY
    return None


def _sample(x: float, y: float, *, maskable: bool) -> tuple[int, int, int, int]:
    """Colour of the icon at normalised point (x, y)."""
    if maskable:
        inside = True
        chakra_outer = 0.155  # keep inside the 80% maskable safe zone
    else:
        inside = _rounded_rect_contains(x, y, 0.22)
        chakra_outer = 0.20

    if not inside:
        return (0, 0, 0, 0)

    chakra = _chakra_color(x, y, chakra_outer)
    if chakra is not None:
        return (*chakra, 255)

    if y < 1 / 3:
        band = SAFFRON
    elif y < 2 / 3:
        band = WHITE
    else:
        band = GREEN
    return (*band, 255)


def render(size: int, *, maskable: bool = False) -> bytes:
    """Render the icon to raw RGBA rows with supersampled anti-aliasing."""
    ss = SUPERSAMPLE
    samples = ss * ss
    rows: list[bytes] = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                y = (py + (sy + 0.5) / ss) / size
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    sr, sg, sb, sa = _sample(x, y, maskable=maskable)
                    # Premultiply so transparent corners do not darken edges.
                    r += sr * sa
                    g += sg * sa
                    b += sb * sa
                    a += sa
            if a == 0:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / samples)))
        rows.append(bytes(row))
    return b"".join(b"\x00" + row for row in rows)


def write_png(path: pathlib.Path, size: int, *, maskable: bool = False) -> None:
    raw = render(size, maskable=maskable)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f"wrote {path} ({len(png):,} bytes)")


# Android launcher buckets. One source of truth for web and app icons.
ANDROID_DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def write_android_icons(res_dir: pathlib.Path) -> None:
    """Emit res/mipmap-*/ic_launcher.png for the Android wrapper."""
    for density, size in ANDROID_DENSITIES.items():
        write_png(res_dir / f"mipmap-{density}" / "ic_launcher.png", size)
        # Round icons are what launchers pick on most modern devices; the
        # rounded-square artwork already reads correctly when masked.
        write_png(res_dir / f"mipmap-{density}" / "ic_launcher_round.png", size)


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    icons = root / "public" / "icons"
    write_png(icons / "icon-192.png", 192)
    write_png(icons / "icon-512.png", 512)
    write_png(icons / "icon-maskable-512.png", 512, maskable=True)

    android_res = root.parent / "android" / "res"
    if android_res.parent.is_dir():
        write_android_icons(android_res)


if __name__ == "__main__":
    main()
