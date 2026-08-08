import type { MenuSection } from "@/lib/menu";

function price(p: string) {
  if (!p) return "";
  const n = Number(p);
  if (Number.isNaN(n)) return p;
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

export default function MenuList({ sections }: { sections: MenuSection[] }) {
  return (
    <div className="columns-1 gap-14 lg:columns-2 xl:columns-3">
      {sections.map((section) => (
        <div key={section.name} className="mb-14 break-inside-avoid">
          <h2 className="display border-b border-copper/40 pb-3 text-xl uppercase tracking-widest text-copper">
            {section.name}
          </h2>
          <ul className="mt-6 space-y-6">
            {section.items.map((item) => (
              <li key={item.name}>
                <div className="flex items-baseline gap-3">
                  <h3 className="display text-base uppercase tracking-wide text-cream">
                    {item.name}
                  </h3>
                  <span
                    className="mx-1 hidden h-px flex-1 self-center bg-ink-line sm:block"
                    aria-hidden="true"
                  />
                  <span className="display shrink-0 text-base text-copper-light">
                    {price(item.price)}
                  </span>
                </div>
                {item.desc && (
                  <p className="mt-1.5 text-sm leading-relaxed text-cream-dim/70">
                    {item.desc}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
