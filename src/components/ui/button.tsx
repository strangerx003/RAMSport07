import * as React from "react";
import { Slot } from "radix-ui";

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon" | "icon-sm";

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders the child element (a Next.js `Link`, for example) instead of a button. */
  asChild?: boolean;
};

/**
 * Shared shadcn-style action button. This project ships without Tailwind, so
 * instead of utility classes the variant and size are exposed as data
 * attributes and styled by the `[data-slot="button"]` rules in professional.css.
 */
function Button({
  asChild = false,
  variant = "default",
  size = "default",
  className,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const nativeType = asChild ? {} : { type: type ?? "button" };
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      {...nativeType}
      className={className}
      {...props}
    />
  );
}

export { Button };

/**
 * Legacy helper kept for the archived reference components under
 * documentation/: returns inert marker classes for a variant/size pair.
 * Live code should render `<Button>` instead of attaching these by hand.
 */
export function buttonVariants({ variant = "default", size = "default", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return [`button-variant-${variant}`, `button-size-${size}`, className].filter(Boolean).join(" ");
}
