import type { Metadata } from "next";
import OrderingClient from "./OrderingClient";

export const metadata: Metadata = {
  title: "Order Online",
  description:
    "Order Copper Athletic Club favorites for pickup in downtown Marshall, MI. Burgers, wings, coneys, cocktails to go and more.",
  alternates: { canonical: "/order" },
  // Demo route on a preview host. Nothing indexes this until the ordering
  // product ships for real, at which point this line is the one to revisit.
  robots: { index: false, follow: false },
  openGraph: {
    title: "Order Online | Copper Athletic Club",
    description:
      "Order Copper Athletic Club favorites for pickup in downtown Marshall, MI.",
    images: [
      {
        url: "/og/menu.jpg",
        width: 1200,
        height: 630,
        alt: "Copper Athletic Club menu: burgers, coneys, wings and cold taps",
      },
    ],
  },
};

export default function OrderPage() {
  return <OrderingClient />;
}
