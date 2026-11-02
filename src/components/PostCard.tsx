import { Link } from "react-router-dom";
import { Post } from "@/data/posts";
import TypeBadge from "./TypeBadge";
import { formatDateMedium, formatDateShort } from "@/lib/date";

const postUrl = (post: Post) =>
  post.type === "article" ? `/artikel/${post.slug}` : `/writing/${post.slug}`;

export function FeaturedCard({ post }: { post: Post }) {
  return (
    <Link to={postUrl(post)} className="glass-card group block transition-all hover:bg-[hsl(var(--glass-bg-hover))]">
      <div className="flex items-center gap-2 mb-3">
        <TypeBadge type={post.type} />
        <span className="text-xs text-muted-foreground">{post.category}</span>
      </div>
      <h3 className="font-heading text-xl font-bold mb-2 transition-colors group-hover:text-accent">
        {post.title}
      </h3>
      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mb-4">{post.summary}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{formatDateMedium(post.date)}</span>
        <span aria-hidden="true">·</span>
        <span>{post.readingTime} menit baca</span>
      </div>
    </Link>
  );
}

export function ListCard({ post }: { post: Post }) {
  return (
    <Link to={postUrl(post)} className="group block border-b border-border py-5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <TypeBadge type={post.type} />
            <span className="text-xs text-muted-foreground">{post.category}</span>
          </div>
          <h3 className="mb-1 font-heading text-lg font-semibold transition-colors group-hover:text-accent">
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{post.summary}</p>
        </div>
        <div className="hidden flex-shrink-0 pt-6 text-right text-xs text-muted-foreground sm:block">
          <span>{formatDateShort(post.date)}</span>
          <span className="ml-2">{post.readingTime}m</span>
        </div>
      </div>
      <div className="mt-3 flex gap-3 text-xs text-muted-foreground sm:hidden">
        <span>{formatDateShort(post.date)}</span>
        <span>{post.readingTime} menit baca</span>
      </div>
    </Link>
  );
}

export function CompactRow({ post }: { post: Post }) {
  return (
    <Link to={postUrl(post)} className="compact-row group">
      <div className="compact-row__title">
        <TypeBadge type={post.type} />
        <span className="compact-row__text group-hover:text-accent">{post.title}</span>
      </div>
      <span className="compact-row__date">{formatDateShort(post.date)}</span>
    </Link>
  );
}
