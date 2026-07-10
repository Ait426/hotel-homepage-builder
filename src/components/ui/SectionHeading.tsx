/**
 * Shared heading block so every section carries the same typographic
 * rhythm: small tracked eyebrow, serif display heading, muted subheading.
 */

export function SectionHeading({
  eyebrow,
  heading,
  subheading,
  align = "center",
}: {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  align?: "left" | "center";
}) {
  if (!eyebrow && !heading && !subheading) return null;
  const alignCls = align === "center" ? "text-center" : "text-left";
  return (
    <div className={`mb-10 sm:mb-14 ${alignCls}`}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-accent">
          {eyebrow}
        </p>
      ) : null}
      {heading ? (
        <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
          {heading}
        </h2>
      ) : null}
      {subheading ? (
        <p className="mx-auto mt-4 max-w-xl text-base text-ink-muted">
          {subheading}
        </p>
      ) : null}
    </div>
  );
}
