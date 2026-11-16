const RUBY_TOKEN_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

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

export function toSearchableText(text) {
  return String(text ?? "").replace(RUBY_TOKEN_RE, "$1 $2").toLowerCase();
}

export function renderRubyHtml(text) {
  const source = String(text ?? "");
  const pattern = new RegExp(RUBY_TOKEN_RE.source, "g");
  let output = "";
  let cursor = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) {
      output += escapeHtml(source.slice(cursor, match.index));
    }
    output += `<ruby>${escapeHtml(match[1])}<rp>(</rp><rt>${escapeHtml(match[2])}</rt><rp>)</rp></ruby>`;
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) {
    output += escapeHtml(source.slice(cursor));
  }
  return output;
}
