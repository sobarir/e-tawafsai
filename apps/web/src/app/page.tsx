import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { TrustBar } from "@/components/landing/trust-bar";
import { FeaturedPackages } from "@/components/landing/featured-packages";
import { WhyChooseUs } from "@/components/landing/why-choose-us";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <TrustBar />
        <FeaturedPackages />
        <WhyChooseUs />
      </main>
      <Footer />
    </>
  );
}
