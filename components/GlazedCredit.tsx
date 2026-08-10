/**
 * The studio credit for a client footer. Drop-in, self-contained, one file.
 *
 * FIVE DECISIONS IN HERE, AND EACH ONE IS A THING THAT GOES WRONG IF YOU DO THE OBVIOUS.
 *
 * 1. MONOCHROME, VIA `currentColor`. The real glazedweb mark is a pink donut with a green
 *    glaze drip, and dropped into a client's footer that is a foreign brand element sitting
 *    in their palette — Glazed pink at 14px in Chism's cream-on-barn-green bottom bar, or
 *    beside MI Gas's ember, reads as something that got pasted in. A single-colour glyph
 *    inheriting the footer's own text colour reads as a signature instead, which is what a
 *    credit is. The full-colour mark belongs on glazedweb.com, where it is the brand rather
 *    than a maker's mark.
 *
 * 2. NO SVG IDs, AND NOTHING TO IMPORT. glazedweb's `Mark` renders `<use href="#mark">` and
 *    needs `LogoDefs()` mounted somewhere, which brings a whole id namespace — `#mark`,
 *    `#pinkGrad`, `#lgGrad`, `#dripEdge` — into a repo that knows nothing about it. Two
 *    problems: it is two components to keep in sync instead of one, and duplicate SVG ids are
 *    undefined behaviour if the client site happens to use any of the same names. That
 *    collision class already cost this project a day — see the note in Sun.tsx about a filter
 *    id shared between two instances painting a dark square on the page. This draws its own
 *    paths inline and references nothing.
 *
 * 3. THE DRIP MOVES ON HOVER ONLY. A footer is the last thing before somebody leaves, and on
 *    Chism it holds the "Get in touch" button. An animated object down there competes with the
 *    one action on the page that matters, forever, on every page. On hover it rewards the
 *    person who noticed and costs nothing for everyone else. Under reduced motion the resting
 *    state is unchanged and the hover simply snaps rather than eases — there is no autoplay to
 *    suppress, which is the easiest kind of motion to make accessible.
 *
 * 4. DRAWN FOR 24px, NOT SCALED DOWN FROM A POSTER. The first version was the poster silhouette
 *    shrunk, and at footer size it read as a pin or a balloon: most of the height was drip, the
 *    hole closed up to four pixels, and the three drips were a pixel wide each. Rendering it at
 *    16 / 19 / 24 / 30 / 40 / 56px in a row is what showed it. Redrawn, the ring takes far more
 *    of the box, the hole is proportionally much larger than on the full mark, and there are two
 *    fatter drips instead of three thin ones. It reads as a dripping donut from 19px up. This is
 *    ordinary favicon practice and the lesson generalises: a mark for 24px is a different drawing
 *    from the same mark at 240px.
 *
 * 5. THE LINE IS A PROP WITH A PLAIN DEFAULT. "Double dipped by Glazed Web" is the studio's
 *    voice and it fits a family farm or a bakery. It does not fit a facility director selling
 *    SOPs to licensed commercial operators, where a donut joke in the footer reads as the
 *    studio talking about itself while the visitor is mid-decision. Pick per client; do not
 *    make the joke the default.
 *
 * REMOVING IT is deleting one line from the footer. Worth being able to say that to a client,
 * and worth actually asking them — a credit in someone else's footer is theirs to decline, and
 * it belongs in the contract rather than in a surprise.
 *
 * ON THE LINK: leave it followed. A designer credit is a genuine editorial link, and the anchor
 * text stays "Glazed Web" rather than anything keyword-shaped — a sitewide footer link with
 * "website design in Marshall Michigan" as its anchor is the version that looks like a scheme.
 */
export default function GlazedCredit({
  line = "Built by",
  className = "",
}: {
  /** The words before the name. See decision 5 above before reaching for the pun. */
  line?: string;
  className?: string;
}) {
  return (
    <a
      href="https://www.glazedweb.com"
      className={`gw-credit ${className}`}
      // A new tab, deliberately. This is the one link on the page whose job is to take the
      // visitor AWAY from the client, and doing that in their own tab is a small unkindness to
      // the person paying for the site. copperac and cookinwithbeans already did this; chism
      // and sprinklesandsparklesbb did not.
      target="_blank"
      // noopener for the usual reason. NOT nofollow: a designer credit is a real editorial
      // link, not a paid placement.
      rel="noopener noreferrer"
    >
      {line}{" "}
      <span className="gw-credit-name">Glazed&nbsp;Web</span>
      <svg
        className="gw-credit-mark"
        viewBox="0 0 20 24"
        aria-hidden="true"
        focusable="false"
        fill="currentColor"
      >
        {/* The ring. evenodd punches the hole, so it is one path and one colour. The hole is
            proportionally larger than on the full mark — at this size a scale-accurate hole
            closes to four pixels and the donut stops being a donut. */}
        <path
          fillRule="evenodd"
          d="M10 0.7a8.3 8.3 0 1 1 0 16.6 8.3 8.3 0 0 1 0-16.6Zm0 5.05a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z"
        />
        {/* Two fat drips rather than three thin ones, off-centre so it reads as glaze running
            rather than as a symmetrical ornament. They scale from their tops, so on hover they
            lengthen out of the ring instead of sliding away from it. */}
        <g className="gw-credit-drip">
          <path d="M8.4 14.6c-.2 3.3.1 5.7.5 7.2.2.9 1.4.9 1.6 0 .4-1.5.7-3.9.5-7.2Z" />
          <path d="M14.1 13c-.16 2.3.08 3.9.4 4.9.16.7 1.1.7 1.26 0 .32-1 .56-2.6.4-4.9Z" />
        </g>
      </svg>
    </a>
  );
}
