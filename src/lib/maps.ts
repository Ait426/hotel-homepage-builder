/**
 * Map-embed URL guard for the Location section's <iframe src>.
 *
 * mapEmbedUrl is tenant-editable section content. https-only already blocks
 * javascript: URLs, but an https iframe pointing at an arbitrary host can
 * still frame anything (phishing overlays, tracker beacons, a clickjacking
 * surface with allow-same-origin). Restrict the src to known consumer map
 * providers' embed hosts — that is the only thing this iframe is for.
 */

const MAP_EMBED_HOSTS: RegExp[] = [
  // Google Maps embed — google.com plus its ccTLDs (google.co.kr, google.de …)
  /^(www\.|maps\.)?google\.(com|[a-z]{2}|com?\.[a-z]{2})$/,
  // Naver / Kakao (Korean market)
  /^(map|maps)\.naver\.com$/,
  /^(www\.)?naver\.me$/,
  /^map\.kakao\.com$/,
  /^place\.map\.kakao\.com$/,
  // OpenStreetMap / Apple
  /^(www\.)?openstreetmap\.org$/,
  /^maps\.apple\.com$/,
];

/**
 * true when src is an https URL on a whitelisted map-provider host. Anything
 * else — non-https, unparseable, or an unknown host — is rejected.
 */
export function isAllowedMapEmbed(src: string | undefined | null): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return MAP_EMBED_HOSTS.some((re) => re.test(host));
}
