import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Instagram,
  MessageCircle,
  Music2,
  Share2,
  Sparkles,
  Twitter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SharePanelProps = {
  title: string;
  summary?: string;
  badge?: string;
  className?: string;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function slugifyFilename(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bangunai-story"
  );
}

function getCleanShareUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function copyWithFallback(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      if (ok) resolve();
      else reject(new Error("Clipboard tidak tersedia"));
    } catch (error) {
      reject(error);
    }
  });
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    let last = visible[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    visible[maxLines - 1] = `${last.trimEnd()}…`;
    lines.splice(0, lines.length, ...visible);
  }

  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

async function makeStoryImage(title: string, summary: string, badge: string) {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const background = ctx.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#101b30");
  background.addColorStop(0.55, "#20233b");
  background.addColorStop(1, "#151525");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glowTop = ctx.createRadialGradient(900, 160, 20, 900, 160, 480);
  glowTop.addColorStop(0, "rgba(226, 176, 102, 0.28)");
  glowTop.addColorStop(1, "rgba(226, 176, 102, 0)");
  ctx.fillStyle = glowTop;
  ctx.fillRect(380, 0, 700, 650);

  const glowBottom = ctx.createRadialGradient(80, 1780, 20, 80, 1780, 500);
  glowBottom.addColorStop(0, "rgba(88, 148, 187, 0.22)");
  glowBottom.addColorStop(1, "rgba(88, 148, 187, 0)");
  ctx.fillStyle = glowBottom;
  ctx.fillRect(0, 1320, 650, 600);

  ctx.strokeStyle = "rgba(255, 248, 235, 0.045)";
  ctx.lineWidth = 1;
  for (let x = 72; x <= 1008; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1920);
    ctx.stroke();
  }

  ctx.fillStyle = "#f8e7c8";
  ctx.font = "700 29px 'Space Grotesk', sans-serif";
  ctx.fillText("BANGUNAI", 72, 120);
  ctx.fillStyle = "rgba(255, 248, 235, 0.58)";
  ctx.font = "500 24px 'Inter', sans-serif";
  ctx.fillText("TAMAN DIGITAL", 72, 160);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fillRect(72, 230, 330, 60);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.strokeRect(72, 230, 330, 60);
  ctx.fillStyle = "#f4c98a";
  ctx.font = "600 25px 'Space Grotesk', sans-serif";
  ctx.fillText(normalizeText(badge).toLocaleUpperCase("id-ID"), 96, 269);

  const safeTitle = normalizeText(title);
  const titleFont = Math.max(48, Math.min(76, Math.round(6100 / Math.max(safeTitle.length, 70))));
  ctx.fillStyle = "#fff8eb";
  ctx.font = `700 ${titleFont}px 'Space Grotesk', sans-serif`;
  const titleEndY = drawWrappedText(ctx, safeTitle, 72, 410, 936, titleFont * 1.22, 7);

  const summaryText = summary || "Satu gagasan untuk dibaca pelan dan dipikirkan lebih jauh.";
  ctx.fillStyle = "rgba(255, 248, 235, 0.82)";
  ctx.font = "500 38px 'Source Serif 4', serif";
  drawWrappedText(ctx, summaryText, 72, Math.min(titleEndY + 54, 1270), 900, 54, 4);

  ctx.strokeStyle = "rgba(255, 248, 235, 0.28)";
  ctx.beginPath();
  ctx.moveTo(72, 1608);
  ctx.lineTo(1008, 1608);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 248, 235, 0.62)";
  ctx.font = "600 24px 'Inter', sans-serif";
  ctx.fillText("BACA SELENGKAPNYA DI", 72, 1680);
  ctx.fillStyle = "#fff8eb";
  ctx.font = "700 36px 'Space Grotesk', sans-serif";
  ctx.fillText("blog.bangundwir.my.id", 72, 1740);
  ctx.fillStyle = "rgba(255, 248, 235, 0.67)";
  ctx.font = "500 25px 'Inter', sans-serif";
  ctx.fillText("Instagram: tambahkan Link Sticker · TikTok: cek tautan profil", 72, 1822);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function SharePanel({
  title,
  summary = "",
  badge = "share",
  className,
}: SharePanelProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const shareUrl = getCleanShareUrl();

  const summaryText = useMemo(() => truncateText(normalizeText(summary), 200), [summary]);
  const captionText = useMemo(
    () => [title, summaryText, shareUrl, "#BangunAI #TamanDigital"].filter(Boolean).join("\n\n"),
    [title, summaryText, shareUrl],
  );
  const whatsappText = useMemo(
    () => [title, summaryText, shareUrl].filter(Boolean).join("\n\n"),
    [title, summaryText, shareUrl],
  );

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await copyWithFallback(shareUrl);
      setCopiedLink(true);
      setActionMessage("Tautan bersih berhasil disalin.");
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      setActionMessage("Tautan tidak dapat disalin otomatis. Salin dari bilah alamat browser.");
    }
  };

  const handleCopyCaption = async () => {
    if (!captionText) return;
    try {
      await copyWithFallback(captionText);
      setCopiedCaption(true);
      setActionMessage("Caption dan tautan siap ditempel.");
      window.setTimeout(() => setCopiedCaption(false), 1800);
    } catch {
      setActionMessage("Caption tidak dapat disalin otomatis pada browser ini.");
    }
  };

  const handleShareLink = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: summaryText, url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await handleCopyLink();
  };

  const makeStoryFile = async () => {
    const blob = await makeStoryImage(title, summaryText, badge);
    if (!blob) throw new Error("Canvas tidak tersedia");
    return new File([blob], `${slugifyFilename(title)}-bangunai-story.png`, { type: "image/png" });
  };

  const handleShareStory = async (downloadOnly = false) => {
    if (!title || !shareUrl || isGeneratingStory) return;
    setIsGeneratingStory(true);
    setActionMessage("");

    try {
      const storyFile = await makeStoryFile();
      if (
        !downloadOnly &&
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [storyFile] })
      ) {
        try {
          await navigator.share({
            files: [storyFile],
            title: `${title} — BangunAI`,
            text: shareUrl,
          });
          setActionMessage("Pilih Instagram atau TikTok jika tersedia di menu berbagi perangkat.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }

      downloadBlob(storyFile, storyFile.name);
      setActionMessage("Kartu Story 9:16 diunduh. Unggah ke Instagram Story atau TikTok, lalu tambahkan tautan sesuai fitur aplikasinya.");
    } catch {
      setActionMessage("Kartu Story tidak dapat dibuat di browser ini. Coba buka halaman lewat browser ponsel terbaru.");
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const buttonClass =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border/50 bg-secondary/35 px-3 py-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className={cn("max-w-[68ch] w-full mx-auto mt-10 pt-8 border-t border-border/40", className)}>
      <div className="rounded-2xl border border-border/45 bg-card/35 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground/95">Bagikan bacaan ini</p>
          <p className="text-[11px] text-muted-foreground/75">Link rapi · caption · kartu Story</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
            aria-label="Bagikan ke WhatsApp"
          >
            <MessageCircle size={14} aria-hidden="true" /> WhatsApp
          </a>
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
            aria-label="Bagikan ke X"
          >
            <Twitter size={14} aria-hidden="true" /> X
          </a>
          <button onClick={handleShareLink} className={buttonClass} aria-label="Bagikan tautan lewat menu perangkat">
            <Share2 size={14} aria-hidden="true" /> Bagikan link
          </button>
          <button onClick={handleCopyCaption} className={buttonClass} aria-label="Salin caption Instagram atau TikTok">
            {copiedCaption ? <Check size={14} className="text-green-400" /> : <Instagram size={14} />}
            {copiedCaption ? "Tersalin" : "Caption IG/TikTok"}
          </button>
          <button onClick={handleCopyLink} className={buttonClass} aria-label="Salin link bacaan">
            {copiedLink ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copiedLink ? "Tersalin" : "Copy link"}
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            onClick={() => void handleShareStory()}
            disabled={isGeneratingStory}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent/35 bg-accent/12 px-3 py-2.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:cursor-wait disabled:opacity-70"
            aria-label="Bagikan kartu Story Instagram atau TikTok"
          >
            {isGeneratingStory ? <Sparkles size={14} className="animate-pulse" /> : <><Instagram size={14} /><Music2 size={14} /></>}
            {isGeneratingStory ? "Menyiapkan kartu…" : "Bagikan kartu Story IG / TikTok"}
          </button>
          <button
            onClick={() => void handleShareStory(true)}
            disabled={isGeneratingStory}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/50 bg-secondary/35 px-3 py-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-secondary/60 disabled:cursor-wait disabled:opacity-70"
            aria-label="Unduh kartu Story vertikal 9 banding 16"
          >
            <Download size={14} aria-hidden="true" /> Unduh 9:16
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/75">
          Di ponsel, tombol utama membuka menu berbagi bila didukung—pilih Instagram atau TikTok jika tersedia. Jika tidak, kartu 1080×1920 akan diunduh; tambahkan Link Sticker di IG atau tautan profil di TikTok jika fitur itu tersedia.
        </p>
        {actionMessage && <p className="mt-2 text-xs text-accent" role="status" aria-live="polite">{actionMessage}</p>}
      </div>
    </div>
  );
}
