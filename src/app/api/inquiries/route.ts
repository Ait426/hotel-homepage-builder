import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/lib/data";
import { tenantDomainFromHost } from "@/lib/tenant/host";

/** POST /api/inquiries — guest → hotel inbox (thread + first message). */

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(5000),
  reservationCode: z.string().trim().max(40).optional(),
  locale: z.string().max(10).optional(),
});

export async function POST(req: NextRequest) {
  const domain = tenantDomainFromHost(req.headers.get("host"));
  const hotel = await getDataSource().getHotelByDomain(domain);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "hotel_not_found" }, { status: 404 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const { name, email, phone, subject, body, reservationCode, locale } = parsed.data;
  const result = await getDataSource().createInquiry(hotel.id, {
    guest: { name, email, phone, locale },
    subject,
    body,
    reservationCode,
  });

  if (!result.ok) {
    // invalid_input is the client's fault (400); unknown is a server/DB
    // fault (500) — don't report an internal failure as a bad request.
    const status = result.error === "unknown" ? 500 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result, { status: 201 });
}
