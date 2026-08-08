import Image from "next/image";
import Link from "next/link";

export function Section({
  children,
  className = "",
  dark = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`${dark ? "bg-ink-soft" : "bg-ink"} px-5 py-20 lg:px-8 lg:py-28 ${className}`}
    >
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="display text-xs uppercase tracking-[0.3em] text-copper">{children}</p>
  );
}

export function Heading({
  children,
  as: Tag = "h2",
  className = "",
}: {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      className={`text-3xl uppercase leading-[1.1] text-cream sm:text-4xl lg:text-5xl ${className}`}
    >
      {children}
    </Tag>
  );
}

export function Button({
  href,
  children,
  variant = "solid",
  external = false,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline";
  external?: boolean;
  className?: string;
}) {
  const base =
    "display inline-flex items-center justify-center rounded-sm px-7 py-4 text-sm uppercase tracking-widest transition-colors";
  const styles =
    variant === "solid"
      ? "bg-copper text-white hover:bg-copper-light"
      : "border border-copper text-copper-light hover:bg-copper hover:text-white";
  const cls = `${base} ${styles} ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function PageHero({
  title,
  subtitle,
  image,
  imageAlt,
}: {
  title: string;
  subtitle?: string;
  image: string;
  imageAlt: string;
}) {
  return (
    <div className="relative flex min-h-[38vh] items-end overflow-hidden border-b border-ink-line lg:min-h-[46vh]">
      <Image
        src={image}
        alt={imageAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
      <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-24 lg:px-8 lg:pb-20">
        <Heading as="h1">{title}</Heading>
        {subtitle && (
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-cream-dim sm:text-lg">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
