/**
 * SVG logos, safely (Step 7). An SVG is a program-shaped document (scripts, event handlers, external references,
 * styles, entities), so it is not "sanitised" — it is PARSED against a small allow-list of plain drawing elements, and
 * anything outside that list REJECTS the file. What is stored is then written out again from the parsed form, so no
 * byte the parser did not understand survives.
 *
 * Refused outright: scripts, `foreignObject`, `image`, `use`, `style`/`link`, `a`, text and fonts, filters, masks,
 * animation, every `on*` handler, `style` attributes, any `href`, DOCTYPE/entities/CDATA/processing instructions, and
 * colour or clip references that leave the file. What is left cannot run code or fetch anything: paths and basic
 * shapes, gradients, groups, clip paths. (Text must be converted to outlines first; the message says so.)
 *
 * Pure: bytes in, a result out. Used only on upload; the file is also served under a restrictive CSP as defence in depth.
 */

export type SvgReason =
  | "not_svg"
  | "too_large"
  | "malformed"
  | "forbidden_element"
  | "forbidden_attribute"
  | "forbidden_value"
  | "too_complex"
  | "no_size";

export type SvgResult =
  | { ok: true; svg: string; width: number; height: number }
  | { ok: false; reason: SvgReason; detail?: string };

export const MAX_SVG_CHARS = 200_000;
const MAX_ELEMENTS = 1500;
const MAX_DEPTH = 12;
const MAX_PATH = 30_000;
const MAX_ATTR = 4_000;
const SVG_NS = "http://www.w3.org/2000/svg";

const ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
]);
/** Kept out of the output but harmless (text only): titles and descriptions many exporters add. */
const DROPPED_ELEMENTS = new Set(["title", "desc"]);

const NUMBER_LIST = /^[-+0-9.eE\s,%]*$/;
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/;
const TRANSFORM =
  /^(?:\s*(?:translate|scale|rotate|skewX|skewY|matrix)\s*\([-+0-9.eE\s,]*\)\s*,?)*$/;
const COLOR =
  /^(?:#[0-9a-fA-F]{3,8}|none|currentColor|transparent|[a-zA-Z]{3,20}|rgba?\(\s*[0-9.\s,%]+\)|hsla?\(\s*[0-9.\s,%deg]+\)|url\(#[A-Za-z][\w-]{0,40}\))$/;
const IDENT = /^[A-Za-z][\w-]{0,40}$/;
const KEYWORD = /^[a-zA-Z-]{1,30}$/;
const FUNC_URL = /^url\(#([A-Za-z][\w-]{0,40})\)$/;

type ValueKind =
  "number" | "list" | "path" | "transform" | "color" | "id" | "keyword" | "url" | "viewbox";

const ATTRIBUTES: Record<string, ValueKind> = {
  id: "id",
  d: "path",
  x: "number",
  y: "number",
  cx: "number",
  cy: "number",
  r: "number",
  rx: "number",
  ry: "number",
  x1: "number",
  y1: "number",
  x2: "number",
  y2: "number",
  fx: "number",
  fy: "number",
  width: "number",
  height: "number",
  offset: "number",
  points: "list",
  viewBox: "viewbox",
  transform: "transform",
  gradientTransform: "transform",
  fill: "color",
  stroke: "color",
  "stop-color": "color",
  "clip-path": "url",
  opacity: "number",
  "fill-opacity": "number",
  "stroke-opacity": "number",
  "stop-opacity": "number",
  "stroke-width": "number",
  "stroke-miterlimit": "number",
  "stroke-dashoffset": "number",
  "stroke-dasharray": "list",
  "stroke-linecap": "keyword",
  "stroke-linejoin": "keyword",
  "fill-rule": "keyword",
  "clip-rule": "keyword",
  gradientUnits: "keyword",
  clipPathUnits: "keyword",
  spreadMethod: "keyword",
  preserveAspectRatio: "list",
};
/** Harmless attributes an exporter adds; dropped without complaint. */
const IGNORED =
  /^(?:class|version|baseProfile|xml:space|role|focusable|aria-[\w-]+|data-[\w-]+|xmlns:xlink|xmlns:svg|xmlns:xml|enable-background|shape-rendering|vector-effect)$/;

const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};
const decode = (s: string): string | null => {
  let bad = false;
  const out = s.replace(/&[^;\s]{1,10};?/g, (m) => {
    const known = ENTITY[m];
    if (known === undefined) bad = true;
    return known ?? m;
  });
  return bad ? null : out;
};
const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const reject = (reason: SvgReason, detail?: string): SvgResult => ({ ok: false, reason, detail });

function validValue(kind: ValueKind, v: string): boolean {
  if (v.length > (kind === "path" ? MAX_PATH : MAX_ATTR)) return false;
  switch (kind) {
    case "number":
    case "viewbox":
      return NUMBER_LIST.test(v);
    case "list":
      return /^[-+0-9.eE\s,a-zA-Z]*$/.test(v);
    case "path":
      return PATH_DATA.test(v);
    case "transform":
      return TRANSFORM.test(v);
    case "color":
      return COLOR.test(v);
    case "id":
      return IDENT.test(v);
    case "keyword":
      return KEYWORD.test(v);
    case "url":
      return v === "none" || FUNC_URL.test(v);
  }
}

interface Node {
  name: string;
  attrs: Array<[string, string]>;
  children: Node[];
}

const TAG =
  /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][-A-Za-z0-9_:.]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTR = /\s+([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function sanitizeSvg(input: Uint8Array): SvgResult {
  if (input.length === 0 || input.length > MAX_SVG_CHARS * 2) return reject("too_large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(input);
  } catch {
    return reject("malformed", "utf8");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.length > MAX_SVG_CHARS) return reject("too_large");
  if (/\u0000/.test(text)) return reject("malformed");

  // prolog and comments are the only markup that is not an element; anything else of that shape is refused
  text = text.replace(/^\s*<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  if (/<[!?]/.test(text)) return reject("forbidden_element", "declaration"); // DOCTYPE, CDATA, processing instructions

  const root: Node = { name: "#root", attrs: [], children: [] };
  const stack: Node[] = [root];
  const ids = new Set<string>();
  const refs: string[] = [];
  let elements = 0;
  let pos = 0;
  let inDropped: string | null = null;

  while (pos < text.length) {
    const next = text.indexOf("<", pos);
    const between = text.slice(pos, next === -1 ? text.length : next);
    if (next === -1) {
      if (between.trim()) return reject("malformed", "text");
      break;
    }
    if (between.trim() && !inDropped) return reject("forbidden_element", "text");
    TAG.lastIndex = next;
    const m = TAG.exec(text);
    if (!m) return reject("malformed", "tag");
    pos = TAG.lastIndex;
    const [, closing, name, attrText, selfClosing] = m as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];

    if (inDropped) {
      if (closing && name === inDropped) inDropped = null;
      else return reject("forbidden_element", name);
      continue;
    }
    if (closing) {
      const top = stack.pop();
      if (!top || top.name !== name || stack.length === 0) return reject("malformed", "nesting");
      continue;
    }
    if (DROPPED_ELEMENTS.has(name)) {
      if (!selfClosing) inDropped = name;
      continue;
    }
    if (!ELEMENTS.has(name)) return reject("forbidden_element", name);
    elements += 1;
    if (elements > MAX_ELEMENTS) return reject("too_complex");
    if (stack.length > MAX_DEPTH) return reject("too_complex");
    const isRoot = stack.length === 1;
    if (isRoot !== (name === "svg") || (isRoot && root.children.length > 0))
      return reject("malformed", "root");

    const node: Node = { name, attrs: [], children: [] };
    let namespace = false;
    const seen = new Set<string>();
    for (const a of attrText.matchAll(ATTR)) {
      const attr = a[1]!;
      const raw = a[2] ?? a[3] ?? "";
      if (seen.has(attr)) return reject("malformed", "duplicate attribute");
      seen.add(attr);
      if (attr === "xmlns") {
        if (!isRoot || raw !== SVG_NS) return reject("forbidden_attribute", "xmlns");
        namespace = true;
        continue;
      }
      if (IGNORED.test(attr)) continue;
      if (/^on/i.test(attr) || /href/i.test(attr) || attr === "style")
        return reject("forbidden_attribute", attr);
      const kind = ATTRIBUTES[attr];
      if (!kind) return reject("forbidden_attribute", attr);
      const value = decode(raw);
      if (value === null) return reject("forbidden_value", attr);
      const trimmed = value.trim();
      if (!validValue(kind, trimmed)) return reject("forbidden_value", attr);
      if (kind === "id") ids.add(trimmed);
      if (kind === "url" || kind === "color") {
        const ref = FUNC_URL.exec(trimmed);
        if (ref) refs.push(ref[1]!);
      }
      node.attrs.push([attr, trimmed]);
    }
    if (isRoot && !namespace) return reject("not_svg");
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (inDropped || stack.length !== 1) return reject("malformed", "unclosed");
  const svg = root.children[0];
  if (!svg) return reject("not_svg");
  for (const ref of refs) if (!ids.has(ref)) return reject("forbidden_value", "reference");

  // size: width/height in pixels (or plain numbers), else the viewBox
  const num = (name: string) => {
    const v = svg.attrs.find(([k]) => k === name)?.[1];
    if (!v || v.includes("%")) return null;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
  };
  const vb = svg.attrs.find(([k]) => k === "viewBox")?.[1];
  const box = vb
    ? vb
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
    : [];
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0;
  const width = num("width") ?? (hasBox ? box[2]! : null);
  const height = num("height") ?? (hasBox ? box[3]! : null);
  if (!width || !height) return reject("no_size");
  if (!hasBox) svg.attrs.push(["viewBox", `0 0 ${width} ${height}`]);
  svg.attrs = svg.attrs.filter(([k]) => k !== "width" && k !== "height");

  const write = (n: Node): string => {
    const attrs = [
      ...(n.name === "svg" ? ([["xmlns", SVG_NS]] as Array<[string, string]>) : []),
      ...n.attrs,
    ]
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join("");
    return n.children.length > 0
      ? `<${n.name}${attrs}>${n.children.map(write).join("")}</${n.name}>`
      : `<${n.name}${attrs}/>`;
  };
  return { ok: true, svg: write(svg), width, height };
}
