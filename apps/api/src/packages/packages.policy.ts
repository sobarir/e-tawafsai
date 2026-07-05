import { type PackageDto } from "@cometkit/shared";

export class PackagesPolicy {
  /**
   * Pure function validating if a package is complete enough to be published.
   * Returns list of field-level errors, or empty array if valid.
   */
  static validatePublishReady(pkg: PackageDto, providerActive: boolean, providerPpiuLicense: string | null): string[] {
    const errors: string[] = [];

    if (!pkg.durationDays) {
      errors.push("durationDays");
    }
    if (!pkg.airline) {
      errors.push("airline");
    }
    if (!pkg.departureCity) {
      errors.push("departureCity");
    }
    if (!pkg.category) {
      errors.push("category");
    }

    const hasMakkahHotel = pkg.hotels.some(
      (h) => h.cityName.toLowerCase() === "makkah" && h.name && h.stars
    );
    if (!hasMakkahHotel) {
      errors.push("hotels (Makkah)");
    }

    if (!providerActive) {
      errors.push("provider (Inactive)");
    }

    if (pkg.productType === "umrah" && !providerPpiuLicense) {
      errors.push("provider (PPIU License Required)");
    }

    return errors;
  }
}
