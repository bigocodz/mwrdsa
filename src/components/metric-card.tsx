import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  title: string;
  value: string;
  detail: string;
  icon?: ReactNode;
  tone?: "orange" | "cyan" | "stone" | "red";
};

const toneClasses = {
  orange: "bg-primary/10 text-primary",
  cyan: "bg-mwrd-cyan/65 text-mwrd-black",
  stone: "bg-mwrd-stone/25 text-mwrd-black",
  red: "bg-mwrd-red/10 text-mwrd-red"
};

export function MetricCard({ title, value, detail, icon, tone = "orange" }: MetricCardProps) {
  return (
    <Card className="overflow-hidden bg-card/95">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{title}</CardTitle>
        {icon ? <span className={cn("grid h-8 w-8 place-items-center rounded-md", toneClasses[tone])}>{icon}</span> : null}
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-3xl font-semibold tracking-normal text-foreground">{value}</p>
        <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
