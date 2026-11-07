import { cn } from "@/lib/cn";

/**
 * A number whose digits roll in place when it changes, like a flap board updating one character at a time. Each digit
 * is a CSS-generated 0-9 strip translated to the current digit with a transition, so a value that changes again
 * mid-roll retargets smoothly. The first render is static (the transform is simply set). Columns are keyed from the
 * right, so 9 → 10 adds a column instead of shifting every digit.
 *
 * The element's TEXT is exactly the value (a visually hidden copy); the strips are generated content, invisible to
 * screen readers, copy and paste, and text assertions.
 */
export function RollingNumber({
  value,
  className,
  ...rest
}: {
  value: number | string;
  className?: string;
} & Omit<React.ComponentProps<"span">, "children">) {
  const text = String(value);
  const chars = [...text];
  return (
    <span className={cn("relative inline-flex tabular-nums", className)} {...rest}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          const d = "0123456789".indexOf(ch);
          if (d < 0) {
            return (
              <span
                key={`c${key}`}
                className="inline-block before:content-[attr(data-char)]"
                data-char={ch}
              />
            );
          }
          return (
            <span
              key={`d${key}`}
              className="relative inline-block h-[1em] overflow-hidden leading-none"
            >
              <span
                className="digit-strip digit-roll"
                style={{ transform: `translateY(-${d}em)` }}
              />
            </span>
          );
        })}
      </span>
    </span>
  );
}
