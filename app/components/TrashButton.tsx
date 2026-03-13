"use client";

import { useRef } from "react";
import Lottie from "lottie-react";
import type { LottieRefCurrentProps } from "lottie-react";
import trashAnimation from "@/public/trash.json";

export default function TrashButton({ onClick }: { onClick: () => void }) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (lottieRef.current) {
          lottieRef.current.goToAndPlay(0, true);
        }
        onClick();
      }}
      onMouseEnter={() => {
        if (lottieRef.current) {
          lottieRef.current.goToAndPlay(0, true);
        }
      }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-label="Delete"
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={trashAnimation}
        autoplay={false}
        loop={false}
        style={{ width: 22, height: 22 }}
      />
    </button>
  );
}
