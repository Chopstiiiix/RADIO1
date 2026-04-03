"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";

interface AdRequest {
  id: string;
  status: string;
  frequency: string;
  requested_at: string;
  advert: { title: string; description: string | null; file_url: string | null; duration_seconds: number | null };
  advertiser: { display_name: string };
}

const MIN_TRACKS_FOR_ADS = 15;

export default function AdRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [trackCount, setTrackCount] = useState(0);
  const [channelName, setChannelName] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [reqRes, trackRes, channelRes] = await Promise.all([
      supabase
        .from("ad_requests")
        .select(`
          id, status, frequency, requested_at,
          advert:adverts(title, description, file_url, duration_seconds),
          advertiser:profiles!ad_requests_advertiser_id_fkey(display_name)
        `)
        .eq("broadcaster_id", user.id)
        .order("requested_at", { ascending: false }),
      supabase
        .from("tracks")
        .select("*", { count: "exact", head: true })
        .eq("broadcaster_id", user.id)
        .eq("is_active", true),
      supabase
        .from("broadcaster_profiles")
        .select("channel_name")
        .eq("id", user.id)
        .single(),
    ]);

    setRequests((reqRes.data as any) || []);
    setTrackCount(trackRes.count ?? 0);
    setChannelName((channelRes.data as any)?.channel_name || "Your Channel");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const isEligible = trackCount >= MIN_TRACKS_FOR_ADS;

  async function respond(id: string, status: "approved" | "declined") {
    await supabase.from("ad_requests").update({
      status,
      responded_at: new Date().toISOString(),
    }).eq("id", id);
    setReviewingId(null);
    load();
  }

  function formatDuration(seconds: number | null) {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100dvh - 65px)",
      marginTop: "-24px",
      marginLeft: "-20px",
      marginRight: "-20px",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .cursor-blink {
          animation: pulse-opacity 1s step-end infinite;
        }
      `}</style>

      {/* ── Fixed top zone ── */}
      <div style={{
        flexShrink: 0,
        padding: "24px 20px 16px",
        backgroundColor: "var(--bg-base)",
        borderBottom: "1px solid #27272a",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "#f59e0b",
          marginBottom: "8px",
        }}>
          {"> ad_requests --review"}
          <span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
          }} />
        </div>

        <h1 style={{
          fontSize: "24px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "-0.05em",
        }}>
          Ad Requests<span style={{ color: "#f59e0b" }}>_</span>
        </h1>

        {/* Eligibility status */}
        {!loading && !isEligible && (
          <div style={{
            marginTop: "12px",
            padding: "12px 16px",
            backgroundColor: "rgba(226, 74, 74, 0.08)",
            borderLeft: "3px solid #E24A4A",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "#E24A4A",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            lineHeight: 1.6,
          }}>
            Ineligible for ads — you need at least {MIN_TRACKS_FOR_ADS} active tracks to broadcast ads.
            <br />
            <span style={{ color: "#71717a" }}>Currently: {trackCount} track{trackCount !== 1 ? "s" : ""}</span>
          </div>
        )}
        {!loading && isEligible && (
          <div style={{
            marginTop: "12px",
            padding: "8px 16px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "#52525b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Ads play every {MIN_TRACKS_FOR_ADS} songs — {trackCount} active tracks
          </div>
        )}
      </div>

      {/* ── Scrollable content zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "16px 20px",
      }}>
      {loading ? (
        <InlineLoader />
      ) : requests.length === 0 ? (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderRadius: "0px",
          borderLeft: "2px solid #27272a",
        }}>
          <p style={{
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
          }}>
            No ad requests yet
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {requests.map((req) => {
            const advert = req.advert as any;
            const advertiser = req.advertiser as any;
            const isReviewing = reviewingId === req.id;

            return (
              <div key={req.id} style={{
                backgroundColor: "rgba(24, 24, 27, 0.3)",
                borderLeft: isReviewing ? "3px solid #f59e0b" : "2px solid #27272a",
                borderRadius: "0px",
                overflow: "hidden",
              }}>
                {/* Header row */}
                <div style={{
                  padding: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: "14px",
                      textTransform: "uppercase",
                    }}>
                      {advert?.title ?? "Unknown Ad"}
                    </div>
                    <div style={{ fontSize: "13px" }}>
                      <span style={{
                        color: "#52525b",
                        textTransform: "uppercase",
                      }}>
                        From:
                      </span>{" "}
                      <span style={{ color: "var(--text-secondary)" }}>
                        {advertiser?.display_name ?? "Unknown"} — {req.frequency}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase" }}>
                    {req.status === "pending" ? (
                      <button
                        onClick={() => setReviewingId(isReviewing ? null : req.id)}
                        style={{
                          padding: "6px 14px",
                          backgroundColor: isReviewing ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.1)",
                          border: "1px solid #f59e0b",
                          color: "#f59e0b",
                          borderRadius: "0px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {isReviewing ? "Close" : "Review"}
                      </button>
                    ) : (
                      <span style={{
                        color: req.status === "approved" ? "#4ADE80" : "#E24A4A",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}>{req.status}</span>
                    )}
                  </div>
                </div>

                {/* Review panel */}
                {isReviewing && (
                  <ReviewPanel
                    req={req}
                    onApprove={() => respond(req.id, "approved")}
                    onDecline={() => respond(req.id, "declined")}
                    formatDuration={formatDuration}
                    isEligible={isEligible}
                    channelName={channelName}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>{/* end scrollable zone */}
    </div>
  );
}

function ReviewPanel({ req, onApprove, onDecline, formatDuration, isEligible, channelName }: {
  req: AdRequest;
  onApprove: () => void;
  onDecline: () => void;
  formatDuration: (s: number | null) => string;
  isEligible: boolean;
  channelName: string;
}) {
  const advert = req.advert as any;
  const advertiser = req.advertiser as any;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    const ct = audioRef.current.currentTime;
    const dur = audioRef.current.duration || 1;
    setCurrentTime(ct);
    setProgress((ct / dur) * 100);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * (audioRef.current.duration || 0);
  }

  return (
    <div style={{
      padding: "0 16px 16px",
      borderTop: "1px solid #1a1a1e",
    }}>
      {/* Ad details */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        marginBottom: "16px",
        paddingTop: "16px",
      }}>
        <div>
          <div style={detailLabel}>Advertiser</div>
          <div style={detailValue}>{advertiser?.display_name ?? "Unknown"}</div>
        </div>
        <div>
          <div style={detailLabel}>Frequency</div>
          <div style={detailValue}>{req.frequency}</div>
        </div>
        <div>
          <div style={detailLabel}>Duration</div>
          <div style={detailValue}>{formatDuration(advert?.duration_seconds)}</div>
        </div>
        <div>
          <div style={detailLabel}>Requested</div>
          <div style={detailValue}>{new Date(req.requested_at).toLocaleDateString()}</div>
        </div>
      </div>

      {advert?.description && (
        <div style={{ marginBottom: "16px" }}>
          <div style={detailLabel}>Description</div>
          <div style={{
            ...detailValue,
            lineHeight: "1.5",
          }}>{advert.description}</div>
        </div>
      )}

      {/* Audio player */}
      {advert?.file_url ? (
        <div style={{
          backgroundColor: "rgba(10, 10, 10, 0.6)",
          border: "1px solid #27272a",
          padding: "12px 16px",
          marginBottom: "16px",
        }}>
          <audio
            ref={audioRef}
            src={advert.file_url}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
            preload="metadata"
          />

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Play/Pause button */}
            <button onClick={togglePlay} style={{
              width: "36px",
              height: "36px",
              backgroundColor: "#f59e0b",
              border: "none",
              borderRadius: "0px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a0a0a" stroke="none">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a0a0a" stroke="none">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </button>

            {/* Progress bar */}
            <div style={{ flex: 1 }}>
              <div
                onClick={handleSeek}
                style={{
                  height: "4px",
                  backgroundColor: "#27272a",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div style={{
                  height: "100%",
                  width: `${progress}%`,
                  backgroundColor: "#f59e0b",
                  transition: "width 0.1s linear",
                }} />
              </div>
            </div>

            {/* Time */}
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "#71717a",
              minWidth: "40px",
              textAlign: "right",
            }}>
              {formatDuration(currentTime)}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: "20px",
          textAlign: "center",
          backgroundColor: "rgba(10, 10, 10, 0.4)",
          border: "1px solid #27272a",
          marginBottom: "16px",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "#52525b",
            textTransform: "uppercase",
          }}>
            No audio file available
          </span>
        </div>
      )}

      {/* Approve / Decline buttons */}
      {!isEligible && (
        <div style={{
          padding: "10px 14px",
          backgroundColor: "rgba(226, 74, 74, 0.08)",
          borderLeft: "3px solid #E24A4A",
          marginBottom: "12px",
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
          color: "#E24A4A",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          You need at least {MIN_TRACKS_FOR_ADS} active tracks to approve ads
        </div>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={onApprove} disabled={!isEligible} style={{
          flex: 1,
          padding: "12px",
          backgroundColor: isEligible ? "rgba(74, 222, 128, 0.1)" : "rgba(24, 24, 27, 0.3)",
          border: isEligible ? "1px solid #4ADE80" : "1px solid #27272a",
          color: isEligible ? "#4ADE80" : "#3f3f46",
          borderRadius: "0px",
          cursor: isEligible ? "pointer" : "not-allowed",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: "var(--font-mono)",
          opacity: isEligible ? 1 : 0.5,
        }}>
          Approve
        </button>
        <button onClick={onDecline} style={{
          flex: 1,
          padding: "12px",
          backgroundColor: "rgba(226, 74, 74, 0.1)",
          border: "1px solid #E24A4A",
          color: "#E24A4A",
          borderRadius: "0px",
          cursor: "pointer",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: "var(--font-mono)",
        }}>
          Decline
        </button>
      </div>
    </div>
  );
}

const detailLabel: React.CSSProperties = {
  fontSize: "10px",
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontFamily: "var(--font-mono)",
  marginBottom: "2px",
};

const detailValue: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--text-secondary)",
};
