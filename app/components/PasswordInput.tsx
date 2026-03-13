"use client";

import { useState, useRef } from "react";
import Lottie from "lottie-react";
import type { LottieRefCurrentProps } from "lottie-react";
import visibilityAnimation from "@/public/visibility.json";

export default function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
  required,
  minLength,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  style?: React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  function toggle() {
    const next = !visible;
    setVisible(next);
    if (lottieRef.current) {
      if (next) {
        // Play forward: eye open → closed (show → hide)
        lottieRef.current.setDirection(1);
        lottieRef.current.play();
      } else {
        // Play reverse: eye closed → open (hide → show)
        lottieRef.current.setDirection(-1);
        lottieRef.current.play();
      }
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        style={{
          ...style,
          paddingRight: "48px",
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Lottie
          lottieRef={lottieRef}
          animationData={visibilityAnimation}
          autoplay={false}
          loop={false}
          style={{ width: 24, height: 24 }}
        />
      </button>
    </div>
  );
}
