"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";
import { useRouter, useSearchParams } from "next/navigation";

interface AiAgent {
  id: string;
  name: string;
  gender: string;
  description: string;
  personality: string;
  voice_id: string | null;
  is_active: boolean;
  price_primary_cents: number;
  price_cohost_cents: number;
}

interface AgentSubscription {
  id: string;
  agent_id: string;
  role: "primary" | "cohost";
  status: string;
  ai_agent?: AiAgent;
}

interface BroadcasterAgentConfig {
  broadcaster_id: string;
  ai_host_enabled: boolean;
}

interface ChannelInfo {
  channel_slug: string;
}

export default function AgentMarketplacePage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [subscriptions, setSubscriptions] = useState<AgentSubscription[]>([]);
  const [aiHostEnabled, setAiHostEnabled] = useState(false);
  const [channelSlug, setChannelSlug] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [togglingHost, setTogglingHost] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    // Check for Stripe redirect
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      setSuccessMessage("Subscription activated successfully.");
      // Clean the URL
      window.history.replaceState({}, "", "/broadcast/agents");
    }
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "broadcaster") { router.push("/listen"); return; }

    setUserId(user.id);

    const [agentsRes, subsRes, configRes, channelRes] = await Promise.all([
      supabase
        .from("ai_agents")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("agent_subscriptions")
        .select("id, agent_id, role, status, ai_agent:ai_agents(*)")
        .eq("broadcaster_id", user.id)
        .eq("status", "active"),
      supabase
        .from("broadcaster_agent_configs")
        .select("broadcaster_id, ai_host_enabled")
        .eq("broadcaster_id", user.id)
        .single(),
      supabase
        .from("broadcaster_profiles")
        .select("channel_slug")
        .eq("id", user.id)
        .single(),
    ]);

    setAgents((agentsRes.data as AiAgent[]) || []);
    setSubscriptions((subsRes.data as unknown as AgentSubscription[]) || []);
    setAiHostEnabled(configRes.data?.ai_host_enabled ?? false);
    setChannelSlug((channelRes.data as ChannelInfo)?.channel_slug || "");
    setLoading(false);
  }

  function isSubscribed(agentId: string): AgentSubscription | undefined {
    return subscriptions.find((s) => s.agent_id === agentId);
  }

  async function handleSubscribe(agentId: string, role: "primary" | "cohost") {
    if (!userId) return;
    setSubscribingId(agentId + "-" + role);
    try {
      // Direct subscription (bypassing Stripe for testing)
      const { error } = await supabase
        .from("agent_subscriptions")
        .upsert({
          broadcaster_id: userId,
          agent_id: agentId,
          role,
          status: "active",
        }, { onConflict: "broadcaster_id,agent_id" });

      if (error) {
        alert("Error: " + error.message);
      } else {
        // Enable AI host automatically
        await supabase
          .from("broadcaster_agent_configs")
          .upsert({ broadcaster_id: userId, ai_host_enabled: true }, { onConflict: "broadcaster_id" });
        setAiHostEnabled(true);
        setSuccessMessage("Agent added successfully!");
        await loadData();
      }
    } catch {
      alert("Error adding agent.");
    }
    setSubscribingId(null);
  }

  async function handleSwapRoles() {
    if (subscriptions.length < 2 || !userId) return;
    setSwapping(true);

    const updates = subscriptions.map((sub) => {
      const newRole = sub.role === "primary" ? "cohost" : "primary";
      return supabase
        .from("agent_subscriptions")
        .update({ role: newRole })
        .eq("id", sub.id);
    });

    await Promise.all(updates);
    await loadData();
    setSwapping(false);
  }

  async function handleToggleAiHost() {
    if (!userId) return;
    setTogglingHost(true);

    const newValue = !aiHostEnabled;
    await supabase
      .from("broadcaster_agent_configs")
      .upsert({
        broadcaster_id: userId,
        ai_host_enabled: newValue,
      }, { onConflict: "broadcaster_id" });

    setAiHostEnabled(newValue);
    setTogglingHost(false);
  }

  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null);

  async function handleUnsubscribe(agentId: string) {
    if (!userId) return;
    setUnsubscribingId(agentId);
    try {
      await supabase
        .from("agent_subscriptions")
        .delete()
        .eq("broadcaster_id", userId)
        .eq("agent_id", agentId);
      setSuccessMessage("Agent removed.");
      await loadData();
    } catch {
      alert("Error removing agent.");
    }
    setUnsubscribingId(null);
  }

  async function handleBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      alert("Error opening billing portal.");
    }
    setPortalLoading(false);
  }

  if (loading) return <InlineLoader />;

  const primarySub = subscriptions.find((s) => s.role === "primary");
  const cohostSubs = subscriptions.filter((s) => s.role === "cohost");
  const hasSubscriptions = subscriptions.length > 0;

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
        {/* Terminal header */}
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "#f59e0b",
          marginBottom: "8px",
        }}>
          {">"} broadcast --agents
          <span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
            marginLeft: "4px",
          }} />
        </div>

        <h1 style={{
          fontSize: "clamp(20px, 5vw, 28px)",
          fontWeight: 700,
          letterSpacing: "-0.05em",
          textTransform: "uppercase",
          color: "#f5f5f5",
        }}>
          Agent Marketplace<span style={{ color: "#f59e0b" }}>_</span>
        </h1>
        <p style={{
          color: "#52525b",
          fontSize: "11px",
          marginTop: "4px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontFamily: "var(--font-mono)",
        }}>
          /{channelSlug || "channel"} — AI Radio Hosts
        </p>

        {/* AI HOST TOGGLE — moved here between breadcrumb and YOUR_HOSTS */}
        <div style={{
          marginTop: "16px",
          padding: "12px 16px",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderLeft: `3px solid ${aiHostEnabled ? "#4ADE80" : "#27272a"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}>
          <div>
            <div style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: aiHostEnabled ? "#4ADE80" : "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}>
              AI Radio Host — {aiHostEnabled ? "ENABLED" : "DISABLED"}
            </div>
          </div>
          <button
            onClick={handleToggleAiHost}
            disabled={togglingHost}
            style={{
              width: "52px",
              height: "28px",
              borderRadius: "14px",
              border: "none",
              backgroundColor: aiHostEnabled ? "#4ADE80" : "#27272a",
              cursor: togglingHost ? "not-allowed" : "pointer",
              position: "relative",
              flexShrink: 0,
              transition: "background-color 0.2s",
              opacity: togglingHost ? 0.6 : 1,
            }}
          >
            <div style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              backgroundColor: aiHostEnabled ? "#0a0a0a" : "#71717a",
              position: "absolute",
              top: "4px",
              left: aiHostEnabled ? "28px" : "4px",
              transition: "left 0.2s, background-color 0.2s",
            }} />
          </button>
        </div>

        {/* YOUR_HOSTS label */}
        {hasSubscriptions && (
          <div style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#52525b",
            marginTop: "16px",
            fontFamily: "var(--font-mono)",
          }}>
            {"// YOUR_HOSTS"}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div style={{
            padding: "10px 14px",
            backgroundColor: "rgba(74, 222, 128, 0.08)",
            borderLeft: "3px solid #4ADE80",
            marginTop: "12px",
            fontSize: "12px",
            color: "#4ADE80",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            {successMessage}
          </div>
        )}
      </div>{/* end fixed top zone */}

      {/* ── Scrollable content zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "16px 20px",
      }}>

      {/* YOUR HOSTS cards — only if subscribed */}
      {hasSubscriptions && (
        <div style={{ marginBottom: "24px" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Primary Host */}
            {primarySub && (
              <HostCard
                agent={primarySub.ai_agent as AiAgent}
                role="PRIMARY"
                roleColor="#4ADE80"
              />
            )}

            {/* Co-Hosts */}
            {cohostSubs.map((sub) => (
              <HostCard
                key={sub.id}
                agent={sub.ai_agent as AiAgent}
                role="CO-HOST"
                roleColor="#f59e0b"
              />
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            {subscriptions.length >= 2 && (
              <button
                onClick={handleSwapRoles}
                disabled={swapping}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  backgroundColor: "transparent",
                  border: "1px solid #27272a",
                  color: "#a1a1aa",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: "var(--font-mono)",
                  cursor: swapping ? "not-allowed" : "pointer",
                  opacity: swapping ? 0.6 : 1,
                  borderRadius: "0px",
                }}
              >
                {swapping ? "Swapping..." : "Swap Roles"}
              </button>
            )}
            <button
              onClick={handleBillingPortal}
              disabled={portalLoading}
              style={{
                flex: 1,
                padding: "10px 16px",
                backgroundColor: "transparent",
                border: "1px solid #27272a",
                color: "#a1a1aa",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: "var(--font-mono)",
                cursor: portalLoading ? "not-allowed" : "pointer",
                opacity: portalLoading ? 0.6 : 1,
                borderRadius: "0px",
              }}
            >
              {portalLoading ? "Loading..." : "Manage Billing"}
            </button>
          </div>
        </div>
      )}

      {/* AVAILABLE AGENTS CATALOG */}
      <div style={{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "#52525b",
        marginBottom: "12px",
        fontFamily: "var(--font-mono)",
      }}>
        {"// AVAILABLE_AGENTS"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "32px" }}>
        {agents.map((agent) => {
          const sub = isSubscribed(agent.id);
          const truncatedPersonality = agent.personality?.length > 120
            ? agent.personality.slice(0, 120) + "..."
            : agent.personality;

          return (
            <div key={agent.id} style={{
              backgroundColor: "rgba(24, 24, 27, 0.3)",
              borderLeft: sub ? "3px solid #4ADE80" : "3px solid #f59e0b",
              padding: "20px",
            }}>
              {/* Avatar + Name row */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                marginBottom: "16px",
              }}>
                {/* Avatar circle */}
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(120, 179, 206, 0.15)",
                  border: "2px solid rgba(120, 179, 206, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "var(--accent-blue, #78B3CE)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "-0.02em",
                    color: "var(--text-primary)",
                  }}>
                    {agent.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <span style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      padding: "2px 8px",
                      backgroundColor: "rgba(113, 113, 122, 0.15)",
                      border: "1px solid #3f3f46",
                      color: "#a1a1aa",
                    }}>
                      {agent.gender}
                    </span>
                    {sub && (
                      <>
                        <span style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          padding: "2px 8px",
                          backgroundColor: "rgba(74, 222, 128, 0.1)",
                          border: "1px solid #4ADE80",
                          color: "#4ADE80",
                        }}>
                          Subscribed
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUnsubscribe(agent.id); }}
                          disabled={unsubscribingId === agent.id}
                          style={{
                            fontSize: "10px",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            padding: "2px 8px",
                            backgroundColor: "transparent",
                            border: "1px solid #E24A4A",
                            color: "#E24A4A",
                            cursor: unsubscribingId === agent.id ? "not-allowed" : "pointer",
                            opacity: unsubscribingId === agent.id ? 0.6 : 1,
                          }}
                        >
                          {unsubscribingId === agent.id ? "..." : "Unsubscribe"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p style={{
                fontSize: "13px",
                color: "#a1a1aa",
                lineHeight: "1.6",
                marginBottom: "12px",
              }}>
                {agent.description}
              </p>

              {/* Personality excerpt */}
              {truncatedPersonality && (
                <div style={{
                  fontSize: "11px",
                  color: "#71717a",
                  fontFamily: "var(--font-mono)",
                  fontStyle: "italic",
                  lineHeight: "1.5",
                  marginBottom: "16px",
                  padding: "10px 12px",
                  backgroundColor: "rgba(10, 10, 10, 0.4)",
                  borderLeft: "2px solid #27272a",
                }}>
                  &quot;{truncatedPersonality}&quot;
                </div>
              )}

              {/* Price */}
              <div style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "16px",
              }}>
                ${(agent.price_primary_cents ?? 5000) / 100}/mo as Primary
                {" "}
                <span style={{ color: "#3f3f46" }}>|</span>
                {" "}
                ${(agent.price_cohost_cents ?? 4000) / 100}/mo as Co-Host
              </div>

              {/* Subscribe buttons (or subscribed badge) */}
              {!sub ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleSubscribe(agent.id, "primary")}
                    disabled={subscribingId === agent.id + "-primary"}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      backgroundColor: "#f59e0b",
                      color: "#0a0a0a",
                      border: "none",
                      borderRadius: "0px",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontFamily: "var(--font-mono)",
                      cursor: subscribingId === agent.id + "-primary" ? "not-allowed" : "pointer",
                      opacity: subscribingId === agent.id + "-primary" ? 0.6 : 1,
                    }}
                  >
                    {subscribingId === agent.id + "-primary" ? "Loading..." : "Subscribe as Primary"}
                  </button>
                  <button
                    onClick={() => handleSubscribe(agent.id, "cohost")}
                    disabled={subscribingId === agent.id + "-co-host"}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      backgroundColor: "transparent",
                      color: "#f59e0b",
                      border: "1px solid #f59e0b",
                      borderRadius: "0px",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontFamily: "var(--font-mono)",
                      cursor: subscribingId === agent.id + "-co-host" ? "not-allowed" : "pointer",
                      opacity: subscribingId === agent.id + "-co-host" ? 0.6 : 1,
                    }}
                  >
                    {subscribingId === agent.id + "-co-host" ? "Loading..." : "Subscribe as Co-Host"}
                  </button>
                </div>
              ) : (
                <div style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#4ADE80",
                  padding: "10px 0",
                }}>
                  Active as {sub.role === "primary" ? "Primary Host" : "Co-Host"}
                </div>
              )}
            </div>
          );
        })}

        {agents.length === 0 && (
          <div style={{
            padding: "60px 20px",
            textAlign: "center",
            backgroundColor: "rgba(24, 24, 27, 0.3)",
            borderLeft: "2px solid #27272a",
          }}>
            <p style={{
              color: "#52525b",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
            }}>
              No agents available yet
            </p>
          </div>
        )}
      </div>

      {/* BILLING INFO */}
      <div style={{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "#52525b",
        marginBottom: "12px",
        fontFamily: "var(--font-mono)",
      }}>
        {"// BILLING_INFO"}
      </div>
      <div style={{
        padding: "16px",
        backgroundColor: "rgba(24, 24, 27, 0.3)",
        borderLeft: "2px solid #27272a",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        color: "#71717a",
        lineHeight: "1.7",
      }}>
        Agent subscriptions are billed monthly via Stripe.
        <br />
        Primary hosts: $50/month
        <span style={{ color: "#3f3f46" }}> | </span>
        Co-hosts: $40/month.
        <br />
        You can cancel anytime from the billing portal.
      </div>

      </div>{/* end scrollable zone */}
    </div>
  );
}

function HostCard({ agent, role, roleColor }: {
  agent: AiAgent;
  role: string;
  roleColor: string;
}) {
  if (!agent) return null;

  return (
    <div style={{
      padding: "16px",
      backgroundColor: "rgba(24, 24, 27, 0.3)",
      borderLeft: `3px solid ${roleColor}`,
      display: "flex",
      alignItems: "center",
      gap: "14px",
    }}>
      {/* Mini avatar */}
      <div style={{
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        backgroundColor: "rgba(120, 179, 206, 0.15)",
        border: "2px solid rgba(120, 179, 206, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: "16px",
          fontWeight: 700,
          color: "var(--accent-blue, #78B3CE)",
          fontFamily: "var(--font-mono)",
        }}>
          {agent.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: "14px",
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--text-primary)",
          letterSpacing: "0.02em",
        }}>
          {agent.name}
        </div>
        <div style={{
          fontSize: "11px",
          color: "#71717a",
          fontFamily: "var(--font-mono)",
          marginTop: "2px",
          lineHeight: "1.4",
        }}>
          {agent.personality?.length > 80
            ? agent.personality.slice(0, 80) + "..."
            : agent.personality}
        </div>
      </div>

      {/* Role badge */}
      <span style={{
        fontSize: "10px",
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        padding: "3px 10px",
        backgroundColor: `${roleColor}15`,
        border: `1px solid ${roleColor}`,
        color: roleColor,
        flexShrink: 0,
      }}>
        {role}
      </span>
    </div>
  );
}
