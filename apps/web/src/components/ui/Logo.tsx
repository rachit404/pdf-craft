import { LIVE_COLOURS, logoSvg } from "@/lib/logo";
import { cn } from "@/lib/utils";

const MARKUP = logoSvg(LIVE_COLOURS, "pc-logo-live");

/** The PDF Craft mark, painted in the colours of the active theme. */
export default function Logo({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-7 shrink-0", className)} dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
