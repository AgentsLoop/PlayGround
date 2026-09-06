#!/usr/bin/env python3
"""Spec v3: per-material flat albedo maps (stdlib PNG writer).

A whole-photo albedo map smeared the reference across every part's UVs.
For this flat-shaded anime subject the correct evidence is one albedo field
per material region, sampled from the extraction palette. Roughness/height/
normal/AO stay shared (independent, non-color channels).
"""
import json
import struct
import zlib
from pathlib import Path

OUT_DIR = Path("project/forge-out/pbr")
SPEC = Path("project/forge-out/object-sculpt-spec.json")


def write_flat_png(path, rgb, size=64):
    r, g, b = rgb
    raw = b"".join(b"\x00" + bytes([r, g, b]) * size for _ in range(size))

    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


d = json.loads(SPEC.read_text())
FLAT = {
    "base": "#FED954", "hidden": "#BDA13E", "skin": "#FED954",
    "hair": "#F8F8F8", "shirt": "#7B5AA6", "pants": "#FED954",
    "shoes": "#F8F8F8", "eye": "#2A5DB0", "lips": "#1A1A1E",
}
for m in d["materials"]:
    mid = m["id"]
    flat = OUT_DIR / f"renamon-{mid}_albedo-flat.png"
    write_flat_png(flat, hex_to_rgb(FLAT[mid]))
    rel = f"forge-out/pbr/{flat.name}"
    rp = m.get("referencePbr")
    if isinstance(rp, dict) and isinstance(rp.get("maps"), dict):
        rp["maps"]["albedo"] = {"path": rel, "url": rel}
        rp["method"] = ("single-image pixel evidence; albedo reduced to per-region "
                        "flat field because the subject is flat-shaded anime cel color "
                        "(palette sampled from extraction)")

SPEC.write_text(json.dumps(d, indent=1))
print("spec v3: per-material flat albedo maps written")
