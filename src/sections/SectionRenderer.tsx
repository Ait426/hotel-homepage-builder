import type { SectionInstance } from "@/lib/data/types";
import { SECTION_REGISTRY } from "./registry";
import type { SectionContext } from "./types";

/**
 * Renders a page's section array. Fail-soft by design: an unknown type,
 * unknown version or invalid props skips that section (with a server log)
 * instead of taking the whole page down — content mistakes must never 500
 * a tenant's site.
 */
export function SectionRenderer({
  sections,
  ctx,
}: {
  sections: SectionInstance[];
  ctx: SectionContext;
}) {
  return (
    <>
      {sections.map((section) => {
        const entry = SECTION_REGISTRY[section.type]?.[section.version];
        if (!entry) {
          console.warn(
            `[sections] unknown section "${section.type}" v${section.version} (id=${section.id}, hotel=${ctx.hotel.slug}) — skipped`,
          );
          return null;
        }
        const parsed = entry.schema.safeParse(section.props);
        if (!parsed.success) {
          console.warn(
            `[sections] invalid props for "${section.type}" v${section.version} (id=${section.id}, hotel=${ctx.hotel.slug}) — skipped:`,
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          );
          return null;
        }
        const Component = entry.Component;
        return <Component key={section.id} ctx={ctx} props={parsed.data} />;
      })}
    </>
  );
}
