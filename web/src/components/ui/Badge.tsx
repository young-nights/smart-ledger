import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClass: Record<Variant, string> = {
  default: "badge badge-info",
  success: "badge badge-success",
  warning: "badge badge-warning",
  danger: "badge badge-danger",
  info: "badge badge-info",
};

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span className={`${variantClass[variant]} ${className}`}>{children}</span>
  );
}
