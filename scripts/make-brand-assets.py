"""
Generate every brand image from one glyph, so the icon, adaptive icon layers,
splash, favicon, notification icon and Play feature graphic all match.

    python scripts/make-brand-assets.py

Needs Pillow (`pip install pillow`). The glyph is an upward chevron over a
floor line: a body pushing up off the ground. Colours are the app's own
theme tokens (src/theme/theme.js).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
STORE = ROOT / "store"

BG = (10, 10, 11)          # colors.bg
ACCENT = (74, 222, 128)    # colors.accent
ACCENT_DIM = (22, 101, 52) # colors.accentDim
TEXT = (245, 245, 247)     # colors.text
TEXT_DIM = (138, 138, 147) # colors.textDim
WHITE = (255, 255, 255)

SS = 4  # supersample factor for smooth edges


def glyph(size, color, floor_color=None, scale=1.0):
    """Chevron + floor line on a transparent square of `size` px."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = s / 2
    unit = s * scale
    stroke = int(unit * 0.16)
    half_w = unit * 0.27
    top_y = s * 0.5 - unit * 0.26
    bot_y = s * 0.5 + unit * 0.10
    floor_y = s * 0.5 + unit * 0.30

    def seg(a, b, col):
        d.line([a, b], fill=col, width=stroke)
        r = stroke / 2
        for (x, y) in (a, b):
            d.ellipse([x - r, y - r, x + r, y + r], fill=col)

    seg((cx - half_w, bot_y), (cx, top_y), color)
    seg((cx, top_y), (cx + half_w, bot_y), color)
    seg((cx - half_w, floor_y), (cx + half_w, floor_y), floor_color or color)
    return img.resize((size, size), Image.LANCZOS)


def on_background(fg, bg_color):
    out = Image.new("RGBA", fg.size, bg_color + (255,))
    out.alpha_composite(fg)
    return out.convert("RGB")


def font(size, bold=True):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    ASSETS.mkdir(exist_ok=True)
    STORE.mkdir(exist_ok=True)

    # App icon: full-bleed square, no rounded corners (stores apply their own mask).
    on_background(glyph(1024, ACCENT, TEXT_DIM, 0.78), BG).save(ASSETS / "icon.png")

    # Adaptive icon layers. Foreground content must sit inside the centre 66%.
    glyph(512, ACCENT, TEXT_DIM, 0.50).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGB", (512, 512), BG).save(ASSETS / "android-icon-background.png")
    glyph(512, WHITE, WHITE, 0.50).save(ASSETS / "android-icon-monochrome.png")

    # Splash: transparent glyph, rendered at imageWidth by expo-splash-screen.
    glyph(512, ACCENT, TEXT_DIM, 0.80).save(ASSETS / "splash-icon.png")

    # Favicon and the Android notification icon (white on transparent).
    on_background(glyph(48, ACCENT, TEXT_DIM, 0.8), BG).save(ASSETS / "favicon.png")
    glyph(96, WHITE, WHITE, 0.85).save(ASSETS / "notification-icon.png")

    # Play Store listing: 512x512 icon and the 1024x500 feature graphic.
    on_background(glyph(512, ACCENT, TEXT_DIM, 0.78), BG).save(STORE / "play-icon-512.png")

    W, H = 1024, 500
    fg = Image.new("RGB", (W, H), BG)
    mark = glyph(360, ACCENT, TEXT_DIM, 0.9)
    fg.paste(mark, (70, (H - 360) // 2), mark)
    d = ImageDraw.Draw(fg)
    d.text((430, 150), "Hít Đất AI", font=font(72), fill=TEXT)
    d.text((434, 250), "AI camera counts your reps.", font=font(34, bold=False), fill=TEXT_DIM)
    d.text((434, 296), "Programs, streaks, progress.", font=font(34, bold=False), fill=TEXT_DIM)
    d.rounded_rectangle([434, 366, 434 + 250, 366 + 54], radius=27, fill=ACCENT)
    d.text((434 + 125, 366 + 27), "Free · No ads", font=font(26), fill=BG, anchor="mm")
    fg.save(STORE / "feature-graphic.png")

    for p in sorted(list(ASSETS.glob("*.png")) + list(STORE.glob("*.png"))):
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT)}: {im.size[0]}x{im.size[1]} {im.mode}")


if __name__ == "__main__":
    main()
