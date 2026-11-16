const RUBY_TOKEN_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;
const INLINE_CODE_RE = /`([^`\n<>]+)`/g;
const INLINE_BOLD_RE = /\*\*([^*\n<>]+)\*\*/g;
const INLINE_ITALIC_RE = /(^|[^*])\*([^*\n<>]+)\*(?!\*)/g;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripRubySurface(text) {
  return String(text ?? "").replace(RUBY_TOKEN_RE, "$1");
}

export function stripRubyReading(text) {
  return String(text ?? "").replace(RUBY_TOKEN_RE, "$2");
}

export function stripInlineMarkdown(text) {
  return String(text ?? "")
    .replace(INLINE_CODE_RE, "$1")
    .replace(INLINE_BOLD_RE, "$1")
    .replace(INLINE_ITALIC_RE, "$1$2");
}

export function normalizeSearchText(text) {
  return stripInlineMarkdown(text)
    .replace(/[〜～]/g, "~")
    .toLowerCase();
}

export function toSearchableText(text) {
  const clean = stripInlineMarkdown(text);
  const surface = stripRubySurface(clean).toLowerCase();
  const reading = stripRubyReading(clean).toLowerCase();
  return surface === reading ? surface : `${surface} ${reading}`;
}

function formatEscapedInlineHtml(escaped) {
  return escaped
    .replace(INLINE_CODE_RE, "<code>$1</code>")
    .replace(INLINE_BOLD_RE, "<strong>$1</strong>")
    .replace(INLINE_ITALIC_RE, "$1<em>$2</em>");
}

export function renderRubyHtml(text) {
  const source = String(text ?? "");
  const pattern = new RegExp(RUBY_TOKEN_RE.source, "g");
  let output = "";
  let cursor = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) {
      output += formatEscapedInlineHtml(escapeHtml(source.slice(cursor, match.index)));
    }
    output += `<ruby>${escapeHtml(match[1])}<rp>(</rp><rt>${escapeHtml(match[2])}</rt><rp>)</rp></ruby>`;
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) {
    output += formatEscapedInlineHtml(escapeHtml(source.slice(cursor)));
  }
  return output;
}
