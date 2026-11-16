"""Ruby furigana validation, normalization, and HTML/Markdown rendering."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

JUKUJIKUN_ALLOWLIST: frozenset[str] = frozenset(
    {
        "今日",
        "明日",
        "昨日",
        "一昨日",
        "明後日",
        "大人",
        "上手",
        "下手",
        "一人",
        "二人",
        "二十歳",
        "一日",
        "二十日",
        "今年",
        "今朝",
        "可愛い",
        "お兄さん",
        "お姉さん",
        "お母さん",
        "お父さん",
        "お巡りさん",
        "大人気",
        "風邪気味",
        "真面目",
        "果物",
        "眼鏡",
        "時計",
        "友達",
        "土産",
        "お土産",
        "部屋",
        "八百屋",
        "相変わらず",
        "差し支え",
        "お姉ちゃん",
        "お兄ちゃん",
        "お婆さん",
        "お爺さん",
        "お母様",
        "お父様",
        "仕方がない",
        "仕方ない",
        "梅雨",
    }
)

KANJI_PATTERN = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf々ヶ]")
HIRAGANA_READING_PATTERN = re.compile(r"^[ぁ-ゖー]+$")
KANA_CHAR_PATTERN = re.compile(r"[ぁ-ゖァ-ヶー]")
RUBY_SPLIT_PATTERN = re.compile(r"(\{[^{}|]+\|[^{}|]+\})")
RUBY_TOKEN_PATTERN = re.compile(r"\{([^{}|]+)\|([^{}|]+)\}")
RUBY_ANCHORED_PATTERN = re.compile(r"^\{([^{}|]+)\|([^{}|]+)\}$")
PLACEHOLDER_PATTERN = re.compile(r"\b(?:TODO|TBD|FIXME|XXX|PLACEHOLDER)\b", re.IGNORECASE)
ROMAJI_TERM_PATTERN = re.compile(r"\bromanj?i\b", re.IGNORECASE)
MACRON_VOWEL_PATTERN = re.compile(r"[āīūēōĀĪŪĒŌ]")
HEPBURN_NASAL_PATTERN = re.compile(r"\b[A-Za-z]*n'[aiueoyAIUEOY][A-Za-z]*\b")
TILDE_ROMAJI_PATTERN = re.compile(r"[~〜](?!(?:ing|ed|er|s)\b)[A-Za-z]+\b")
ROMANIZED_INFLECTION_PATTERN = re.compile(
    r"\b(?:te|ta|nai|masu|ba|tara|ru|u|suru|kuru|i|na|a|e|o)-(?:form|forms|stem|stems|adjective|adjectives|adj|verb|verbs|conditional|conditionals|row|rows)\b"
    r"|\bV-(?!dict(?:ionary)?\b|plain\b|stem\b)[A-Za-z]+\b",
    re.IGNORECASE,
)
ASCII_WORD_PATTERN = re.compile(r"\b[A-Za-z]+\b")

FORBIDDEN_ROMAJI_WORDS: frozenset[str] = frozenset(
    {
        "romaji",
        "romanji",
        "keigo",
        "sonkeigo",
        "kenjougo",
        "teineigo",
        "ukemi",
        "shieki",
        "godan",
        "ichidan",
        "kosoado",
        "rendaku",
        "okurigana",
        "jukujikun",
        "kotoba",
        "bunpou",
        "katsuyou",
        "meishi",
        "doushi",
        "keiyoushi",
        "fukushi",
        "joshi",
        "gokan",
        "jishokei",
        "futsuukei",
        "kinshikei",
        "gimonshi",
        "hodo",
        "koto",
        "mono",
        "bakari",
        "dake",
        "shika",
        "sae",
        "koso",
        "noni",
        "node",
        "tame",
        "uchi",
        "nagara",
        "tsutsu",
        "ppoi",
        "garu",
        "gatteiru",
        "tagaru",
        "hoshigaru",
        "gachi",
        "gimi",
        "darake",
        "muki",
        "muke",
        "beki",
        "hazu",
        "tsumori",
        "kagiri",
        "kagitte",
        "rashii",
        "mitai",
        "souda",
        "youda",
        "youni",
        "hajimete",
        "totte",
        "taishite",
        "tsuite",
        "kanshite",
        "kurabete",
        "yotte",
        "kakete",
        "oite",
        "shitara",
        "tsujite",
        "komete",
        "dokoroka",
        "nimokakawarazu",
        "niatatte",
        "niwatatte",
        "kanenai",
        "gatai",
        "tamaranai",
        "shouganai",
        "shikataganai",
        "kamawanai",
        "hajimaranai",
        "kuseni",
        "monono",
        "nagaramo",
        "kawarini",
        "mushiro",
        "ippou",
        "tsurete",
        "mochiron",
        "motoyori",
        "zuni",
        "sunawachi",
        "tsumari",
        "tatoeba",
        "tatoe",
        "moshimo",
        "moshi",
        "ikura",
        "donnani",
        "tokoroga",
        "tokorode",
        "shitagatte",
        "sokode",
        "sorede",
        "soreni",
        "soretomo",
        "sarani",
        "shikamo",
        "suruto",
        "mottomo",
        "tadashi",
        "kaette",
        "seizei",
        "kotokara",
        "monodakara",
        "ittai",
        "metta",
        "fuan",
        "fukuzatsu",
        "genki",
        "hima",
        "shizuka",
        "tomodachi",
        "yasui",
        "saichuu",
        "tochuu",
        "tabi",
        "tsuide",
        "tanabata",
        "ema",
        "temiyage",
        "osechi",
        "ryori",
        "komorebi",
        "yukigasa",
        "aozora",
        "himawari",
        "kinkaku",
        "kiyomizu",
        "sekkaku",
        "kanari",
        "masumasu",
        "masaka",
        "narubeku",
        "tashika",
        "osoraku",
    }
)


@dataclass(frozen=True, slots=True)
class ValidationError:
    """Structured location-tagged validation error."""

    location: str
    message: str


def strip_ruby_to_surface(text: str) -> str:
    """Return surface text with {Base|Reading} annotations replaced by Base."""
    return RUBY_TOKEN_PATTERN.sub(r"\1", text)


def render_ruby_html(text: str) -> str:
    """Convert {Base|Reading} tokens into XML/HTML-safe <ruby> markup."""
    parts = RUBY_SPLIT_PATTERN.split(text)
    rendered: list[str] = []
    for part in parts:
        if not part:
            continue
        match = RUBY_ANCHORED_PATTERN.match(part)
        if match:
            base = html.escape(match.group(1), quote=False)
            reading = html.escape(match.group(2), quote=False)
            rendered.append(f"<ruby>{base}<rp>(</rp><rt>{reading}</rt><rp>)</rp></ruby>")
        else:
            rendered.append(html.escape(part, quote=False))
    return "".join(rendered)


def render_ruby_markdown(text: str) -> str:
    """Convert {Base|Reading} tokens into Base【Reading】 notation."""
    return RUBY_TOKEN_PATTERN.sub(r"\1【\2】", text)


def escape_markdown_cell(text: str) -> str:
    """Render ruby for Markdown table cells and escape pipe characters."""
    return render_ruby_markdown(text).replace("|", "\\|").replace("\n", " ")


def check_script_purity(text: str, location: str, errors: list[ValidationError]) -> None:
    """Reject romanized Japanese patterns, inflections, and lexicon in text fields."""
    if ROMAJI_TERM_PATTERN.search(text):
        errors.append(ValidationError(location, f"Forbidden romaji reference in: {text!r}"))
    if MACRON_VOWEL_PATTERN.search(text):
        errors.append(ValidationError(location, f"Macron romanization not allowed in: {text!r}"))
    if HEPBURN_NASAL_PATTERN.search(text):
        errors.append(
            ValidationError(location, f"Apostrophe romanization not allowed in: {text!r}")
        )

    tilde_match = TILDE_ROMAJI_PATTERN.search(text)
    if tilde_match:
        errors.append(
            ValidationError(
                location,
                f"Romanized pattern {tilde_match.group(0)!r} must use Japanese script in: {text!r}",
            )
        )

    inflection_match = ROMANIZED_INFLECTION_PATTERN.search(text)
    if inflection_match:
        errors.append(
            ValidationError(
                location,
                f"Romanized form {inflection_match.group(0)!r} must use Japanese script in: {text!r}",
            )
        )

    surface = strip_ruby_to_surface(text)
    for word_match in ASCII_WORD_PATTERN.finditer(surface):
        word = word_match.group(0)
        if word.lower() in FORBIDDEN_ROMAJI_WORDS:
            errors.append(
                ValidationError(
                    location,
                    f"Romanized Japanese token {word!r} must use Japanese script in: {text!r}",
                )
            )


def check_balanced_delimiters(text: str, location: str, errors: list[ValidationError]) -> None:
    """Check delimiter balance, script purity, and absence of placeholder markers."""
    check_script_purity(text, location, errors)

    if PLACEHOLDER_PATTERN.search(text):
        errors.append(ValidationError(location, f"Contains placeholder token in: {text!r}"))

    if text.count("「") != text.count("」"):
        errors.append(ValidationError(location, f"Unbalanced Japanese quotes 「」 in: {text!r}"))

    if text.count("（") != text.count("）"):
        errors.append(
            ValidationError(location, f"Unbalanced fullwidth parentheses （） in: {text!r}")
        )

    depth = 0
    for index, char in enumerate(text):
        if char == "{":
            depth += 1
            if depth > 1:
                errors.append(
                    ValidationError(location, f"Nested '{{' at index {index} in: {text!r}")
                )
        elif char == "}":
            depth -= 1
            if depth < 0:
                errors.append(
                    ValidationError(location, f"Unmatched '}}' at index {index} in: {text!r}")
                )
    if depth != 0:
        errors.append(ValidationError(location, f"Unclosed '{{' in: {text!r}"))


def check_literal_field(text: str, location: str, errors: list[ValidationError]) -> None:
    """Ensure literal non-ruby fields contain zero {Base|Reading} markup."""
    check_balanced_delimiters(text, location, errors)
    if RUBY_TOKEN_PATTERN.search(text) or "{" in text or "}" in text:
        errors.append(
            ValidationError(
                location,
                f"Literal non-ruby field must not contain ruby braces: {text!r}",
            )
        )


def check_ruby_field(
    text: str,
    location: str,
    require_no_bare_kanji: bool,
    errors: list[ValidationError],
) -> None:
    """Validate {Base|Reading} tags, hiragana readings, kana leaks, and bare kanji."""
    check_balanced_delimiters(text, location, errors)

    for match in RUBY_TOKEN_PATTERN.finditer(text):
        base, reading = match.group(1), match.group(2)
        if not KANJI_PATTERN.search(base):
            errors.append(
                ValidationError(location, f"Ruby base has no kanji: {{{base}|{reading}}}")
            )
        if not HIRAGANA_READING_PATTERN.match(reading):
            errors.append(
                ValidationError(
                    location, f"Ruby reading must be pure hiragana: {{{base}|{reading}}}"
                )
            )
        if base not in JUKUJIKUN_ALLOWLIST and KANA_CHAR_PATTERN.search(base):
            errors.append(
                ValidationError(
                    location,
                    f"Kana characters must remain outside ruby base: {{{base}|{reading}}}",
                )
            )

    stripped = RUBY_TOKEN_PATTERN.sub("", text)
    if "{" in stripped or "}" in stripped:
        errors.append(ValidationError(location, f"Malformed ruby braces in: {text!r}"))

    if require_no_bare_kanji:
        bare_kanji = KANJI_PATTERN.findall(stripped)
        if bare_kanji:
            errors.append(
                ValidationError(
                    location,
                    f"Unannotated kanji {''.join(bare_kanji)!r} in: {text!r}",
                )
            )
