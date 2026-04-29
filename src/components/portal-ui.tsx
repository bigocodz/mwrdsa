import { CalendarDays, Filter, Grid2X2, List, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PageStat = {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
  trendTone?: "positive" | "negative" | "neutral";
};

const trendToneClasses = {
  positive: "bg-primary/10 text-primary",
  negative: "bg-mwrd-red/10 text-mwrd-red",
  neutral: "bg-muted text-muted-foreground"
};

export function StatStrip({ stats, columns = 4 }: { stats: PageStat[]; columns?: 3 | 4 }) {
  return (
    <section
      className={cn(
        "grid overflow-hidden rounded-lg border border-dashed border-border/80 bg-card",
        columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"
      )}
    >
      {stats.map((stat, index) => (
        <div key={`${stat.label}-${index}`} className="flex min-h-28 flex-col justify-center gap-2 border-b border-border/70 p-5 last:border-b-0 md:border-b-0 md:border-e md:last:border-e-0">
          <p className="text-sm font-semibold text-muted-foreground">{stat.label}</p>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-semibold leading-none tracking-normal">{stat.value}</p>
            {stat.trend ? <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", trendToneClasses[stat.trendTone ?? "neutral"])}>{stat.trend}</span> : null}
          </div>
          {stat.detail ? <p className="text-sm text-muted-foreground">{stat.detail}</p> : null}
        </div>
      ))}
    </section>
  );
}

export function DashboardCard({
  title,
  description,
  action,
  children,
  className
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden bg-card", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className="p-5 pt-0">{children}</CardContent>
    </Card>
  );
}

export function DashboardToolbar({
  searchPlaceholder,
  filterLabel = "Filter",
  gridLabel = "Grid view",
  listLabel = "List view",
  children
}: {
  searchPlaceholder: string;
  filterLabel?: string;
  gridLabel?: string;
  listLabel?: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 shadow-card">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder={searchPlaceholder} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button type="button" variant="outline" aria-label={gridLabel}>
          <Grid2X2 className="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" aria-label={listLabel}>
          <List className="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline">
          <Filter className="size-4" aria-hidden="true" />
          {filterLabel}
        </Button>
      </div>
    </section>
  );
}

export function DateRangeButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="outline">
      <CalendarDays className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

export function SparkBars({ values, tone = "primary" }: { values: number[]; tone?: "primary" | "cyan" | "sun" }) {
  const toneClass = {
    primary: "bg-primary",
    cyan: "bg-mwrd-frosted",
    sun: "bg-mwrd-sun"
  }[tone];

  return (
    <div className="flex h-28 items-end gap-2 border-y border-border/70 py-3">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} className={cn("w-full rounded-t-md", toneClass)} style={{ height: `${Math.max(value, 12)}%` }} />
      ))}
    </div>
  );
}

export function SegmentedProgress({
  segments
}: {
  segments: Array<{
    label: string;
    value: string;
    className: string;
    width: string;
  }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <span key={segment.label} className={segment.className} style={{ width: segment.width }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", segment.className)} />
            {segment.label} {segment.value}
          </span>
        ))}
      </div>
    </div>
  );
}

export type DataColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey
}: {
  columns: DataColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-muted/55 text-muted-foreground">
              {columns.map((column) => (
                <th key={column.header} className={cn("px-4 py-3 text-start font-semibold", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="transition-colors hover:bg-accent/55">
                {columns.map((column) => (
                  <td key={column.header} className={cn("px-4 py-4 align-middle", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "info" | "warning" | "danger" }) {
  const variant = tone === "info" ? "info" : tone === "warning" ? "warning" : tone === "danger" ? "danger" : "outline";

  return <Badge variant={variant}>{children}</Badge>;
}
