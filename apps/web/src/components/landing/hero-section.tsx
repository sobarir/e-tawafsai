import Image from "next/image";

export function HeroSection() {
  return (
    <section
      id="beranda"
      className="relative flex min-h-[90vh] items-center justify-center overflow-hidden"
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero-kaaba.png"
          alt="Masjid al-Haram, Makkah"
          fill
          className="object-cover"
          priority
          quality={90}
        />
        {/* Gradient overlay — darkens for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        {/* Gold accent label */}
        <div className="rise mb-6 inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
          <span className="text-xs font-medium tracking-wider text-gold-200 uppercase">
            Platform Umrah Terpercaya
          </span>
        </div>

        {/* Headline */}
        <h1 className="rise rise-delay-1 font-display text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          Wujudkan Ibadah{" "}
          <span className="gold-shimmer">Umrah</span>{" "}
          Impian Anda
        </h1>

        {/* Subheadline */}
        <p className="rise rise-delay-2 mx-auto mt-6 max-w-2xl text-base text-white/75 sm:text-lg md:text-xl">
          Paket umrah terlengkap dengan hotel bintang 5, pesawat terbaik,
          dan bimbingan ibadah dari pembimbing berpengalaman.
        </p>

        {/* CTAs */}
        <div className="rise rise-delay-3 mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#paket"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground shadow-lg shadow-gold-600/20 transition-all hover:bg-gold-700 hover:shadow-xl hover:shadow-gold-600/30 cursor-pointer"
          >
            Lihat Paket Umrah
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
              />
            </svg>
          </a>
          <a
            href="#keunggulan"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 cursor-pointer"
          >
            Tentang Kami
          </a>
        </div>
      </div>

      {/* Bottom fade to page background */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
