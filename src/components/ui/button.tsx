import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex press items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none smooth-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-55 disabled:active:scale-100 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-bright text-accent-ink shadow-[0_1px_0_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-accent-bright-strong",
        ink: "bg-ink text-surface hover:opacity-90",
        secondary:
          "border border-line-strong bg-surface-raised text-ink shadow-[0_1px_0_rgb(15_27_51/0.04)] hover:border-ink-faint hover:bg-surface-sunken",
        ghost: "text-ink hover:bg-surface-sunken",
        danger: "bg-danger text-white hover:brightness-110 dark:text-black",
        link: "h-auto rounded-xs p-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm", // 44px touch target (tablet is the on-court device, §2.3)
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
