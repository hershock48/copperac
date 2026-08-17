import type { Metadata } from "next";
import KitchenClient from "./KitchenClient";

export const metadata: Metadata = {
  title: "Kitchen Board",
  description: "Staff board for online pickup orders.",
  // Staff page. Never indexed, demo or not.
  robots: { index: false, follow: false },
};

export default function KitchenPage() {
  return <KitchenClient />;
}
