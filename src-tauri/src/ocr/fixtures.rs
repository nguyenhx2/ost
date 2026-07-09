//! Synthetic OCR fixtures for the R1 spike (feature `ocr-spike` only).
//!
//! Every fixture is rendered PROGRAMMATICALLY from a known ground-truth string
//! and a system font, so character accuracy is computed deterministically
//! against the exact source text. No real user content is ever used
//! (agent-guardrails.md section 4 / security-privacy.md): these are synthetic
//! renders of invented strings.
//!
//! Fonts are read from the local system font directory at render time; the
//! rendered PNGs are NOT committed (only this generator and the ground-truth
//! strings are). When a language's font is absent, that fixture is skipped so
//! the spike still runs the languages whose fonts exist.

use ab_glyph::{Font, FontVec, PxScale, ScaleFont};
use image::{imageops, Rgb, RgbImage};
use imageproc::drawing::draw_text_mut;

/// Language of a fixture (drives which recognition model set is used).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    /// English (Latin).
    En,
    /// Japanese (kana + kanji).
    Ja,
    /// Vietnamese (Latin + diacritics).
    Vi,
    /// Korean (Hangul).
    Ko,
    /// Chinese (Han).
    Zh,
}

/// Fixture category - what recognition condition it exercises.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    /// Clean, well-sized horizontal text across the crop-size range.
    General,
    /// Low-DPI game/UI subtitle: small text, downscaled+upscaled to blur.
    Subtitle,
    /// Japanese vertical text (縦書き / tategaki), characters stacked top-down.
    Vertical,
}

/// One synthetic fixture: the ground-truth text and its rendered image.
pub struct Fixture {
    /// Stable identifier (e.g. `"en-general-800x200"`).
    pub name: String,
    /// Language for model routing.
    pub lang: Lang,
    /// Recognition condition.
    pub category: Category,
    /// The exact ground-truth text (reference for CER).
    pub text: String,
    /// The rendered crop.
    pub image: RgbImage,
}

/// Candidate absolute font paths per script, tried in order. First that loads
/// wins; if none load the language is skipped.
struct FontSpec {
    /// TrueType/OpenType file candidates.
    paths: &'static [&'static str],
    /// Collection index (0 for `.ttf`, face index for `.ttc`).
    index: u32,
}

fn latin_font() -> Option<FontVec> {
    load_font(&FontSpec {
        paths: &["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"],
        index: 0,
    })
}

fn japanese_font() -> Option<FontVec> {
    load_font(&FontSpec {
        paths: &[
            "C:/Windows/Fonts/meiryo.ttc",
            "C:/Windows/Fonts/YuGothB.ttc",
            "C:/Windows/Fonts/msgothic.ttc",
        ],
        index: 0,
    })
}

fn korean_font() -> Option<FontVec> {
    load_font(&FontSpec {
        paths: &["C:/Windows/Fonts/malgun.ttf"],
        index: 0,
    })
}

fn chinese_font() -> Option<FontVec> {
    load_font(&FontSpec {
        paths: &["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simsun.ttc"],
        index: 0,
    })
}

fn load_font(spec: &FontSpec) -> Option<FontVec> {
    for path in spec.paths {
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        if let Ok(font) = FontVec::try_from_vec_and_index(bytes, spec.index) {
            return Some(font);
        }
    }
    None
}

const FG: Rgb<u8> = Rgb([20, 20, 20]);
const BG: Rgb<u8> = Rgb([245, 245, 245]);
// Subtitle palette: light text over a dark scrim (typical game/UI subtitle).
const SUB_FG: Rgb<u8> = Rgb([240, 240, 240]);
const SUB_BG: Rgb<u8> = Rgb([28, 28, 28]);

/// Advance width of `text` at `px` (sum of horizontal glyph advances).
fn text_width(text: &str, font: &FontVec, px: f32) -> f32 {
    let scaled = font.as_scaled(PxScale::from(px));
    text.chars()
        .map(|c| scaled.h_advance(font.glyph_id(c)))
        .sum()
}

/// Largest `px <= max_px` at which `text` fits within `w * 0.92` (leaving a
/// left/right margin). Prevents the fixture text from overflowing the canvas,
/// which would silently truncate the ground truth the OCR ever sees.
fn fit_px(text: &str, font: &FontVec, max_px: f32, w: u32) -> f32 {
    let limit = w as f32 * 0.92;
    let mut px = max_px;
    while px > 10.0 && text_width(text, font, px) > limit {
        px -= 2.0;
    }
    px
}

/// Renders one horizontal line, vertically centred, left-padded. The font size
/// is auto-shrunk from `max_px` so the whole string fits the canvas width.
fn render_horizontal(
    text: &str,
    font: &FontVec,
    max_px: f32,
    w: u32,
    h: u32,
    fg: Rgb<u8>,
    bg: Rgb<u8>,
) -> RgbImage {
    let mut img = RgbImage::from_pixel(w, h, bg);
    let px = fit_px(text, font, max_px, w);
    let scale = PxScale::from(px);
    let y = ((h as f32 - px) / 2.0).max(0.0) as i32;
    draw_text_mut(&mut img, fg, (px * 0.3) as i32, y, scale, font, text);
    img
}

/// Renders characters stacked top-to-bottom (真の縦書き). Each scalar value is
/// drawn on its own row so the ground truth is the reading-order string.
fn render_vertical(text: &str, font: &FontVec, px: f32, fg: Rgb<u8>, bg: Rgb<u8>) -> RgbImage {
    let chars: Vec<char> = text.chars().collect();
    let step = (px * 1.08).ceil() as u32;
    let w = (px * 1.6).ceil() as u32;
    let h = step * (chars.len() as u32) + step;
    let mut img = RgbImage::from_pixel(w, h, bg);
    let scale = PxScale::from(px);
    let x = (px * 0.25) as i32;
    for (i, ch) in chars.iter().enumerate() {
        let y = (step / 2) as i32 + (i as u32 * step) as i32;
        let mut buf = [0u8; 4];
        let s = ch.encode_utf8(&mut buf);
        draw_text_mut(&mut img, fg, x, y, scale, font, s);
    }
    img
}

/// Simulates a low-DPI screenshot: render at native size, downscale then
/// upscale with a linear filter to introduce the sampling blur real low-DPI
/// UI captures carry.
fn low_dpi(img: &RgbImage, factor: f32) -> RgbImage {
    let w = img.width();
    let h = img.height();
    let small = imageops::resize(
        img,
        ((w as f32 * factor) as u32).max(1),
        ((h as f32 * factor) as u32).max(1),
        imageops::FilterType::Triangle,
    );
    imageops::resize(&small, w, h, imageops::FilterType::Triangle)
}

/// Builds the full spike fixture set. Languages whose font is unavailable are
/// silently skipped (the caller reports which ran).
pub fn build_fixture_set() -> Vec<Fixture> {
    let mut out = Vec::new();

    if let Some(font) = latin_font() {
        // English general across the crop-size range (~400x100 .. ~1200x800).
        let en = "The quick brown fox jumps over 12 lazy dogs.";
        for (w, h, px) in [
            (400u32, 100u32, 34.0f32),
            (800, 200, 52.0),
            (1200, 300, 72.0),
        ] {
            out.push(Fixture {
                name: format!("en-general-{w}x{h}"),
                lang: Lang::En,
                category: Category::General,
                text: en.to_string(),
                image: render_horizontal(en, &font, px, w, h, FG, BG),
            });
        }
        // A tall multi-paragraph-ish crop up to ~1200x800 (stress the big end).
        let en_block = "Loading assets please wait";
        out.push(Fixture {
            name: "en-general-1200x800".to_string(),
            lang: Lang::En,
            category: Category::General,
            text: en_block.to_string(),
            image: render_horizontal(en_block, &font, px_for_big(), 1200, 800, FG, BG),
        });
        // Low-DPI EN subtitle.
        let en_sub = "Press START to continue";
        let base = render_horizontal(en_sub, &font, 26.0, 520, 90, SUB_FG, SUB_BG);
        out.push(Fixture {
            name: "en-subtitle-lowdpi".to_string(),
            lang: Lang::En,
            category: Category::Subtitle,
            text: en_sub.to_string(),
            image: low_dpi(&base, 0.6),
        });

        // Vietnamese uses the same latin font (diacritics covered by Arial).
        let vi = "Cảm ơn bạn đã sử dụng phần mềm dịch";
        out.push(Fixture {
            name: "vi-general-900x160".to_string(),
            lang: Lang::Vi,
            category: Category::General,
            text: vi.to_string(),
            image: render_horizontal(vi, &font, 46.0, 900, 160, FG, BG),
        });
        let vi_sub = "Nhấn nút bắt đầu để tiếp tục";
        let vbase = render_horizontal(vi_sub, &font, 26.0, 560, 90, SUB_FG, SUB_BG);
        out.push(Fixture {
            name: "vi-subtitle-lowdpi".to_string(),
            lang: Lang::Vi,
            category: Category::Subtitle,
            text: vi_sub.to_string(),
            image: low_dpi(&vbase, 0.6),
        });
    }

    if let Some(font) = japanese_font() {
        let ja = "こんにちは世界へようこそ";
        out.push(Fixture {
            name: "ja-general-800x160".to_string(),
            lang: Lang::Ja,
            category: Category::General,
            text: ja.to_string(),
            image: render_horizontal(ja, &font, 46.0, 800, 160, FG, BG),
        });
        // Low-DPI JA subtitle.
        let ja_sub = "ゲームを開始します";
        let jbase = render_horizontal(ja_sub, &font, 28.0, 520, 96, SUB_FG, SUB_BG);
        out.push(Fixture {
            name: "ja-subtitle-lowdpi".to_string(),
            lang: Lang::Ja,
            category: Category::Subtitle,
            text: ja_sub.to_string(),
            image: low_dpi(&jbase, 0.6),
        });
        // Japanese VERTICAL (縦書き).
        let ja_vert = "空に光る星を見上げる";
        out.push(Fixture {
            name: "ja-vertical".to_string(),
            lang: Lang::Ja,
            category: Category::Vertical,
            text: ja_vert.to_string(),
            image: render_vertical(ja_vert, &font, 44.0, FG, BG),
        });
        let ja_vert2 = "静かな夜";
        out.push(Fixture {
            name: "ja-vertical-short".to_string(),
            lang: Lang::Ja,
            category: Category::Vertical,
            text: ja_vert2.to_string(),
            image: render_vertical(ja_vert2, &font, 48.0, FG, BG),
        });
    }

    if let Some(font) = korean_font() {
        let ko = "안녕하세요 세계";
        out.push(Fixture {
            name: "ko-general-720x150".to_string(),
            lang: Lang::Ko,
            category: Category::General,
            text: ko.to_string(),
            image: render_horizontal(ko, &font, 46.0, 720, 150, FG, BG),
        });
    }

    if let Some(font) = chinese_font() {
        let zh = "欢迎使用翻译软件";
        out.push(Fixture {
            name: "zh-general-720x150".to_string(),
            lang: Lang::Zh,
            category: Category::General,
            text: zh.to_string(),
            image: render_horizontal(zh, &font, 46.0, 720, 150, FG, BG),
        });
    }

    out
}

/// Font size used for the largest (1200x800) crop.
fn px_for_big() -> f32 {
    88.0
}

/// Upscales `img` by `factor` with a Lanczos3 (3-lobe windowed-sinc) kernel.
///
/// Lanczos3 is chosen over bilinear/bicubic for the R2 pre-recognition upscale
/// probe because, when magnifying, its wider windowed-sinc support reconstructs
/// high-frequency stroke and diacritic detail with the sharpest edges of the
/// filters `image` exposes (bilinear over-blurs, CatmullRom/bicubic is softer);
/// mild ringing is acceptable for a recognizer input. This is the most
/// favourable resampling for the "dense tone-mark stacks are lost to low
/// effective DPI" hypothesis, so a null result here is a strong refutation.
pub fn upscale(img: &RgbImage, factor: f32) -> RgbImage {
    if (factor - 1.0).abs() < f32::EPSILON {
        return img.clone();
    }
    let w = ((img.width() as f32 * factor).round() as u32).max(1);
    let h = ((img.height() as f32 * factor).round() as u32).max(1);
    imageops::resize(img, w, h, imageops::FilterType::Lanczos3)
}

/// A single large, clean Vietnamese crop dense in composed tone-mark glyphs
/// (ả ạ ử ụ ầ ế ...), rendered big enough that DPI cannot be the limiter. Used
/// by the R2 charset probe: if the latin rec model NEVER emits any composed
/// U+1E00-U+1EFF glyph even here, the gap is the charset, not the DPI.
/// Returns `None` if the Latin font is unavailable.
pub fn vi_charset_probe() -> Option<Fixture> {
    let font = latin_font()?;
    // Every syllable carries a composed tone-mark diacritic on purpose.
    let text = "Tiếng Việt rất đẹp và dễ đọc khó";
    Some(Fixture {
        name: "vi-charset-probe-1400x220".to_string(),
        lang: Lang::Vi,
        category: Category::General,
        text: text.to_string(),
        image: render_horizontal(text, &font, 96.0, 1400, 220, FG, BG),
    })
}

/// A minimal always-available synthetic fixture (single latin word) for the
/// criterion latency benchmark and smoke checks when CJK fonts are absent.
/// Returns `None` only if even the Latin font is missing.
pub fn latency_fixture(w: u32, h: u32, px: f32) -> Option<Fixture> {
    let font = latin_font()?;
    let text = "Translate this region now";
    Some(Fixture {
        name: format!("latency-{w}x{h}"),
        lang: Lang::En,
        category: Category::General,
        text: text.to_string(),
        image: render_horizontal(text, &font, px, w, h, FG, BG),
    })
}
