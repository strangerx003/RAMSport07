import * as React from "react";
import { Slot } from "radix-ui";
import { Ellipsis } from "lucide-react";

/**
 * shadcn-style breadcrumb built on the project's Radix stack.
 * The project ships without Tailwind, so structure is exposed through
 * data-slot attributes and the styling lives in professional.css.
 */

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" aria-label="breadcrumb" className={className} {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="breadcrumb-list" className={className} {...props} />;
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="breadcrumb-item" className={className} {...props} />;
}

type BreadcrumbLinkProps = React.ComponentProps<"a"> & {
  /** Renders the child element (a Next.js `Link`, for example) instead of an anchor. */
  asChild?: boolean;
};

function BreadcrumbLink({ asChild, className, ...props }: BreadcrumbLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return <Comp data-slot="breadcrumb-link" className={className} {...props} />;
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="breadcrumb-page" aria-current="page" className={className} {...props} />;
}

function BreadcrumbSeparator({ children = "/", className, ...props }: React.ComponentProps<"li">) {
  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={className} {...props}>
      {children}
    </li>
  );
}

/** Collapsed crumb that opens an overflow menu of the hidden locations. */
function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="breadcrumb-ellipsis" className={className} {...props}>
      <Ellipsis aria-hidden="true" />
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
