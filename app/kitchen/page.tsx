import type { Metadata } from "next";
import KitchenClient from "@/components/ordering/KitchenClient";
import { Section } from "@/components/ui";
import { ORDERABLE_MENU } from "@/lib/ordering/menu";

// Staff-only surface. Kept out of the index and out of the sitemap; the PIN
// gate does the rest. See lib/ordering/auth.ts for what that gate is and is not.
export const metadata: Metadata = {
  title: "Kitchen",
  robots: { index: false, follow: false },
};

export default function KitchenPage() {
  return (
    <Section>
      <KitchenClient sections={ORDERABLE_MENU} />
    </Section>
  );
}
