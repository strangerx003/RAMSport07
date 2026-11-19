import * as React from "react";

/**
 * shadcn-style empty state (No Projects Yet, no recent files, ?).
 * The project ships without Tailwind, so structure is exposed through
 * data-slot attributes and the styling lives in professional.css.
 */

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty" className={className} {...props} />;
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={className} {...props} />;
}

type EmptyMediaProps = React.ComponentProps<"div"> & {
  variant?: "default" | "icon";
};

function EmptyMedia({ variant = "default", className, ...props }: EmptyMediaProps) {
  return <div data-slot="empty-media" data-variant={variant} className={className} {...props} />;
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="empty-title" className={className} {...props} />;
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="empty-description" className={className} {...props} />;
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-content" className={className} {...props} />;
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
