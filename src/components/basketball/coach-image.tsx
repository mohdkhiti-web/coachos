import Image from "next/image";
import { IMAGERY, type ImageSlot } from "./imagery";
import { cn } from "@/lib/cn";
import { CoachScene } from "./scenes";

/**
 * A slot from the imagery config: the photograph when one is configured (responsive, lazy, through next/image),
 * otherwise the illustrated scene. Photographs get their real alt text; illustrations are decorative.
 */
export function CoachImage({
  slot,
  className,
  priority = false,
  sizes = "(min-width: 1024px) 28rem, 90vw",
}: {
  slot: ImageSlot;
  className?: string;
  /** Above-the-fold photographs only. */
  priority?: boolean;
  sizes?: string;
}) {
  const spec = IMAGERY[slot];
  if (spec.src && spec.width && spec.height) {
    return (
      <Image
        src={spec.src}
        alt={spec.alt}
        width={spec.width}
        height={spec.height}
        sizes={sizes}
        priority={priority}
        className={cn("h-auto w-full rounded-lg object-cover", className)}
      />
    );
  }
  return <CoachScene scene={spec.scene} className={className} />;
}
