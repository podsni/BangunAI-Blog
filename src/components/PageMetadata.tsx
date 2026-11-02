import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getContentBySlug, getDailyBySlug, getReadBySlug } from "@/content";

const SITE_ORIGIN = "https://blog.bangundwir.my.id";
const DEFAULT_TITLE = "BangunAI — Taman Digital";
const DEFAULT_DESCRIPTION = "Catatan dan tulisan tentang AI, filsafat, sejarah, budaya, dan cara kita hidup—untuk dibaca pelan, dipikirkan lebih jauh.";
const PAGE_TITLES: Record<string, string> = {
  writing: "Writing",
  artikel: "Artikel",
  read: "Bacaan",
  daily: "Daily",
  tags: "Tags",
  graph: "Graph",
  about: "Tentang",
  now: "Now",
  semua: "Semua tulisan",
};

type MetaAttribute = "name" | "property";

function setMeta(attribute: MetaAttribute, key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

function setCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = url;
}

function setArticleDate(date?: string) {
  let element = document.head.querySelector<HTMLMetaElement>('meta[property="article:published_time"]');
  if (!date || !Number.isFinite(Date.parse(date))) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", "article:published_time");
    document.head.appendChild(element);
  }
  element.content = new Date(date).toISOString();
}

export default function PageMetadata() {
  const { pathname } = useLocation();
  const cleanPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const segments = cleanPath.split("/").filter(Boolean);
  const [section, slug] = segments;

  const post = slug && (section === "artikel" || section === "writing") ? getContentBySlug(slug) : undefined;
  const read = slug && section === "read" ? getReadBySlug(slug) : undefined;
  const daily = slug && section === "daily" ? getDailyBySlug(slug) : undefined;
  const item = post || read || daily;

  const title = item?.title || (cleanPath === "/" ? DEFAULT_TITLE : PAGE_TITLES[section] || "BangunAI");
  const description = item
    ? ("summary" in item ? item.summary : item.snippet) || DEFAULT_DESCRIPTION
    : DEFAULT_DESCRIPTION;
  const fullTitle = item ? `${title} | BangunAI` : cleanPath === "/" ? DEFAULT_TITLE : `${title} | BangunAI`;
  const canonicalPath = cleanPath === "/" ? "/" : cleanPath;
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const socialDescription = description.replace(/\s+/g, " ").trim().slice(0, 300);
  const isArticle = Boolean(post || read || daily);
  const publishedAt = item && "date" in item ? item.date : undefined;

  useEffect(() => {
    document.title = fullTitle;
    setCanonical(canonicalUrl);
    setMeta("name", "description", socialDescription);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", socialDescription);
    setMeta("property", "og:type", isArticle ? "article" : "website");
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:site_name", "BangunAI");
    setMeta("property", "og:locale", "id_ID");
    setMeta("property", "og:image", `${SITE_ORIGIN}/og-image.png`);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", socialDescription);
    setMeta("name", "twitter:image", `${SITE_ORIGIN}/og-image.png`);
    setArticleDate(publishedAt);
  }, [canonicalUrl, fullTitle, isArticle, publishedAt, socialDescription, title]);

  return null;
}
