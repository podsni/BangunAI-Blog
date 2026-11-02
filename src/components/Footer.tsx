import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner container mx-auto px-4 sm:px-6">
        <div className="site-footer__brand">
          <Link to="/" className="site-brand" aria-label="BangunAI — Beranda">
            <img src="/favicon.png" alt="" className="site-brand__mark" />
            <span>Bangun<span>AI</span></span>
          </Link>
          <p>Taman digital untuk gagasan, catatan, dan bacaan yang layak disimpan.</p>
        </div>
        <nav className="site-footer__links" aria-label="Navigasi footer">
          <Link to="/writing">Writing</Link>
          <Link to="/artikel">Artikel</Link>
          <Link to="/read">Bacaan</Link>
          <Link to="/about">Tentang <ArrowUpRight size={13} aria-hidden="true" /></Link>
        </nav>
        <div className="site-footer__bottom">
          <span>© 2026 BangunAI</span>
          <span>Dirawat dengan rasa ingin tahu.</span>
        </div>
      </div>
    </footer>
  );
}
