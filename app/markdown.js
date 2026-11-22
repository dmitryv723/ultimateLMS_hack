import { escape } from './layout.js';

function markdownUrl(value, image) {
  if (/^\/(?![\/\\])[^\\\s\u0000-\u001f]*$/.test(value)) return value;
  if (!image && /^(?:https?:\/\/|mailto:|#)[^\s\u0000-\u001f]+$/i.test(value)) return value;
  return '';
}

function markdownInline(value, resolveImage) {
  const tokens = /`([^`\n]+)`|(!?)\[([^\]\n]*)\]\(([^\s()]+)\)|(\*\*|__)([^\n]+?)\5|(\*|_)([^\s].*?)\7|~~([^\n]+?)~~|\+\+([^+\n]+)\+\+|\{\{(-?[12]):([^{}\n]+)\}\}/g;
  let html = '';
  let previous = 0;
  for (const token of value.matchAll(tokens)) {
    const [raw, code, image, label, destination, bold, strong, italic, emphasis, strike, underline, sizeLevel, sizeText] = token;
    html += escape(value.slice(previous, token.index));
    if (code !== undefined) html += `<code>${escape(code)}</code>`;
    else if (destination !== undefined) {
      const resolved = image && resolveImage ? resolveImage(destination) : '';
      const url = markdownUrl(resolved || destination, Boolean(image));
      html += !url ? escape(raw) : image
        ? `<img src="${escape(url)}" alt="${escape(label)}" loading="lazy">`
        : `<a href="${escape(url)}">${escape(label)}</a>`;
    } else if (bold) html += `<strong>${escape(strong)}</strong>`;
    else if (italic) html += `<em>${escape(emphasis)}</em>`;
    else if (underline !== undefined) html += `<ins>${escape(underline)}</ins>`;
    else if (sizeLevel !== undefined) html += `<span class="md-text-${escape(sizeLevel)}">${escape(sizeText)}</span>`;
    else html += `<del>${escape(strike)}</del>`;
    previous = token.index + raw.length;
  }
  return html + escape(value.slice(previous));
}

export function renderMarkdown(value, { resolveImage } = {}) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const inline = (line) => markdownInline(line, resolveImage);
  const blocks = [];
  const listItem = /^ {0,3}([-+*]|\d+\.)\s+(.+)$/;
  const heading = /^ {0,3}(#{1,6})\s+(.+)$/;
  const rule = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const fence = /^ {0,3}(`{3,}|~{3,})/;
  const quote = /^ {0,3}>\s?/;
  const isBlock = (line) => !line.trim() || listItem.test(line) || heading.test(line) || rule.test(line) || fence.test(line) || quote.test(line);

  for (let index = 0; index < lines.length;) {
    const line = lines[index++];
    if (!line.trim()) continue;
    const marker = fence.exec(line)?.[1];
    if (marker) {
      const code = [];
      const end = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}\\s*$');
      while (index < lines.length && !end.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const header = heading.exec(line);
    if (header) {
      const level = header[1].length;
      blocks.push(`<h${level}>${inline(header[2])}</h${level}>`);
      continue;
    }
    if (rule.test(line)) {
      blocks.push('<hr>');
      continue;
    }
    const item = listItem.exec(line);
    if (item) {
      const tag = item[1].endsWith('.') ? 'ol' : 'ul';
      const items = [item[2]];
      while (index < lines.length) {
        const next = listItem.exec(lines[index]);
        if (!next || next[1].endsWith('.') !== (tag === 'ol')) break;
        items.push(next[2]);
        index++;
      }
      blocks.push(`<${tag}>${items.map((text) => '<li>' + inline(text) + '</li>').join('')}</${tag}>`);
      continue;
    }
    if (quote.test(line)) {
      const quoted = [line.replace(quote, '')];
      while (index < lines.length && quote.test(lines[index])) quoted.push(lines[index++].replace(quote, ''));
      blocks.push(`<blockquote><p>${quoted.map(inline).join('<br>')}</p></blockquote>`);
      continue;
    }
    const paragraph = [line];
    while (index < lines.length && !isBlock(lines[index])) paragraph.push(lines[index++]);
    blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
  }
  return blocks.join('');
}

export const markdownContent = (value, options) => `<div class="markdown-content">${renderMarkdown(value, options)}</div>`;
