import type { Metadata } from "next";
import KitchenClient from "@/components/ordering/KitchenClient";
import { Section } from "@/components/ui";
import { loadMenuDoc, toOrderable } from "@/lib/ordering/menu";
import { getStore } from "@/lib/ordering/store";

// Staff-only surface. Kept out of the index and out of the sitemap; the PIN
// gate does the rest. See lib/ordering/auth.ts for what that gate is and is not.
export const metadata: Metadata = {
  title: "Kitchen",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  // The board sees everything, hidden included: hidden items still need 86
  // history and the editor lists them greyed.
  const sections = toOrderable(await loadMenuDoc(getStore()), { includeHidden: true });
  return (
    <Section>
      <KitchenClient sections={sections} />
    </Section>
  );
}
