"use client";

import { useState } from "react";

interface BroadcastAgreementProps {
  onAccept: () => void;
  onCancel: () => void;
  trackCount: number;
}

export default function BroadcastAgreement({ onAccept, onCancel, trackCount }: BroadcastAgreementProps) {
  const [checks, setChecks] = useState({
    rights: false,
    ai: false,
    rateLimit: false,
    data: false,
  });

  const allChecked = checks.rights && checks.ai && checks.rateLimit && checks.data;

  function toggle(key: keyof typeof checks) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "460px",
        maxHeight: "90vh",
        overflowY: "auto",
        backgroundColor: "#18181b",
        border: "1px solid #27272a",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px",
          borderBottom: "1px solid #27272a",
        }}>
          <div style={{
            fontSize: "10px",
            color: "#f59e0b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "8px",
          }}>
            {"// BROADCAST_AGREEMENT"}
          </div>
          <h2 style={{
            fontSize: "18px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "-0.03em",
          }}>
            Terms of Broadcast<span style={{ color: "#f59e0b" }}>_</span>
          </h2>
          <p style={{
            fontSize: "11px",
            color: "#71717a",
            marginTop: "6px",
            lineHeight: 1.5,
          }}>
            Please review and accept the following terms before broadcasting {trackCount} track{trackCount !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Agreement sections */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* 1. Content Rights & Licensing */}
          <AgreementSection
            checked={checks.rights}
            onToggle={() => toggle("rights")}
            title="Content Rights & Licensing"
            content={`I confirm that I am the rightful owner, or have obtained the necessary rights, licences, and permissions to broadcast all audio content I have uploaded to this platform. I understand that broadcasting copyrighted material without proper authorisation constitutes a violation of applicable copyright laws. By proceeding, I accept full responsibility for any claims, disputes, or legal actions arising from the content I broadcast. Caster, its operators, and affiliated networks shall not be held liable for any copyright infringement resulting from my use of this service.`}
          />

          {/* 2. AI-Powered Platform */}
          <AgreementSection
            checked={checks.ai}
            onToggle={() => toggle("ai")}
            title="AI-Powered Platform Disclosure"
            content={`I acknowledge that Caster is an AI-powered broadcasting platform. Features including but not limited to AI Radio Hosts, automated track transitions, dialogue generation, and voice synthesis are powered by artificial intelligence technologies. AI-generated content may vary in quality and accuracy. Caster does not guarantee that AI-generated speech or commentary will be free from errors. By using AI-powered features, I accept that the output is algorithmically generated and does not represent the views or opinions of Caster or its operators.`}
          />

          {/* 3. Rate Limits & Fair Usage */}
          <AgreementSection
            checked={checks.rateLimit}
            onToggle={() => toggle("rateLimit")}
            title="Rate Limits & Fair Usage Policy"
            content={`I understand that certain features within the platform are subject to rate limits and fair usage policies. These include, but are not limited to, broadcast duration, number of concurrent streams, AI host segment generation, track uploads, and API usage. Caster reserves the right to throttle, limit, or temporarily suspend access to features that exceed fair usage thresholds. These measures are in place to ensure platform stability and a quality experience for all users.`}
          />

          {/* 4. Data Privacy & Storage */}
          <AgreementSection
            checked={checks.data}
            onToggle={() => toggle("data")}
            title="Data Privacy & Storage"
            content={`I acknowledge that my personal data, account information, uploaded audio content, and broadcast activity are stored securely on Supabase-hosted infrastructure. Caster is committed to protecting user data in accordance with applicable data protection regulations. I understand that I have the right to access, review, or request deletion of any personal data held by the platform at any time — no formal subject access request is required. To exercise these rights or raise any data-related concerns, I may contact the platform directly at chopper@inspiredaily.net. My data will not be sold, shared with, or disclosed to third parties without my explicit consent, except where required by law.`}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 20px",
          borderTop: "1px solid #27272a",
          display: "flex",
          gap: "8px",
        }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "transparent",
              border: "1px solid #27272a",
              color: "#71717a",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={!allChecked}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: allChecked ? "#f59e0b" : "#27272a",
              border: "none",
              color: allChecked ? "#0a0a0a" : "#52525b",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: allChecked ? "pointer" : "not-allowed",
              fontFamily: "'JetBrains Mono', monospace",
              opacity: allChecked ? 1 : 0.6,
            }}
          >
            Accept & Broadcast
          </button>
        </div>
      </div>
    </div>
  );
}

function AgreementSection({ checked, onToggle, title, content }: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  content: string;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: "14px",
        backgroundColor: checked ? "rgba(245, 158, 11, 0.04)" : "rgba(24, 24, 27, 0.3)",
        borderLeft: checked ? "3px solid #f59e0b" : "2px solid #27272a",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
      }}>
        {/* Checkbox */}
        <div style={{
          width: "18px",
          height: "18px",
          border: checked ? "2px solid #f59e0b" : "2px solid #3f3f46",
          backgroundColor: checked ? "#f59e0b" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "1px",
          transition: "all 0.15s",
        }}>
          {checked && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: "11px",
            fontWeight: 700,
            color: checked ? "#f59e0b" : "#a1a1aa",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "6px",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {title}
          </div>
          <div style={{
            fontSize: "11px",
            color: "#71717a",
            lineHeight: 1.6,
          }}>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
