from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ACTIVE_DIR = ROOT / "assets" / "heroes" / "ladino"
SOURCE_DIR = ROOT / "ladino"
GODOT_DIR = ROOT / "godot_poc" / "characters" / "ladino"
BACKUP_DIR = ROOT / "backups" / "ladino_hood_original_20260814_1508"

# Polígonos deliberadamente limitados à peça que cobre a cabeça. A seleção
# final ainda exige cromaticidade violeta, preservando rosto, cabelo, máscara,
# acabamento dourado, armas e qualquer elemento que atravesse a região.
ACTIVE_POLYGONS: dict[str, list[tuple[int, int]]] = {
    "ladino_attack_1.png": [(128, 63), (365, 63), (365, 256), (128, 256)],
    "ladino_attack_2.png": [(194, 24), (453, 24), (453, 236), (194, 236)],
    "ladino_attack_3.png": [(214, 43), (441, 43), (441, 274), (214, 274)],
    "ladino_attack_4.png": [(85, 207), (126, 174), (226, 160), (309, 209), (304, 252), (262, 295), (158, 294), (84, 253)],
    "ladino_attack_5.png": [(143, 229), (171, 184), (282, 170), (360, 220), (356, 277), (309, 335), (210, 331), (145, 283)],
    "ladino_attack_6.png": [(143, 68), (401, 68), (401, 280), (143, 280)],
    "ladino_attack_besta_1.png": [(124, 113), (362, 113), (362, 300), (124, 300)],
    "ladino_attack_besta_2.png": [(87, 244), (238, 244), (238, 364), (87, 364)],
    "ladino_attack_besta_4.png": [(244, 124), (486, 124), (486, 328), (244, 328)],
    "ladino_attack_besta_5.png": [(160, 34), (424, 34), (424, 248), (160, 248)],
    "ladino_death_1.png": [(35, 55), (218, 55), (218, 253), (35, 253)],
    "ladino_death_2.png": [(214, 157), (424, 157), (424, 334), (214, 334)],
    "ladino_death_3.png": [(266, 289), (430, 289), (430, 432), (266, 432)],
    "ladino_hit_1.png": [(72, 44), (342, 44), (342, 267), (72, 267)],
    "ladino_idle_back_1.png": [(124, 47), (359, 47), (359, 316), (124, 316)],
    "ladino_idle_down_1.png": [(137, 43), (369, 43), (369, 216), (137, 216)],
    "ladino_idle_front_1.png": [(137, 43), (369, 43), (369, 216), (137, 216)],
    "ladino_idle_left_1.png": [(166, 45), (384, 45), (384, 232), (166, 232)],
    "ladino_idle_right_1.png": [(114, 43), (348, 43), (348, 226), (114, 226)],
    "ladino_portrait.png": [(10, 4), (114, 4), (114, 91), (10, 91)],
    "ladino_walk_down_1.png": [(87, 30), (375, 30), (375, 260), (87, 260)],
    "ladino_walk_down_2.png": [(101, 32), (370, 32), (370, 266), (101, 266)],
    "ladino_walk_left_1.png": [(86, 33), (370, 33), (370, 244), (86, 244)],
    "ladino_walk_left_2.png": [(66, 32), (360, 32), (360, 244), (66, 244)],
    "ladino_walk_right_1.png": [(73, 67), (391, 67), (391, 252), (73, 252)],
    "ladino_walk_right_2.png": [(112, 112), (363, 112), (363, 286), (112, 286)],
    "ladino_walk_up_1.png": [(108, 45), (395, 45), (395, 309), (108, 309)],
    "ladino_walk_up_2.png": [(109, 31), (403, 31), (403, 326), (109, 326)],
}

SOURCE_TO_ACTIVE = {
    **{f"attack_ladino_punhal_{i}.png": f"ladino_attack_{i}.png" for i in range(1, 7)},
    **{f"attack_ladino_besta_{i}.png": f"ladino_attack_besta_{i}.png" for i in range(1, 6)},
    **{f"death_ladino_{i}.png": f"ladino_death_{i}.png" for i in range(1, 4)},
    "hit_ladino_front.png": "ladino_hit_1.png",
    "idle_ladino_back.png": "ladino_idle_back_1.png",
    "idle_ladino_front.png": "ladino_idle_front_1.png",
    "idle_ladino_left.png": "ladino_idle_left_1.png",
    "idle_ladino_right.png": "ladino_idle_right_1.png",
    "Portrait.png": "ladino_idle_front_1.png",
    **{f"walk_ladino_front_{i}.png": f"ladino_walk_down_{i}.png" for i in range(1, 3)},
    **{f"walk_ladino_back_{i}.png": f"ladino_walk_up_{i}.png" for i in range(1, 3)},
    **{f"walk_ladino_left_{i}.png": f"ladino_walk_left_{i}.png" for i in range(1, 3)},
    **{f"walk_ladino_right_{i}.png": f"ladino_walk_right_{i}.png" for i in range(1, 3)},
}

SOURCE_DIRECT_POLYGONS = {
    "hit_ladino_back.png": [[(39, 20), (190, 20), (190, 165), (39, 165)]],
    "hit_ladino_left.png": [[(45, 23), (195, 23), (195, 172), (45, 172)]],
    "hit_ladino_right.png": [[(33, 20), (180, 20), (180, 165), (33, 165)]],
    # Folhas compostas: polígonos justos evitam tocar os fundos de apresentação.
    "attack_ladino.png": [
        [(70, 88), (118, 58), (194, 62), (230, 112), (218, 193), (84, 196), (58, 138)],
        [(389, 112), (435, 82), (520, 87), (558, 136), (545, 205), (405, 205), (376, 151)],
        [(724, 111), (764, 78), (844, 83), (881, 127), (872, 205), (739, 205), (708, 151)],
        [(1037, 119), (1081, 87), (1160, 92), (1202, 139), (1192, 219), (1050, 218), (1018, 161)],
        [(1437, 145), (1480, 112), (1552, 117), (1602, 164), (1590, 248), (1452, 246), (1420, 188)],
        [(1812, 155), (1855, 125), (1935, 130), (1975, 177), (1964, 252), (1825, 251), (1798, 198)],
        [(76, 447), (118, 415), (195, 422), (235, 470), (225, 548), (87, 548), (58, 491)],
        [(423, 467), (466, 435), (550, 441), (594, 491), (582, 572), (438, 568), (405, 511)],
        [(1436, 480), (1477, 448), (1552, 452), (1594, 498), (1585, 580), (1450, 578), (1418, 524)],
        [(1790, 452), (1835, 421), (1918, 426), (1960, 474), (1950, 558), (1805, 555), (1773, 498)],
    ],
    "death_ladino.png": [
        [(38, 87), (94, 48), (196, 58), (255, 127), (242, 263), (73, 274), (26, 172)],
        [(1030, 295), (1095, 258), (1207, 267), (1289, 332), (1273, 451), (1065, 452), (1010, 362)],
        [(1810, 463), (1866, 425), (1974, 432), (2051, 492), (2034, 603), (1834, 602), (1787, 522)],
    ],
    "ladino_idle.png": [
        [(140, 50), (205, 22), (337, 30), (424, 95), (409, 272), (162, 270), (106, 164)],
        [(670, 58), (731, 24), (869, 30), (973, 94), (958, 274), (699, 272), (642, 160)],
        [(1203, 55), (1270, 24), (1413, 29), (1512, 90), (1496, 310), (1225, 309), (1168, 169)],
        [(1744, 62), (1810, 26), (1950, 32), (2051, 98), (2035, 283), (1770, 279), (1708, 163)],
    ],
}


def make_contact_sheet(output: Path, source_dir: Path = ACTIVE_DIR) -> None:
    paths = sorted(source_dir.glob("*.png"))
    cell_w, cell_h, columns = 196, 224, 5
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGBA", (cell_w * columns, cell_h * rows), (24, 24, 28, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((184, 188), Image.Resampling.LANCZOS)
        x = (index % columns) * cell_w + (cell_w - image.width) // 2
        y = (index // columns) * cell_h + 4 + (188 - image.height) // 2
        checker = Image.new("RGBA", image.size, (42, 42, 47, 255))
        checker.alpha_composite(image)
        sheet.alpha_composite(checker, (x, y))
        label = path.name.removeprefix("ladino_")
        draw.text(((index % columns) * cell_w + 5, (index // columns) * cell_h + 198), label, fill=(245, 245, 245, 255), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output, quality=94)


def recolor_image(source: Path, destination: Path, polygon: list[tuple[int, int]]) -> int:
    image = Image.open(source).convert("RGBA")
    pixels = np.array(image)
    polygon_mask_image = Image.new("1", image.size, 0)
    ImageDraw.Draw(polygon_mask_image).polygon(polygon, fill=1)
    polygon_mask = np.array(polygon_mask_image, dtype=bool)

    rgb = pixels[:, :, :3].astype(np.float32) / 255.0
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    chroma = maximum - minimum
    hue = np.zeros_like(maximum)
    valid = chroma > 1e-5
    red_max = valid & (maximum == rgb[:, :, 0])
    green_max = valid & (maximum == rgb[:, :, 1])
    blue_max = valid & (maximum == rgb[:, :, 2])
    hue[red_max] = ((rgb[:, :, 1][red_max] - rgb[:, :, 2][red_max]) / chroma[red_max]) % 6
    hue[green_max] = (rgb[:, :, 2][green_max] - rgb[:, :, 0][green_max]) / chroma[green_max] + 2
    hue[blue_max] = (rgb[:, :, 0][blue_max] - rgb[:, :, 1][blue_max]) / chroma[blue_max] + 4
    hue /= 6.0
    saturation = np.divide(chroma, maximum, out=np.zeros_like(chroma), where=maximum > 1e-5)

    # Violeta do tecido, incluindo antialiasing e highlights pouco saturados,
    # mas somente dentro do polígono específico do capuz daquele frame.
    purple = (
        (hue >= 0.60)
        & (hue <= 0.95)
        & (saturation >= 0.08)
        & (rgb[:, :, 2] >= rgb[:, :, 0] * 0.98)
        & (rgb[:, :, 2] >= rgb[:, :, 1] * 1.04)
        & (pixels[:, :, 3] > 0)
    )
    mask = polygon_mask & purple
    value = maximum
    graphite = np.clip(16.0 + value * 126.0, 18.0, 132.0)
    pixels[:, :, 0][mask] = (graphite[mask] * 0.88).astype(np.uint8)
    pixels[:, :, 1][mask] = (graphite[mask] * 0.93).astype(np.uint8)
    pixels[:, :, 2][mask] = graphite[mask].astype(np.uint8)

    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, "RGBA").save(destination, optimize=False)
    return int(mask.sum())


def recolor_multiple(source: Path, destination: Path, polygons: list[list[tuple[int, int]]]) -> int:
    current = source
    changed = 0
    temporary = destination.with_suffix(".working.png")
    for index, polygon in enumerate(polygons):
        target = destination if index == len(polygons) - 1 else temporary
        changed += recolor_image(current, target, polygon)
        current = target
    if temporary.exists():
        temporary.unlink()
    return changed


def transform_polygon(active_path: Path, source_path: Path, polygon: list[tuple[int, int]]) -> list[tuple[int, int]]:
    active_bbox = Image.open(active_path).convert("RGBA").getchannel("A").getbbox()
    source_bbox = Image.open(source_path).convert("RGBA").getchannel("A").getbbox()
    if not active_bbox or not source_bbox:
        return []
    ax0, ay0, ax1, ay1 = active_bbox
    sx0, sy0, sx1, sy1 = source_bbox
    return [
        (
            round(sx0 + (x - ax0) * (sx1 - sx0) / max(1, ax1 - ax0)),
            round(sy0 + (y - ay0) * (sy1 - sy0) / max(1, ay1 - ay0)),
        )
        for x, y in polygon
    ]


def make_preview(output_dir: Path) -> None:
    for source in sorted(ACTIVE_DIR.glob("*.png")):
        polygon = ACTIVE_POLYGONS.get(source.name)
        destination = output_dir / source.name
        if polygon is None:
            if source.resolve() == destination.resolve():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            Image.open(source).save(destination)
            continue
        recolor_image(source, destination, polygon)


def make_source_preview(output_dir: Path) -> None:
    for source in sorted(SOURCE_DIR.glob("*.png")):
        destination = output_dir / source.name
        if source.name in SOURCE_DIRECT_POLYGONS:
            recolor_multiple(source, destination, SOURCE_DIRECT_POLYGONS[source.name])
            continue
        active_name = SOURCE_TO_ACTIVE.get(source.name)
        active_polygon = ACTIVE_POLYGONS.get(active_name or "")
        if active_name and active_polygon:
            polygon = transform_polygon(ACTIVE_DIR / active_name, source, active_polygon)
            recolor_image(source, destination, polygon)
        else:
            if source.resolve() == destination.resolve():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            Image.open(source).save(destination)


def source_polygons(source: Path, active_root: Path = ACTIVE_DIR) -> list[list[tuple[int, int]]]:
    if source.name in SOURCE_DIRECT_POLYGONS:
        return SOURCE_DIRECT_POLYGONS[source.name]
    active_name = SOURCE_TO_ACTIVE.get(source.name)
    active_polygon = ACTIVE_POLYGONS.get(active_name or "")
    if active_name and active_polygon:
        return [transform_polygon(active_root / active_name, source, active_polygon)]
    return []


def apply_all() -> None:
    make_preview(ACTIVE_DIR)
    for active in ACTIVE_DIR.glob("*.png"):
        shutil.copyfile(active, GODOT_DIR / active.name)
    for source in sorted(SOURCE_DIR.glob("*.png")):
        polygons = source_polygons(source)
        if polygons:
            recolor_multiple(source, source, polygons)


def polygon_union(size: tuple[int, int], polygons: list[list[tuple[int, int]]]) -> np.ndarray:
    image = Image.new("1", size, 0)
    draw = ImageDraw.Draw(image)
    for polygon in polygons:
        draw.polygon(polygon, fill=1)
    return np.array(image, dtype=bool)


def validate_pair(before: Path, after: Path, polygons: list[list[tuple[int, int]]]) -> dict:
    original = Image.open(before).convert("RGBA")
    modified = Image.open(after).convert("RGBA")
    a = np.array(original)
    b = np.array(modified)
    changed = np.any(a[:, :, :3] != b[:, :, :3], axis=2)
    allowed = polygon_union(original.size, polygons)
    return {
        "size_equal": original.size == modified.size,
        "alpha_equal": bool(np.array_equal(a[:, :, 3], b[:, :, 3])),
        "alpha_bbox_equal": original.getchannel("A").getbbox() == modified.getchannel("A").getbbox(),
        "changed_pixels": int(changed.sum()),
        "changed_outside_hood_mask": int((changed & ~allowed).sum()),
        "transparent_pixels_changed": int((changed & (a[:, :, 3] == 0)).sum()),
    }


def validate_all(report_path: Path) -> None:
    report: dict[str, object] = {"active": {}, "godot": {}, "source": {}}
    active_backup = BACKUP_DIR / "assets_heroes_ladino"
    godot_backup = BACKUP_DIR / "godot_characters_ladino"
    source_backup = BACKUP_DIR / "source_ladino"
    for after in sorted(ACTIVE_DIR.glob("*.png")):
        polygon = ACTIVE_POLYGONS.get(after.name)
        report["active"][after.name] = validate_pair(active_backup / after.name, after, [polygon] if polygon else [])
    for after in sorted(GODOT_DIR.glob("*.png")):
        polygon = ACTIVE_POLYGONS.get(after.name)
        report["godot"][after.name] = validate_pair(godot_backup / after.name, after, [polygon] if polygon else [])
    for after in sorted(SOURCE_DIR.glob("*.png")):
        report["source"][after.name] = validate_pair(source_backup / after.name, after, source_polygons(source_backup / after.name, active_backup))

    entries = [item for group in report.values() for item in group.values()]
    report["summary"] = {
        "active_count": len(report["active"]),
        "godot_count": len(report["godot"]),
        "source_count": len(report["source"]),
        "all_sizes_equal": all(item["size_equal"] for item in entries),
        "all_alpha_equal": all(item["alpha_equal"] for item in entries),
        "all_alpha_bboxes_equal": all(item["alpha_bbox_equal"] for item in entries),
        "changed_outside_hood_mask": sum(item["changed_outside_hood_mask"] for item in entries),
        "transparent_pixels_changed": sum(item["transparent_pixels_changed"] for item in entries),
        "active_godot_identical": all(
            (ACTIVE_DIR / path.name).read_bytes() == path.read_bytes() for path in GODOT_DIR.glob("*.png")
        ),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2, ensure_ascii=False))


def analyze_components() -> None:
    for source in sorted(ACTIVE_DIR.glob("*.png")):
        pixels = np.array(Image.open(source).convert("RGBA"))
        rgb = pixels[:, :, :3].astype(np.float32) / 255.0
        maximum, minimum = rgb.max(axis=2), rgb.min(axis=2)
        saturation = np.divide(maximum - minimum, maximum, out=np.zeros_like(maximum), where=maximum > 1e-5)
        candidate = (pixels[:, :, 3] > 24) & (rgb[:, :, 2] > rgb[:, :, 0] * 1.08) & (rgb[:, :, 2] > rgb[:, :, 1] * 1.15) & (saturation > 0.18) & (maximum < 0.72)
        visited = np.zeros(candidate.shape, dtype=bool)
        components: list[tuple[int, tuple[int, int, int, int]]] = []
        height, width = candidate.shape
        for y, x in zip(*np.where(candidate & ~visited)):
            if visited[y, x]:
                continue
            queue = deque([(int(x), int(y))])
            visited[y, x] = True
            count = 0
            min_x = max_x = int(x)
            min_y = max_y = int(y)
            while queue:
                px, py = queue.popleft()
                count += 1
                min_x, max_x = min(min_x, px), max(max_x, px)
                min_y, max_y = min(min_y, py), max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and candidate[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((nx, ny))
            if count >= 80:
                components.append((count, (min_x, min_y, max_x, max_y)))
        components.sort(reverse=True)
        print(source.name, components[:6])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contact", type=Path)
    parser.add_argument("--source-dir", type=Path, default=ACTIVE_DIR)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--source-preview", type=Path)
    parser.add_argument("--analyze", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--validate", type=Path)
    args = parser.parse_args()
    if args.preview:
        make_preview(args.preview)
    if args.source_preview:
        make_source_preview(args.source_preview)
    if args.analyze:
        analyze_components()
    if args.apply:
        apply_all()
    if args.validate:
        validate_all(args.validate)
    if args.contact:
        make_contact_sheet(args.contact, args.source_dir)


if __name__ == "__main__":
    main()
