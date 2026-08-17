// Glazed Web Ordering: the numbers, in one place.
//
// This is the ordering system's lib/site.ts. Every fact the guest flow or the
// kitchen screen prints comes from here, so a correction is one edit.

export const ORDERING = {
  // The model: guests pay a flat order fee, disclosed on the menu page before
  // checkout. Half stays with the bar, half goes to Glazed Web. The split is
  // implemented at payment time (Stripe application_fee_amount = feeStudioCents);
  // the bar's half never moves anywhere, it simply settles with the order.
  feeCents: 99,
  feeStudioCents: 49, // Glazed Web's application fee when Stripe is wired
  feeLabel: "99¢ order fee",
  // Truthful, and the differentiator. Shown wherever the fee is shown.
  feeExplainer: "Half of it stays right here at the bar.",

  // Michigan sales tax on prepared food. The demo computes it directly; the
  // live build hands this to Stripe Tax on the connected account instead.
  // Treasury guidance points to the order fee being taxable as part of the
  // sales price, so tax applies to subtotal + fee. Confirm at the tax consult.
  taxRate: 0.06,

  // Pickup quote = base + busiest item's prep + the kitchen's busy dial.
  basePickupMinutes: 15,

  // Ordering window, America/Detroit. The kitchen closes at 10 PM (see
  // KITCHEN_NOTE in lib/site.ts); last online order goes in 30 minutes before
  // that so nobody fires a ticket into a closing kitchen. Sunday opens at 9
  // for brunch. Times are minutes from midnight local.
  timezone: "America/Detroit",
  window: {
    // 0 = Sunday ... 6 = Saturday
    openMinutes: [9 * 60, 11 * 60, 11 * 60, 11 * 60, 11 * 60, 11 * 60, 11 * 60],
    lastOrderMinutes: 21 * 60 + 30, // 9:30 PM, every day
  },

  // Tip presets, percent of subtotal. "No tip" is always offered; pickup tips
  // are optional and every cent settles to the bar, never to the platform.
  tipPercents: [10, 15, 20],

  // Demo mode: no Stripe keys configured means checkout places the order
  // without charging a card, and says so honestly on the pay button. Wiring
  // payment is: create the connected account, set the env vars named in
  // .env.example, implement createCheckoutSession in lib/ordering/payment.ts.
  demoNoticeShort: "Demo checkout. No card is charged.",
} as const;

// PLACEHOLDER: demo PIN. Set KITCHEN_PIN in Vercel before this goes anywhere
// near real staff. 0133 is the street number, chosen so Kevin can demo it
// without a note, and it is exactly as secret as a street number is.
export const KITCHEN_PIN_FALLBACK = "0133";
