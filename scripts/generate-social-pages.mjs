import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const CONTENT_ROOT = path.join(ROOT, "src", "content");
const DIST_ROOT = path.join(ROOT, "dist");
const SITE_ORIGIN = "https://blog.bangundwir.my.id";
const SECTION_ROUTES = {
  articles: "artikel",
  writing: "writing",
  read: "read",
  daily: "daily",
};

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setMeta(html, attribute, key, value) {
  const tag = `<meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(value)}" />`;
  const pattern = new RegExp(`<meta\\s+[^>]*\\b${attribute}=["']${escapeRegex(key)}["'][^>]*>`, "i");
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setTitle(html, title) {
  const tag = `<title>${escapeAttribute(title)}</title>`;
  return /<title>.*?<\/title>/is.test(html)
    ? html.replace(/<title>.*?<\/title>/is, tag)
    : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setCanonical(html, url) {
  const tag = `<link rel="canonical" href="${escapeAttribute(url)}" />`;
  const pattern = /<link\s+[^>]*\brel=["']canonical["'][^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function parseContentDate(value) {
  const text = String(value || "").trim();
  if (!text) return Number.NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(`${text}T00:00:00+07:00`);
  const normalized = text.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, "$1T$2");
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) return Date.parse(normalized);
  return Date.parse(`${normalized}+07:00`);
}

function setPublishedTime(html, date) {
  const pattern = /<meta\s+[^>]*\bproperty=["']article:published_time["'][^>]*>/i;
  const parsed = parseContentDate(date);
  if (!Number.isFinite(parsed)) return html.replace(pattern, "");
  const tag = `<meta property="article:published_time" content="${new Date(parsed).toISOString()}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function normalizeDescription(value, fallback) {
  const text = String(value || fallback).replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text;
}

async function listMdxFiles(directory) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function readFrontmatter(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const value = yaml.load(match[1]);
  return value && typeof value === "object" ? value : {};
}

function safeSlug(value) {
  const slug = String(value || "").trim();
  if (!slug || slug === "." || slug === ".." || /[\\/]/.test(slug)) {
    throw new Error(`Slug konten tidak valid: ${slug || "(kosong)"}`);
  }
  return slug;
}

function toIsoDate(date) {
  const timestamp = parseContentDate(date);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp)
    : "";
}

async function main() {
  const indexPath = path.join(DIST_ROOT, "index.html");
  const baseHtml = await fs.readFile(indexPath, "utf8");
  const routes = [];

  for (const [directory, routeName] of Object.entries(SECTION_ROUTES)) {
    const sourceDirectory = path.join(CONTENT_ROOT, directory);
    for (const filename of await listMdxFiles(sourceDirectory)) {
      const frontmatter = await readFrontmatter(path.join(sourceDirectory, filename));
      const fallbackSlug = filename.replace(/\.mdx$/i, "");
      const slug = safeSlug(frontmatter.slug || fallbackSlug);
      const routePath = `/${routeName}/${encodeURIComponent(slug)}`;
      const title = String(frontmatter.title || slug).trim();
      const description = normalizeDescription(frontmatter.summary || frontmatter.snippet, "Bacaan dari taman digital BangunAI.");
      const isArticle = directory !== "read";
      const pageTitle = `${title} | BangunAI`;
      const canonical = `${SITE_ORIGIN}${routePath}`;

      let html = baseHtml;
      html = setTitle(html, pageTitle);
      html = setMeta(html, "name", "description", description);
      html = setMeta(html, "property", "og:title", title);
      html = setMeta(html, "property", "og:description", description);
      html = setMeta(html, "property", "og:type", isArticle ? "article" : "website");
      html = setMeta(html, "property", "og:url", canonical);
      html = setMeta(html, "property", "og:site_name", "BangunAI");
      html = setMeta(html, "property", "og:locale", "id_ID");
      html = setMeta(html, "property", "og:image", `${SITE_ORIGIN}/og-image.png`);
      html = setMeta(html, "property", "og:image:width", "1344");
      html = setMeta(html, "property", "og:image:height", "768");
      html = setMeta(html, "name", "twitter:card", "summary_large_image");
      html = setMeta(html, "name", "twitter:title", title);
      html = setMeta(html, "name", "twitter:description", description);
      html = setMeta(html, "name", "twitter:image", `${SITE_ORIGIN}/og-image.png`);
      html = setCanonical(html, canonical);
      html = setPublishedTime(html, frontmatter.date);

      const outputPath = path.join(DIST_ROOT, routeName, slug, "index.html");
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, html, "utf8");
      routes.push({ path: routePath, date: toIsoDate(frontmatter.date) });
    }
  }

  const sitemapEntries = [
    { path: "/", date: "" },
    ...routes,
  ].map(({ path: routePath, date }) => `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${routePath}`)}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ""}\n  </url>`);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join("\n")}\n</urlset>\n`;
  await fs.writeFile(path.join(DIST_ROOT, "sitemap.xml"), sitemap, "utf8");
  process.stdout.write(`Generated ${routes.length} metadata pages and sitemap.xml\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
