import { cn } from "@/lib/cn";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number whose digits roll in place when it changes, like a flap board updating one character at a time. Each digit
 * is a column of 0-9 translated to the current digit with a CSS transition, so a value that changes again mid-roll
 * retargets smoothly. The first render is static (the transform is simply set). Columns are keyed from the right, so
 * 9 → 10 adds a column instead of shifting every digit.
 *
 * Screen readers get the plain value once; the columns are hidden. Non-digit characters (":" "-" ",") are static.
 */
export function RollingNumber({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const text = String(value);
  const chars = [...text];
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          const d = DIGITS.indexOf(ch);
          if (d < 0) {
            return (
              <span key={`c${key}`} className="inline-block">
                {ch}
              </span>
            );
          }
          return (
            <span
              key={`d${key}`}
              className="relative inline-block h-[1em] overflow-hidden leading-none"
            >
              <span
                className="flex flex-col digit-roll"
                style={{ transform: `translateY(-${d}em)` }}
              >
                {DIGITS.map((n) => (
                  <span key={n} className="block h-[1em] leading-none">
                    {n}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
