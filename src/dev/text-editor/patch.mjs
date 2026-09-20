// Finds a paragraph's copy in the source tree and rewrites it in place.
//
// The rendered DOM carries no pointer back to the file it came from (Astro
// only adds data-astro-source-* alongside the dev toolbar, which this project
// keeps off), so the text itself is the key: we search for it, and only write
// when exactly one file has it. Two candidates, or none, is an error the
// panel reports rather than a guess.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// .astro first: that's where the copy lives. A second pass widens to the
// scripts and content files so a string defined outside a component (the
// hero's word list, say) is still reachable, without letting those files
// create ambiguity for the common case.
const TIERS = [['.astro'], ['.js', '.ts', '.md', '.mdx', '.json']];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.astro', '.github']);
const MAX_LENGTH = 5000;

// One rendered character can have several spellings in source: a typographic
// apostrophe may be written straight or escaped, an ampersand may be an
// entity. Each rendered char matches any of its source spellings.
const SPELLINGS = new Map([
  ["'", String.raw`(?:'|\\'|‘|’|&#39;|&apos;|&rsquo;|&lsquo;)`],
  ['’', String.raw`(?:'|\\'|‘|’|&#39;|&apos;|&rsquo;|&lsquo;)`],
  ['‘', String.raw`(?:'|\\'|‘|’|&#39;|&apos;|&rsquo;|&lsquo;)`],
  ['"', String.raw`(?:"|\\"|“|”|&quot;|&ldquo;|&rdquo;)`],
  ['“', String.raw`(?:"|\\"|“|”|&quot;|&ldquo;|&rdquo;)`],
  ['”', String.raw`(?:"|\\"|“|”|&quot;|&ldquo;|&rdquo;)`],
  ['&', String.raw`(?:&|&amp;)`],
  ['<', String.raw`(?:<|&lt;)`],
  ['>', String.raw`(?:>|&gt;)`],
]);

// Whitespace is where source and DOM diverge most: a string wrapped across
// lines, an indented markup text node, and an &nbsp; all render as one space.
const GAP = String.raw`(?:\s|&nbsp;|&#160;|&#xa0;)+`;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPattern(text) {
  const words = text
    .trim()
    .split(/(?:\s| )+/)
    .map((word) => [...word].map((ch) => SPELLINGS.get(ch) ?? escapeRegExp(ch)).join(''));
  return new RegExp(words.join(GAP), 'g');
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// Where in the file the match sits, which decides how the replacement has to
// be escaped. Returns null when it can't tell — the caller refuses to write
// rather than risk mangling the file.
function detectContext(source, start, end) {
  const before = source[start - 1];
  const after = source[end];

  // The whole string literal is the copy: body: "Swan is Moody's ..."
  if ((before === '"' || before === "'" || before === '`') && after === before) {
    return { kind: 'string', quote: before };
  }

  // A markup text node: <p class="...">Moody's is one of ...</p>
  const prev = source.slice(0, start).replace(/\s+$/, '').slice(-1);
  const next = source.slice(end).replace(/^\s+/, '').slice(0, 1);
  if (prev === '>' && next === '<') return { kind: 'markup' };

  // Part of a longer literal. Walk the line to see which quote is open.
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const open = openQuoteAt(source.slice(lineStart, start));
  if (open) return { kind: 'string', quote: open };

  return null;
}

function openQuoteAt(prefix) {
  let quote = null;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    }
  }
  return quote;
}

function escapeFor(context, text) {
  if (context.kind === 'markup') {
    // { and } would open an Astro expression
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;');
  }
  let out = text.replace(/\\/g, '\\\\').replace(new RegExp(escapeRegExp(context.quote), 'g'), `\\${context.quote}`);
  if (context.quote === '`') out = out.replace(/\$\{/g, '\\${');
  return out;
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;
const normalize = (text) => text.replace(/(?:\s| )+/g, ' ').trim();

// Finds the one place in src/ that holds this copy. Tiers keep a stray match
// in a script from making the common .astro case ambiguous.
async function locate(root, from) {
  const pattern = buildPattern(from);

  for (const extensions of TIERS) {
    const hits = [];
    for await (const file of walk(path.join(root, 'src'))) {
      if (!extensions.includes(path.extname(file))) continue;
      const source = await readFile(file, 'utf8');
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        hits.push({ file, source, start: match.index, end: match.index + match[0].length });
        if (hits.length > 8) break;
      }
      if (hits.length > 8) break;
    }

    if (hits.length === 0) continue;

    if (hits.length > 1) {
      const where = hits
        .map((hit) => `${path.relative(root, hit.file)}:${lineOf(hit.source, hit.start)}`)
        .join(', ');
      return { error: `That text appears in ${hits.length} places (${where}), so I can't tell which one you meant. Edit it in the source.` };
    }

    return { hit: hits[0] };
  }

  return { error: "Couldn't find that text in src/. If it's generated or comes from a data file outside src/, edit it there." };
}

export async function patchText({ root, original, updated }) {
  if (typeof original !== 'string' || typeof updated !== 'string') {
    return { ok: false, error: 'Both the original and the updated text are required.' };
  }

  const from = normalize(original);
  const to = normalize(updated);

  if (!from) return { ok: false, error: 'The original text was empty.' };
  if (!to) return { ok: false, error: "Refusing to write an empty paragraph. Delete it in the source if that's what you want." };
  if (to.length > MAX_LENGTH) return { ok: false, error: `That's longer than the ${MAX_LENGTH} character limit.` };
  if (from === to) return { ok: true, unchanged: true };

  const found = await locate(root, from);
  if (found.error) return { ok: false, error: found.error };

  {
    const hit = found.hit;
    const context = detectContext(hit.source, hit.start, hit.end);
    if (!context) {
      return {
        ok: false,
        error: `Found it in ${path.relative(root, hit.file)}:${lineOf(hit.source, hit.start)} but couldn't tell how it's embedded, so I left the file alone.`,
      };
    }

    const patched = hit.source.slice(0, hit.start) + escapeFor(context, to) + hit.source.slice(hit.end);
    await writeFile(hit.file, patched, 'utf8');

    return { ok: true, file: path.relative(root, hit.file), line: lineOf(hit.source, hit.start) };
  }
}

// ── Class attribute patching ──
// Style and colour are classes, so changing either means editing the class
// attribute of the element the copy sits in. That's only safe when the copy is
// written directly in markup: a paragraph fed from a data array is rendered by
// a shared component, whose class attribute every other instance wears too.

const CLASS_GROUPS = {
  style: { test: /^type-[a-z0-9-]+$/, label: 'Style' },
  color: { test: /^text-(strong|secondary|disabled|accent)$/, label: 'Colour' },
};

// Walks back from the copy to the tag that opens around it.
function openingTag(source, textStart) {
  const beforeText = source.slice(0, textStart).replace(/\s+$/, '');
  if (!beforeText.endsWith('>')) return null;

  const tagEnd = beforeText.length - 1;
  const tagStart = source.lastIndexOf('<', tagEnd);
  if (tagStart === -1) return null;

  const raw = source.slice(tagStart, tagEnd + 1);
  if (!/^<[a-zA-Z][\w-]*/.test(raw)) return null;

  return { start: tagStart, end: tagEnd, raw };
}

export async function patchClass({ root, original, group, value }) {
  const spec = CLASS_GROUPS[group];
  if (!spec) return { ok: false, error: `Unknown class group "${group}".` };
  if (value !== null && value !== undefined && !spec.test.test(value)) {
    return { ok: false, error: `"${value}" isn't one of the ${group} primitives.` };
  }
  if (typeof original !== 'string' || !normalize(original)) {
    return { ok: false, error: 'The paragraph text is required to find the element.' };
  }

  const found = await locate(root, normalize(original));
  if (found.error) return { ok: false, error: found.error };

  const hit = found.hit;
  const where = `${path.relative(root, hit.file)}:${lineOf(hit.source, hit.start)}`;
  const context = detectContext(hit.source, hit.start, hit.end);

  if (context?.kind !== 'markup') {
    return {
      ok: false,
      error: `That copy is data (${where}), so its class lives on a shared component and changing it would restyle every block using it. Change it in the component instead.`,
    };
  }

  const tag = openingTag(hit.source, hit.start);
  if (!tag) return { ok: false, error: `Couldn't find the tag around that copy at ${where}.` };
  if (/class:list|class=\{/.test(tag.raw)) {
    return { ok: false, error: `The element at ${where} builds its class in an expression, so it has to be changed in the source.` };
  }

  const attr = tag.raw.match(/\sclass=("([^"]*)"|'([^']*)')/);
  const existing = attr ? (attr[2] ?? attr[3]) : '';
  const classes = existing.split(/\s+/).filter(Boolean);
  const before = classes.find((name) => spec.test.test(name)) ?? null;

  if (before === (value ?? null)) return { ok: true, unchanged: true, file: path.relative(root, hit.file), line: lineOf(hit.source, hit.start), before };

  // Swapped where it stands rather than filtered and appended: keeping the
  // position makes an undo byte-exact, instead of leaving a diff that only
  // reorders the class list.
  const at = classes.findIndex((name) => spec.test.test(name));
  let next;
  if (at === -1) {
    next = value ? [...classes, value] : [...classes];
  } else if (value) {
    next = [...classes];
    next[at] = value;
  } else {
    next = classes.filter((_, index) => index !== at);
  }

  let tagSource;
  if (attr) {
    tagSource = tag.raw.slice(0, attr.index) + ` class="${next.join(' ')}"` + tag.raw.slice(attr.index + attr[0].length);
  } else {
    // No class attribute yet: put one right after the tag name
    tagSource = tag.raw.replace(/^(<[a-zA-Z][\w-]*)/, `$1 class="${next.join(' ')}"`);
  }

  const patched = hit.source.slice(0, tag.start) + tagSource + hit.source.slice(tag.end + 1);
  await writeFile(hit.file, patched, 'utf8');

  return {
    ok: true,
    file: path.relative(root, hit.file),
    line: lineOf(hit.source, hit.start),
    before,
    after: value ?? null,
  };
}
