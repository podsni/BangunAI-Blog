import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Search, Menu, X } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SearchModal = lazy(() => import("./SearchModal"));

const primaryLinks = [
  { label: "Writing", to: "/writing" },
  { label: "Artikel", to: "/artikel" },
  { label: "Bacaan", to: "/read" },
  { label: "Daily", to: "/daily" },
];

const moreLinks = [
  { label: "Now", to: "/now" },
  { label: "Tags", to: "/tags" },
  { label: "Graph", to: "/graph" },
  { label: "About", to: "/about" },
];

const mobileLinks = [...primaryLinks, ...moreLinks];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);
  const moreIsActive = moreLinks.some((link) => isActive(link.to));

  return (
    <>
      <nav className={`site-nav${scrolled ? " site-nav--scrolled" : ""}`} aria-label="Navigasi utama">
        <div className="site-nav__container">
          <Link to="/" className="site-brand" aria-label="BangunAI — Beranda">
            <img src="/favicon.png" alt="" className="site-brand__mark" />
            <span>Bangun<span>AI</span></span>
          </Link>

          <div className="site-nav__desktop">
            {primaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={isActive(link.to) ? "page" : undefined}
                className={`site-nav__link${isActive(link.to) ? " site-nav__link--active" : ""}`}
              >
                {link.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className={`site-nav__more${moreIsActive ? " site-nav__link--active" : ""}`}>
                Lainnya <ChevronDown size={14} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {moreLinks.map((link) => (
                  <DropdownMenuItem key={link.to} asChild>
                    <Link to={link.to} aria-current={isActive(link.to) ? "page" : undefined}>
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="site-nav__actions">
            <button
              onClick={() => setSearchOpen(true)}
              className="site-nav__search"
              aria-label="Cari tulisan (Ctrl+K)"
              title="Cari tulisan (Ctrl+K)"
            >
              <Search size={16} aria-hidden="true" />
              <span className="site-nav__search-label">Cari</span>
              <kbd>⌘ K</kbd>
            </button>
            <ThemeToggle />
            <button
              className="site-nav__menu"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
            >
              {mobileOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id="mobile-navigation" className="site-nav__mobile">
            <div className="site-nav__mobile-grid">
              {mobileLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive(link.to) ? "page" : undefined}
                  className={`site-nav__mobile-link${isActive(link.to) ? " site-nav__mobile-link--active" : ""}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {searchOpen && (
        <Suspense fallback={null}>
          <SearchModal open={searchOpen} onClose={closeSearch} />
        </Suspense>
      )}
    </>
  );
}
