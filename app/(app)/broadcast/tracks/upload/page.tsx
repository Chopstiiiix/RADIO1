"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Lottie from "lottie-react";
import loadingAnimation from "@/public/loadingV3.json";
import checkmarkAnimation from "@/public/checkmark.json";

export default function UploadTrackPage() {
  const supabase = createClient();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [primaryArtist, setPrimaryArtist] = useState("");
  const [featuredArtists, setFeaturedArtists] = useState("");
  const [producer, setProducer] = useState("");
  const [recordLabel, setRecordLabel] = useState("");
  const [dateRecorded, setDateRecorded] = useState("");
  const [sampledMusic, setSampledMusic] = useState("");
  const [genre, setGenre] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Select an audio file");

    setUploading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upload file to Supabase Storage
    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("tracks")
      .upload(filePath, file);

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("tracks").getPublicUrl(filePath);

    // Get duration from audio file
    let duration: number | null = null;
    try {
      const audio = new Audio(URL.createObjectURL(file));
      duration = await new Promise<number>((resolve) => {
        audio.addEventListener("loadedmetadata", () => resolve(audio.duration));
        audio.addEventListener("error", () => resolve(0));
      });
    } catch { /* ignore */ }

    const featArtists = featuredArtists.split(",").map((a) => a.trim()).filter(Boolean);
    const genreArr = genre.split(",").map((g) => g.trim()).filter(Boolean);

    const { error: insertError } = await supabase.from("tracks").insert({
      broadcaster_id: user.id,
      title,
      primary_artist: primaryArtist,
      featured_artists: featArtists.length ? featArtists : null,
      producer: producer || null,
      record_label: recordLabel || null,
      date_recorded: dateRecorded || null,
      sampled_music: sampledMusic || null,
      genre: genreArr.length ? genreArr : null,
      duration_seconds: duration,
      file_url: urlData.publicUrl,
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    setTimeout(() => router.push("/broadcast/tracks"), 2000);
  }

  return (
    <div style={{ maxWidth: "500px" }}>
      <style>{`
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .cursor-blink {
          animation: pulse-opacity 1s step-end infinite;
        }
      `}</style>
      <p style={{
        fontSize: "12px",
        letterSpacing: "0.05em",
        color: "#f59e0b",
        fontFamily: "var(--font-mono)",
        marginBottom: "8px",
      }}>
        {">"} upload_track --new
        <span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </p>
      <h1 style={{
        fontSize: "24px",
        fontWeight: 700,
        marginBottom: "24px",
        textTransform: "uppercase",
        letterSpacing: "-0.05em",
      }}>
        Upload Track<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      <form onSubmit={handleUpload} style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        borderLeft: "3px solid #f59e0b",
        paddingLeft: "16px",
      }}>
        {/* Audio file */}
        <div>
          <label style={labelStyle}>Audio File</label>
          <input
            type="file"
            accept=".mp3,.flac,.wav,.m4a,.ogg"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            style={{ fontSize: "13px", color: "#a1a1aa" }}
          />
        </div>

        <Field label="Title" value={title} onChange={setTitle} required />
        <Field label="Primary Artist" value={primaryArtist} onChange={setPrimaryArtist} required />
        <Field label="Featured Artists" value={featuredArtists} onChange={setFeaturedArtists} placeholder="Artist1, Artist2" />
        <Field label="Producer" value={producer} onChange={setProducer} />
        <Field label="Record Label" value={recordLabel} onChange={setRecordLabel} />
        <Field label="Release Date" value={dateRecorded} onChange={setDateRecorded} type="date" />
        <Field label="Sampled Music" value={sampledMusic} onChange={setSampledMusic} placeholder="Original song / artist" />
        <Field label="Genre" value={genre} onChange={setGenre} placeholder="hip-hop, r&b" />

        {error && <p style={{ color: "#E24A4A", fontSize: "11px", textTransform: "uppercase" }}>{error}</p>}

        <button type="submit" disabled={uploading} style={{
          padding: "14px",
          backgroundColor: "#f59e0b",
          color: "#0a0a0a",
          border: "none",
          borderRadius: "0px",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.6 : 1,
        }}>
          {uploading ? "Uploading..." : "Upload Track"}
        </button>
      </form>

      {/* Lottie upload overlay */}
      {uploading && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(10, 10, 10, 0.92)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
        }}>
          <Lottie
            animationData={loadingAnimation}
            loop
            style={{ width: 120, height: 120 }}
          />
          <div style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#f59e0b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            UPLOADING TRACK...
          </div>
          <div style={{
            fontSize: "10px",
            color: "#52525b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            DO NOT CLOSE THIS PAGE
          </div>
        </div>
      )}

      {/* Success checkmark overlay */}
      {success && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(10, 10, 10, 0.92)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
        }}>
          <Lottie
            animationData={checkmarkAnimation}
            loop={false}
            style={{ width: 120, height: 120 }}
          />
          <div style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#f59e0b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            UPLOAD COMPLETE
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#52525b",
  marginBottom: "6px",
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

function Field({ label, value, onChange, placeholder, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "rgba(24, 24, 27, 0.5)",
          border: "1px solid #27272a",
          borderRadius: "0px",
          color: "var(--text-primary)",
          fontSize: "13px",
          outline: "none",
        }}
      />
    </div>
  );
}
