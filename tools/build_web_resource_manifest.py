from __future__ import annotations

import base64
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "web" / "resource" / "images"
MANIFEST = IMAGE_DIR / "manifest.js"
SUPPORTED_SUFFIXES = {".jpg", ".jpeg"}


def main() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    entries = []
    for path in sorted(IMAGE_DIR.iterdir(), key=lambda item: item.name.lower()):
        if path.name == MANIFEST.name or path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        entries.append(
            {
                "name": path.name,
                "type": "image/jpeg",
                "data": f"data:image/jpeg;base64,{data}",
            }
        )

    content = "window.GPSR_RESOURCE_IMAGES = "
    content += json.dumps(entries, ensure_ascii=False, indent=2)
    content += ";\n"
    MANIFEST.write_text(content, encoding="utf-8")
    print(f"Wrote {MANIFEST} with {len(entries)} image(s).")


if __name__ == "__main__":
    main()
