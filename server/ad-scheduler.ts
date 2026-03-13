import { supabase } from "./supabase";

interface ApprovedAd {
  id: string;
  advert: {
    id: string;
    title: string;
    file_url: string;
    duration_seconds: number | null;
  };
  frequency: string;
}

// Track last play time per advert per channel
const lastPlayed = new Map<string, number>(); // key: `${slug}:${advertId}`

/**
 * Get approved ads for a broadcaster channel
 */
export async function getApprovedAdsForChannel(broadcasterId: string): Promise<ApprovedAd[]> {
  const { data, error } = await supabase
    .from("ad_requests")
    .select(`
      id, frequency,
      advert:adverts(id, title, file_url, duration_seconds)
    `)
    .eq("broadcaster_id", broadcasterId)
    .eq("status", "approved");

  if (error || !data) return [];
  return data as unknown as ApprovedAd[];
}

/**
 * Determine if an ad should play based on its frequency setting
 */
export function shouldPlayAd(slug: string, ad: ApprovedAd): boolean {
  const key = `${slug}:${ad.advert.id}`;
  const last = lastPlayed.get(key);
  if (!last) return true;

  const elapsed = Date.now() - last;

  switch (ad.frequency) {
    case "every-track":
      return true;
    case "every-15min":
      return elapsed > 15 * 60 * 1000;
    case "every-30min":
      return elapsed > 30 * 60 * 1000;
    case "hourly":
    default:
      return elapsed > 60 * 60 * 1000;
  }
}

/**
 * Mark an ad as played
 */
export function markAdPlayed(slug: string, advertId: string) {
  lastPlayed.set(`${slug}:${advertId}`, Date.now());
}

/**
 * Get the next ad to play for a channel (if any are due)
 */
export async function getNextAdForChannel(
  broadcasterId: string,
  slug: string
): Promise<ApprovedAd | null> {
  const ads = await getApprovedAdsForChannel(broadcasterId);

  for (const ad of ads) {
    if (shouldPlayAd(slug, ad)) {
      return ad;
    }
  }

  return null;
}
