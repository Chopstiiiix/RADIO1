import fs from "fs";
import path from "path";
import { supabase } from "./supabase";

/**
 * Downloads active tracks from Supabase Storage to a local directory
 * for a given broadcaster channel.
 */
export async function syncTracksForChannel(
  broadcasterId: string,
  slug: string,
  musicDir: string,
  trackIds?: string[]
): Promise<void> {
  console.log(`🔄 [${slug}] Syncing tracks from Supabase...${trackIds ? ` (${trackIds.length} selected)` : ""}`);

  // Get tracks from database — filter by selected IDs if provided
  let query = supabase
    .from("tracks")
    .select("id, title, primary_artist, file_url")
    .eq("broadcaster_id", broadcasterId)
    .eq("is_active", true);

  if (trackIds && trackIds.length > 0) {
    query = query.in("id", trackIds);
  }

  const { data: tracks, error } = await query.order("uploaded_at", { ascending: true });

  if (error) {
    console.error(`[${slug}] Error fetching tracks:`, error.message);
    return;
  }

  if (!tracks?.length) {
    console.log(`[${slug}] No active tracks found`);
    return;
  }

  fs.mkdirSync(musicDir, { recursive: true });

  // Get existing local files
  const existingFiles = new Set(
    fs.existsSync(musicDir) ? fs.readdirSync(musicDir) : []
  );

  let downloaded = 0;

  for (const track of tracks) {
    // Skip local files — they're already on disk
    if (track.file_url.startsWith("local://")) {
      console.log(`[${slug}] Skipping local track: ${track.title}`);
      continue;
    }

    // Create a safe filename: "Artist - Title.ext"
    const ext = path.extname(new URL(track.file_url).pathname) || ".mp3";
    const safeName = `${track.primary_artist} - ${track.title}`
      .replace(/[^a-zA-Z0-9\s\-_.]/g, "")
      .trim();
    const filename = `${safeName}${ext}`;
    const localPath = path.join(musicDir, filename);

    if (existingFiles.has(filename)) {
      continue; // Already downloaded
    }

    try {
      // Extract storage path from URL
      const url = new URL(track.file_url);
      const storagePath = url.pathname.split("/object/public/tracks/")[1];

      if (storagePath) {
        const { data, error: dlError } = await supabase.storage
          .from("tracks")
          .download(storagePath);

        if (dlError || !data) {
          console.error(`[${slug}] Failed to download ${filename}:`, dlError?.message);
          continue;
        }

        const buffer = Buffer.from(await data.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        downloaded++;
      } else {
        // Direct URL fetch fallback
        const response = await fetch(track.file_url);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(localPath, buffer);
          downloaded++;
        }
      }
    } catch (err) {
      console.error(`[${slug}] Error downloading ${filename}:`, err);
    }
  }

  console.log(`✅ [${slug}] Synced ${downloaded} new tracks (${tracks.length} total active)`);
}
