import React from "react";
import Link from "next/link";

export interface MetricCardProps {
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  suffix?: React.ReactNode;
  subtext?: React.ReactNode;
  href?: string;
  valueClassName?: string;
  className?: string;
  size?: "sm" | "md"; // "sm" = p-3 (dense 6-column grid); "md" = p-4 (4-column summary KPI bar)
  variant?: "surface" | "raised"; // "surface" = standard bg-surface; "raised" = nested well bg-raised/40 per DESIGN.md
  children?: React.ReactNode; // For custom slots (e.g. status badges)
  ariaLabel?: string;
}

export interface MetricGridProps {
  children?: React.ReactNode;
  columns?: 3 | 4 | 6; // 3 = 3-column grouped metrics; 4 = 4-column summary KPI bar; 6 = dense 6-column grid
  ariaLabel?: string;
  className?: string;
}

export function MetricGrid({
  children,
  columns = 4,
  ariaLabel,
  className = "",
}: MetricGridProps) {
  const colClass =
    columns === 6
      ? "grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
      : columns === 3
        ? "grid-cols-1 gap-2.5 sm:grid-cols-3"
        : "grid-cols-2 gap-3 sm:grid-cols-4";

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={`grid ${colClass} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  suffix,
  subtext,
  href,
  valueClassName = "text-ink",
  className = "",
  size = "md",
  variant = "surface",
  children,
  ariaLabel,
}: MetricCardProps) {
  const isSm = size === "sm";
  const paddingClass = isSm ? "p-3" : "p-4";
  const valueSizeClass = isSm ? "text-xl font-semibold" : "text-2xl sm:text-3xl font-semibold";
  const mtClass = isSm ? "mt-1" : "mt-2";
  const isRaised = variant === "raised";
  const bgClass = isRaised ? "bg-raised/40" : "bg-surface";
  const hoverBgClass = isRaised ? "hover:bg-raised/60" : "hover:bg-raised";

  const content = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon && (
          <span className="shrink-0 text-muted" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>

      {children ? (
        <div className={mtClass}>{children}</div>
      ) : (
        <div className={`${mtClass} flex items-baseline gap-1`}>
          {value !== undefined && (
            <span
              className={`tabular-nums leading-none ${valueSizeClass} ${valueClassName}`.trim()}
            >
              {value}
            </span>
          )}
          {suffix && (
            <span className="text-xs sm:text-sm font-normal text-muted truncate">
              {suffix}
            </span>
          )}
        </div>
      )}

      {subtext && (
        <p className="mt-1 text-xs text-faint truncate">{subtext}</p>
      )}
    </>
  );

  const baseClasses = `flex flex-col justify-between rounded-md border border-line ${bgClass} transition-colors ${paddingClass} ${className}`.trim();

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={`${baseClasses} ${hoverBgClass} hover:border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={baseClasses} aria-label={ariaLabel}>
      {content}
    </div>
  );
}
