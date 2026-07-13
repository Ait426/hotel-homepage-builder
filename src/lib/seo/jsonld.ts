/**
 * schema.org structured data — Hotel on the home page, HotelRoom on room
 * detail pages. Emitted as <script type="application/ld+json"> by pages.
 */

import type { Hotel, RatePlan, RoomType } from "@/lib/data/types";
import { pickLocalized } from "@/lib/i18n/locales";
import { hotelOrigin } from "@/lib/tenant/resolve";

const SCHEMA_TYPE: Record<Hotel["propertyType"], string> = {
  hotel: "Hotel",
  motel: "Motel",
  resort: "Resort",
  pension: "LodgingBusiness",
  guesthouse: "BedAndBreakfast",
};

export function hotelJsonLd(hotel: Hotel, locale: string): object {
  const origin = hotelOrigin(hotel);
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[hotel.propertyType] ?? "Hotel",
    name: pickLocalized(hotel.name, locale, hotel.defaultLocale),
    description: pickLocalized(hotel.seo.description, locale, hotel.defaultLocale),
    url: origin,
    ...(hotel.seo.ogImage ? { image: hotel.seo.ogImage } : {}),
    ...(hotel.contact.phone ? { telephone: hotel.contact.phone } : {}),
    ...(hotel.contact.email ? { email: hotel.contact.email } : {}),
    ...(hotel.contact.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: pickLocalized(
              hotel.contact.address,
              locale,
              hotel.defaultLocale,
            ),
          },
        }
      : {}),
    ...(hotel.contact.geo
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: hotel.contact.geo.lat,
            longitude: hotel.contact.geo.lng,
          },
        }
      : {}),
    ...(hotel.contact.checkIn ? { checkinTime: hotel.contact.checkIn } : {}),
    ...(hotel.contact.checkOut ? { checkoutTime: hotel.contact.checkOut } : {}),
  };
}

export function roomJsonLd(
  hotel: Hotel,
  room: RoomType,
  plans: RatePlan[],
  locale: string,
): object {
  const origin = hotelOrigin(hotel);
  const content = pickLocalized(room.content, locale, hotel.defaultLocale);
  const minPrice = plans.length
    ? Math.min(...plans.map((p) => p.basePrice))
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "HotelRoom",
    name: content?.name,
    description: content?.description,
    url: `${origin}/${locale}/rooms/${room.slug}`,
    ...(room.images[0] ? { image: room.images[0].url } : {}),
    ...(room.sizeSqm
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: room.sizeSqm,
            unitCode: "MTK",
          },
        }
      : {}),
    occupancy: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: room.occupancyMax,
    },
    containedInPlace: {
      "@type": "Hotel",
      name: pickLocalized(hotel.name, locale, hotel.defaultLocale),
      url: origin,
    },
    ...(minPrice !== undefined
      ? {
          offers: {
            "@type": "Offer",
            price: minPrice,
            priceCurrency: hotel.currency,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };
}

/** Serialize for a <script type="application/ld+json"> tag. */
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
