"""Recorta e normaliza um sprite de morte em uma tela transparente uniforme."""

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--width", type=int, default=256)
    parser.add_argument("--height", type=int, default=192)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    alpha_box = image.getchannel("A").getbbox()
    if not alpha_box:
        raise ValueError(f"Sprite sem pixels visíveis: {args.input}")
    subject = image.crop(alpha_box)
    max_width = args.width - 20
    max_height = args.height - 18
    scale = min(max_width / subject.width, max_height / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))
    x = (args.width - subject.width) // 2
    y = args.height - subject.height - 7
    canvas.alpha_composite(subject, (x, y))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, optimize=True)


if __name__ == "__main__":
    main()
