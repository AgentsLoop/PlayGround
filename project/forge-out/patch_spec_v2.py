#!/usr/bin/env python3
"""Spec v2: structural pass — fix factory-consumed colors to hex, fix map URLs
to server-relative paths, and reshape the humanoid blockout toward Renamon's
silhouette (tall ears, snout, purple sleeves, white gloves/feet, bushy tail).

Re-run strict validation after patching; the spec stays the authority.
"""
import copy
import json
from pathlib import Path

SPEC = Path("project/forge-out/object-sculpt-spec.json")
d = json.loads(SPEC.read_text())
# idempotent: drop previously appended tail segments before re-adding
d["componentTree"] = [c for c in d["componentTree"]
                      if c.get("id") not in ("tail", "tail-tip")]

HEX = {
    "base": ("#FED954", "#BDA13E"),
    "hidden": ("#BDA13E", "#8A7A3A"),
    "skin": ("#FED954", "#BDA13E"),
    "hair": ("#F8F8F8", "#D8D8D8"),
    "shirt": ("#7B5AA6", "#583E80"),
    "pants": ("#FED954", "#7B5AA6"),
    "shoes": ("#F8F8F8", "#1A1A1E"),
    "eye": ("#2A5DB0", "#101418"),
    "lips": ("#1A1A1E", "#0E0D0B"),
}
PBR = {
    "albedo": "forge-out/pbr/renamon-fur_albedo.png",
    "roughness": "forge-out/pbr/renamon-fur_roughness.png",
    "height": "forge-out/pbr/renamon-fur_height.png",
    "normal": "forge-out/pbr/renamon-fur_normal.png",
    "ao": "forge-out/pbr/renamon-fur_ao.png",
}

for m in d["materials"]:
    dom, sec = HEX[m["id"]]
    m["baseColor"] = dom
    m["color"] = dom
    if isinstance(m.get("albedo"), dict):
        m["albedo"]["dominant"] = dom
        m["albedo"]["secondary"] = [sec]
    if isinstance(m.get("colorVariation"), dict):
        m["colorVariation"]["palette"] = [dom, sec]
    if isinstance(m.get("roughness"), dict):
        m["roughness"]["map"] = PBR["roughness"]
    rp = m.get("referencePbr")
    if isinstance(rp, dict):
        rp["sourceImage"] = "assets/renamon-reference.png"
        rp["maps"] = {k: {"path": v, "url": v} for k, v in PBR.items()}

d["sourceImage"] = "assets/renamon-reference.png"

comps = {c["id"]: c for c in d["componentTree"]}

def rescale(cid, sx=1, sy=1, sz=1):
    c = comps[cid]
    t = c["transform"]
    s = t["scale"]
    t["scale"] = [s[0] * sx, s[1] * sy, s[2] * sz]
    dims = c.get("dimensions", {})
    for k, f in (("width", sx), ("height", sy), ("depth", sz)):
        if k in dims:
            dims[k] = dims[k] * f

def move(cid, dx=0, dy=0, dz=0):
    p = comps[cid]["transform"]["position"]
    comps[cid]["transform"]["position"] = [p[0] + dx, p[1] + dy, p[2] + dz]

def tilt(cid, rx=0, ry=0, rz=0):
    r = comps[cid]["transform"]["rotation"]
    comps[cid]["transform"]["rotation"] = [r[0] + rx, r[1] + ry, r[2] + rz]

# tall erect fox ears
for ear, sgn in (("ear-l", 1), ("ear-r", -1)):
    rescale(ear, sx=0.55, sy=2.3, sz=0.7)
    tilt(ear, rz=-0.22 * sgn)
    move(ear, dx=0.03 * sgn, dy=0.10)
# fox head: longer snout axis
rescale("head", sz=1.18)
# snout forward
rescale("nose", sz=1.9, sx=0.8)
move("nose", dz=0.07)
# chest ruff: bigger, lower toward chest
rescale("hair", sx=1.35, sy=1.5, sz=1.2)
move("hair", dy=-0.10, dz=0.03)
# baggy purple sleeves
for arm in ("forearm-l", "forearm-r"):
    comps[arm]["material"] = "shirt"
    comps[arm]["materialLayers"] = ["shirt"]
    rescale(arm, sx=1.7, sz=1.7)
# white gloves
for h in ("hand-l", "hand-r", "thumb-l-1", "thumb-l-2", "thumb-l-3",
          "index-l-1", "index-l-2", "index-l-3", "middle-l-1", "middle-l-2",
          "middle-l-3", "ring-l-1", "ring-l-2", "ring-l-3",
          "little-l-1", "little-l-2", "little-l-3",
          "thumb-r-1", "thumb-r-2", "thumb-r-3",
          "index-r-1", "index-r-2", "index-r-3", "middle-r-1", "middle-r-2",
          "middle-r-3", "ring-r-1", "ring-r-2", "ring-r-3",
          "little-r-1", "little-r-2", "little-r-3"):
    if h in comps:
        comps[h]["material"] = "hair"
        comps[h]["materialLayers"] = ["hair"]
# white lower legs / feet (claws come from shoes-material texture + repetition)
for leg in ("shin-l", "shin-r", "foot-l", "foot-r"):
    comps[leg]["material"] = "shoes"
    comps[leg]["materialLayers"] = ["shoes"]
# digitigrade hint: larger feet
rescale("foot-l", sx=1.25, sy=0.9, sz=1.5)
rescale("foot-r", sx=1.25, sy=0.9, sz=1.5)

# bushy tail: two tapered segments chained off the pelvis
thigh = comps["thigh-l"]
tail = copy.deepcopy(thigh)
tail.update({
    "id": "tail", "name": "Tail base",
    "level": "meso", "role": "tail",
    "importance": 0.95, "confidence": 0.75,
    "primitive": "capsule",
    "parent": "pelvis",
    "material": "skin", "materialLayers": ["skin"],
    "attachment": {
        "parentSocket": "pelvis-back",
        "localStart": [0.0, -0.05, -0.16],
        "localEnd": [0.0, -0.35, -0.75],
        "contactType": "socket-joint",
        "baseRadius": 0.09, "endRadius": 0.055,
        "embedDepth": 0.03, "gapTolerance": 0.01,
        "evidenceRefs": ["full-object"],
    },
    "dimensions": {"width": 0.16, "height": 0.72, "depth": 0.16,
                   "units": "relative", "confidence": 0.75},
    "transform": {"position": [0.0, -0.05, -0.16], "rotation": [0.5, 0, 0],
                  "scale": [0.16, 0.72, 0.16]},
    "localFeatures": [
        {"id": "tail-base", "description": "thick golden tail root sweeping back",
         "evidence": "observed in assets/renamon-reference.png"}],
    "evidenceRefs": ["full-object"],
    "details": [], "fidelityTier": "structural-pass",
})
tail["actionProfile"] = copy.deepcopy(thigh["actionProfile"])
tail["actionProfile"]["animationRole"] = "tail-sway"
tail["actionProfile"]["sockets"] = [{"id": "tail-tip-socket",
                                     "localPosition": [0.0, -0.35, -0.75]}]
tail["colorMaterialRecipe"] = {
    "dominantAlbedo": "rgba(254, 217, 84, 1)",
    "secondaryAlbedo": "rgba(189, 161, 62, 1)",
    "materialClass": "skin", "materialClassConfidence": 0.85,
    "colorGradient": {"type": "linear", "stops": [
        {"color": "rgba(254, 217, 84, 1)"},
        {"color": "rgba(189, 161, 62, 1)"}]},
    "evidence": "reference pixels from assets/renamon-reference.png",
}
tip = copy.deepcopy(tail)
tip.update({
    "id": "tail-tip", "name": "Tail tip",
    "parent": "tail", "level": "micro", "role": "tail",
    "material": "hair", "materialLayers": ["hair"],
    "attachment": {
        "parentSocket": "tail-tip-socket",
        "localStart": [0.0, -0.35, -0.75],
        "localEnd": [0.0, -0.42, -1.05],
        "contactType": "socket-joint",
        "baseRadius": 0.055, "endRadius": 0.012,
        "embedDepth": 0.02, "gapTolerance": 0.01,
        "evidenceRefs": ["full-object"],
    },
    "dimensions": {"width": 0.09, "height": 0.34, "depth": 0.09,
                   "units": "relative", "confidence": 0.75},
    "transform": {"position": [0.0, -0.35, -0.75], "rotation": [0.35, 0, 0],
                  "scale": [0.09, 0.34, 0.09]},
    "localFeatures": [
        {"id": "tail-tip-white", "description": "white tail tip with jagged edge",
         "evidence": "observed in assets/renamon-reference.png"}],
})
tip["colorMaterialRecipe"] = {
    "dominantAlbedo": "rgba(248, 248, 248, 1)",
    "secondaryAlbedo": "rgba(216, 216, 216, 1)",
    "materialClass": "skin", "materialClassConfidence": 0.85,
    "colorGradient": {"type": "linear", "stops": [
        {"color": "rgba(248, 248, 248, 1)"},
        {"color": "rgba(216, 216, 216, 1)"}]},
    "evidence": "reference pixels from assets/renamon-reference.png",
}
d["componentTree"].append(tail)
d["componentTree"].append(tip)

# inventory: link the new tail-tip detail
inv = d["preSpecAssessment"]["detailInventory"]
inv["details"] = [x for x in inv["details"] if x["id"] != "d-tail"]
inv["details"].extend([
    {"id": "d-tail", "kind": "contour",
     "description": "long bushy tail sweeping back, golden", "region": {
         "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "scale": "macro", "affects": "silhouette",
     "mapsTo": {"type": "component", "ref": "tail"},
     "evidenceRef": "assets/renamon-reference.png", "confidence": 0.85},
    {"id": "d-tail-tip", "kind": "contour",
     "description": "white tail tip with jagged edge", "region": {
         "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
     "scale": "meso", "affects": "silhouette-and-material",
     "mapsTo": {"type": "component", "ref": "tail-tip"},
     "evidenceRef": "assets/renamon-reference.png", "confidence": 0.85},
])
inv["targetMinDetails"] = 10

SPEC.write_text(json.dumps(d, indent=1))
n = len(d["componentTree"])
micro = sum(len(c.get("localFeatures", [])) for c in d["componentTree"])
print(f"spec v2: components={n} microFeatures={micro} details={len(inv['details'])}")
