import type { PublicPackageCardDto } from "@cometkit/shared";

/** Format price as Indonesian Rupiah */
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Build WhatsApp deep link with pre-filled message */
function buildWhatsAppUrl(
  phone: string,
  packageName: string,
  price: number | null,
): string {
  const priceSuffix = price != null ? ` - ${formatRupiah(price)}` : "";
  const text = encodeURIComponent(
    `Assalamu'alaikum, saya tertarik dengan paket Umrah ${packageName}${priceSuffix}`,
  );
  const cleanPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}?text=${text}`;
}

/** Render star icons for hotel rating */
function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-0.5 text-gold-500">
      {Array.from({ length: count }, (_, i) => (
        <svg
          key={i}
          className="h-3 w-3"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

interface PackageCardProps {
  result: PublicPackageCardDto;
  whatsappPhone?: string;
  /** Inclusions/exclusions come from the full PackageDto, not search results.
   *  When available, pass them through. */
  inclusions?: { inclusionId: string; name: string }[];
  exclusions?: { exclusionId: string; name: string }[];
}

export function PackageCard({
  result,
  whatsappPhone,
  inclusions,
  exclusions,
}: PackageCardProps) {
  const waUrl = whatsappPhone
    ? buildWhatsAppUrl(whatsappPhone, result.title, result.startingPriceIdr)
    : "#";

  return (
    <div className="card-luxury flex flex-col overflow-hidden">
      {/* Top accent stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600" />

      <div className="flex flex-1 flex-col p-6">
        {/* Category badge + seats */}
        <div className="flex items-center justify-between gap-2">
          {result.category ? (
            <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-700 uppercase tracking-wider">
              {result.category}
            </span>
          ) : (
            <span />
          )}
          {result.seatsAvailable > 0 && (
            <span className="text-xs font-medium text-accent">
              {result.seatsAvailable} kursi tersisa
            </span>
          )}
        </div>

        {/* Package name */}
        <h3 className="mt-3 font-display text-lg font-semibold text-foreground leading-snug">
          {result.title}
        </h3>

        {/* Hotels */}
        {result.hotels.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {result.hotels.map((hotel, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-sm"
              >
                <Stars count={hotel.stars} />
                <div>
                  <span className="font-medium text-foreground">
                    {hotel.name}
                  </span>
                  <span className="text-muted-foreground">
                    , {hotel.cityName}
                  </span>
                  {hotel.distanceM != null && (
                    <span className="ml-1 text-xs text-accent font-medium">
                      — {hotel.distanceM >= 1000
                        ? `${(hotel.distanceM / 1000).toFixed(1)}km`
                        : `${hotel.distanceM}m`}{" "}
                      ke Haram
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Airline + departure */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {result.airline && (
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
              {result.airline}
            </span>
          )}
          {result.nearestDepartureDate && (
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              {new Date(result.nearestDepartureDate).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        {/* Inclusions */}
        {inclusions && inclusions.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wider mb-1.5">
              Termasuk
            </div>
            <div className="flex flex-wrap gap-1.5">
              {inclusions.map((inc) => (
                <span
                  key={inc.inclusionId}
                  className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-700 border border-green-100"
                >
                  {inc.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Exclusions */}
        {exclusions && exclusions.length > 0 && (
          <div className="mt-2.5">
            <div className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
              Tidak Termasuk
            </div>
            <div className="flex flex-wrap gap-1.5">
              {exclusions.map((exc) => (
                <span
                  key={exc.exclusionId}
                  className="inline-flex items-center rounded-full bg-stone-50 px-2.5 py-0.5 text-[11px] font-medium text-stone-500 border border-stone-200"
                >
                  {exc.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Price + CTA */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Mulai dari</div>
              <div className="font-display text-2xl font-bold text-foreground">
                {result.startingPriceIdr != null
                  ? formatRupiah(result.startingPriceIdr)
                  : "Hubungi kami"}
              </div>
              {result.startingPriceIdr != null && (
                <div className="text-[10px] text-muted-foreground">
                  /orang
                </div>
              )}
            </div>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md cursor-pointer"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
