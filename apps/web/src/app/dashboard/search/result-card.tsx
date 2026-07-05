"use client";

import type { SearchResultDto } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ResultCard({
  dto,
  onCopySummary,
  onCopyLink,
}: {
  dto: SearchResultDto;
  onCopySummary: (dto: SearchResultDto) => void;
  onCopyLink: (dto: SearchResultDto) => void;
}) {
  const date = new Date(dto.nextDepartureDate).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight">{dto.title}</h3>
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            {dto.seatsLeft} kursi
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {dto.providerBrandName} · {dto.airline ?? "-"}
        </p>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Mulai · {date}
          </span>
          <span className="text-sm font-semibold">
            Rp {dto.priceFrom.toLocaleString("id-ID")}
          </span>
        </div>
        <ul className="space-y-0.5 text-xs">
          {dto.hotels.map((h, i) => (
            <li key={i} className="flex justify-between">
              <span>
                {h.cityName}: {h.name}
              </span>
              <span className="font-mono text-muted-foreground">
                {h.distanceM !== null ? `${h.distanceM} m` : "-"}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="default" className="flex-1" onClick={() => onCopySummary(dto)}>
            Salin ringkasan
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onCopyLink(dto)}>
            Salin tautan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
