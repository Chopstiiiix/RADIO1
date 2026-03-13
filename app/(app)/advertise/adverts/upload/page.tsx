"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Lottie from "lottie-react";
import loadingAnimation from "@/public/loadingV3.json";
import checkmarkAnimation from "@/public/checkmark.json";

export default function UploadAdvertPage() {
  const supabase = createClient();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Select an audio file");

    setUploading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("adverts")
      .upload(filePath, file);

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("adverts").getPublicUrl(filePath);

    let duration: number | null = null;
    try {
      const audio = new Audio(URL.createObjectURL(file));
      duration = await new Promise<number>((resolve) => {
        audio.addEventListener("loadedmetadata", () => resolve(audio.duration));
        audio.addEventListener("error", () => resolve(0));
      });
    } catch { /* ignore */ }

    const { error: insertError } = await supabase.from("adverts").insert({
      advertiser_id: user.id,
      title,
      description: description || null,
      file_url: urlData.publicUrl,
      duration_seconds: duration,
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    setSuccess(true);
    setTimeout(() => router.push("/advertise/adverts"), 2000);
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
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
        color: "#f59e0b",
        marginBottom: "8px",
      }}>
        {"> upload_advert --new"}<span className="cursor-blink" style={{
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
        Upload Advert<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      <form onSubmit={handleUpload} style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        borderLeft: "3px solid #f59e0b",
        paddingLeft: "16px",
      }}>
        <div>
          <label style={labelStyle}>Audio File</label>
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.ogg"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            style={{ fontSize: "13px", color: "var(--text-secondary)" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {error && <p style={{
          color: "#E24A4A",
          fontSize: "11px",
          textTransform: "uppercase",
        }}>{error}</p>}

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
          {uploading ? "Uploading..." : "Upload Advert"}
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
            UPLOADING ADVERT...
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  backgroundColor: "rgba(24, 24, 27, 0.5)",
  border: "1px solid #27272a",
  borderRadius: "0px",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
};
