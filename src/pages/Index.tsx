import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BookOpen, Clock3, Sparkles } from "lucide-react";
import auroraBg from "@/assets/aurora-bg.jpg";
import { getLatestPosts, getLatestDailyNotes, readItems } from "@/data/posts";
import type { Post } from "@/data/posts";
import ReadItemCard from "@/components/ReadItemCard";
import TypeBadge from "@/components/TypeBadge";
import { CompactRow } from "@/components/PostCard";
import { formatDateShort, formatDateMedium } from "@/lib/date";

const getPostUrl = (post: Post) =>
  post.type === "article" ? `/artikel/${post.slug}` : `/writing/${post.slug}`;

export default function Index() {
  const latest = getLatestPosts(9);
  const featured = latest[0];
  const supporting = latest.slice(1, 3);
  const archive = latest.slice(3, 8);
  const daily = getLatestDailyNotes(3);
  const nowReading = readItems.slice(0, 3);

  return (
    <div className="home-page">
      <section className="container mx-auto px-4 pt-24 sm:px-6 sm:pt-28">
        <div className="home-hero">
          <div className="home-hero__copy">
            <div className="home-eyebrow">
              <span className="home-eyebrow__dot" />
              <span>BangunAI <span aria-hidden="true">/</span> taman digital</span>
            </div>
            <h1>Ide besar untuk memahami dunia dengan lebih jernih.</h1>
            <p>
              Catatan dan tulisan tentang AI, filsafat, sejarah, budaya, dan cara kita hidup—
              untuk dibaca pelan, dipikirkan lebih jauh.
            </p>
            <div className="home-hero__actions">
              <Link to="/semua" className="home-button home-button--primary">
                Jelajahi semua tulisan <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/about" className="home-button home-button--quiet">
                Tentang blog <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <div className="home-hero__topics" aria-label="Jelajahi kategori">
              <Link to="/writing">Writing</Link>
              <Link to="/artikel">Artikel</Link>
              <Link to="/read">Bacaan</Link>
              <Link to="/daily">Daily</Link>
            </div>
          </div>
          <div
            className="home-hero__visual"
            style={{ backgroundImage: `url(${auroraBg})` }}
            aria-hidden="true"
          >
            <div className="home-hero__visual-top">
              <span><Sparkles size={14} /> IDEAS IN PROGRESS</span>
              <span>01 — ∞</span>
            </div>
            <div className="home-orbit home-orbit--outer" />
            <div className="home-orbit home-orbit--inner" />
            <div className="home-orbit__core"><BookOpen size={25} /></div>
            <div className="home-hero__visual-caption">
              <span>SEBUAH TAMAN GAGASAN</span>
              <span>Catatan yang terus tumbuh.</span>
            </div>
          </div>
        </div>
      </section>

      {featured && (
        <section className="container mx-auto px-4 pt-16 sm:px-6 sm:pt-20">
          <div className="home-section-heading">
            <div>
              <p className="home-kicker">BARU DI TAMAN</p>
              <h2>Tulisan terbaru</h2>
              <p className="home-section-intro">Pilih satu ide, lalu ikuti ke mana ia membawa.</p>
            </div>
            <Link to="/semua" className="home-text-link">
              Lihat semua <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="home-feature-grid">
            <Link to={getPostUrl(featured)} className="home-featured-post group">
              <div className="home-featured-post__topline">
                <div className="flex items-center gap-2">
                  <TypeBadge type={featured.type} />
                  <span className="text-sm text-muted-foreground">{featured.category}</span>
                </div>
                <span className="home-featured-post__index">01</span>
              </div>
              <div className="home-featured-post__body">
                <p className="home-featured-post__label">SOROTAN TERBARU</p>
                <h3 className="group-hover:text-accent">{featured.title}</h3>
                <p className="home-featured-post__summary">{featured.summary}</p>
              </div>
              <div className="home-featured-post__bottom">
                <div className="home-post-meta">
                  <span>{formatDateMedium(featured.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span><Clock3 size={13} aria-hidden="true" /> {featured.readingTime} menit baca</span>
                </div>
                <span className="home-read-link">Baca tulisan <ArrowUpRight size={16} aria-hidden="true" /></span>
              </div>
            </Link>

            <div className="home-supporting-posts">
              {supporting.map((post, index) => (
                <Link key={post.slug} to={getPostUrl(post)} className="home-supporting-post group">
                  <div className="home-supporting-post__meta">
                    <TypeBadge type={post.type} />
                    <span>{formatDateShort(post.date)}</span>
                  </div>
                  <h3 className="group-hover:text-accent">{post.title}</h3>
                  <p>{post.summary}</p>
                  <span className="home-supporting-post__number">0{index + 2}</span>
                </Link>
              ))}
              <Link to="/semua" className="home-more-link">
                Lanjutkan menjelajah <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {archive.length > 0 && (
        <section className="container mx-auto px-4 pt-16 sm:px-6 sm:pt-20">
          <div className="home-section-heading">
            <div>
              <p className="home-kicker">JANGAN BERHENTI DI SINI</p>
              <h2>Masih baru</h2>
              <p className="home-section-intro">Tulisan lain yang baru saja ditambahkan.</p>
            </div>
            <Link to="/semua" className="home-text-link">
              Buka arsip <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="home-archive glass-card">
            {archive.map((post) => <CompactRow key={post.slug} post={post} />)}
          </div>
        </section>
      )}

      <div className="container mx-auto grid gap-12 px-4 pb-4 pt-16 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:gap-8">
        {daily.length > 0 && (
          <section className="home-collection">
            <div className="home-section-heading home-section-heading--compact">
              <div>
                <p className="home-kicker">CATATAN RINGKAS</p>
                <h2>Daily</h2>
              </div>
              <Link to="/daily" className="home-text-link" aria-label="Lihat semua catatan Daily">
                Semua <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <div className="home-daily-list">
              {daily.map((note) => (
                <Link key={note.slug} to={`/daily/${note.slug}`} className="home-daily-item group">
                  <div className="home-daily-item__date">{formatDateShort(note.date)}</div>
                  <div className="min-w-0">
                    <h3 className="group-hover:text-accent">{note.title}</h3>
                    <p>{note.summary}</p>
                  </div>
                  <ArrowUpRight className="home-daily-item__arrow" size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="home-collection">
          <div className="home-section-heading home-section-heading--compact">
            <div>
              <p className="home-kicker">SUMBER YANG MENARIK</p>
              <h2>Sedang dibaca</h2>
            </div>
            <Link to="/read" className="home-text-link" aria-label="Lihat semua bacaan">
              Semua <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="home-reading-list">
            {nowReading.map((item) => <ReadItemCard key={item.slug} item={item} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
