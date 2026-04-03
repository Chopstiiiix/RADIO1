"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { isNative } from "../../lib/capacitor-bridge";

interface VisualizerProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

type VisualizerStyle = "waves" | "circleBar" | "deformedCircle" | "innerGlow" | "circleCircles";

const STYLES: VisualizerStyle[] = ["waves", "circleBar", "deformedCircle", "innerGlow", "circleCircles"];
const STYLE_LABELS: Record<VisualizerStyle, string> = {
  waves: "WAVES",
  circleBar: "RADIAL",
  deformedCircle: "MORPH",
  innerGlow: "GLOW",
  circleCircles: "ORBIT",
};

export default function Visualizer({ analyserNode, isPlaying }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const frameSkipRef = useRef(0);
  const isMobile = isNative() || (typeof window !== "undefined" && window.innerWidth < 768);

  const [styleIndex, setStyleIndex] = useState(0);
  const [showLabel, setShowLabel] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>();
  const touchStartX = useRef(0);

  const currentStyle = STYLES[styleIndex];

  const cycleStyle = useCallback((direction: 1 | -1) => {
    setStyleIndex((prev) => (prev + direction + STYLES.length) % STYLES.length);
    setShowLabel(true);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setShowLabel(false), 1500);
  }, []);

  // Swipe detection
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      cycleStyle(diff < 0 ? 1 : -1);
    }
  }, [cycleStyle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let currentDpr = window.devicePixelRatio || 1;
    const resize = () => {
      currentDpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * currentDpr;
      canvas.height = rect.height * currentDpr;
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      if (document.visibilityState === "hidden") {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      if (isMobile) {
        frameSkipRef.current++;
        if (frameSkipRef.current % 2 !== 0) {
          animFrameRef.current = requestAnimationFrame(draw);
          return;
        }
      }

      const rect = canvas.parentElement!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get frequency data
      let freqData: Uint8Array<ArrayBuffer> | undefined;
      let hasRealData = false;
      if (analyserNode && isPlaying) {
        freqData = new Uint8Array(analyserNode.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        analyserNode.getByteFrequencyData(freqData);
        for (let i = 0; i < freqData.length; i++) {
          if (freqData[i] > 0) { hasRealData = true; break; }
        }
      }

      // Normalize to 32 bins (0-1 range)
      const bins = 32;
      const values = new Float32Array(bins);
      if (hasRealData && freqData) {
        const binSize = Math.floor(freqData.length / bins);
        for (let i = 0; i < bins; i++) {
          let sum = 0;
          for (let j = 0; j < binSize; j++) sum += freqData[i * binSize + j];
          values[i] = sum / binSize / 255;
        }
      } else if (isPlaying) {
        // Breathing fallback
        const breathe = 0.3 + 0.3 * Math.sin(timeRef.current * 0.8);
        for (let i = 0; i < bins; i++) {
          values[i] = breathe * (0.5 + 0.5 * Math.sin(i * 0.3 + timeRef.current * 2));
        }
      }

      // Render current style
      switch (currentStyle) {
        case "waves": drawWaves(ctx, w, h, values, hasRealData, freqData); break;
        case "circleBar": drawCircleBar(ctx, w, h, values); break;
        case "deformedCircle": drawDeformedCircle(ctx, w, h, values); break;
        case "innerGlow": drawInnerGlow(ctx, w, h, values); break;
        case "circleCircles": drawCircleCircles(ctx, w, h, values); break;
      }

      timeRef.current -= 0.03;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isPlaying, currentStyle]);

  // ── Style 1: Waves ──
  function drawWaves(ctx: CanvasRenderingContext2D, w: number, h: number, values: Float32Array, hasRealData: boolean, freqData?: Uint8Array) {
    const wc = { r: 120, g: 179, b: 206 };
    const breathe = isPlaying ? 0.5 + 0.5 * Math.sin(timeRef.current * 0.8) : 0;

    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const layers = [
      { amp: h * 0.3, freq: 0.005, phase: 0, opacity: 0.3, lw: 2 },
      { amp: h * 0.2, freq: 0.01, phase: Math.PI / 4, opacity: 0.8, lw: 1.5 },
      { amp: h * 0.1, freq: 0.02, phase: Math.PI, opacity: 0.5, lw: 1 },
    ];
    for (const l of layers) {
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let x = 0; x < w; x++) {
        let y = Math.sin(x * l.freq + timeRef.current + l.phase) * l.amp;
        y += Math.sin(x * (l.freq * 3.5) + timeRef.current * 2) * (l.amp * 0.2);
        if (hasRealData && freqData) {
          const di = Math.floor((x / w) * freqData.length);
          y *= 0.4 + (freqData[di] / 255) * 1.2;
        } else if (isPlaying) {
          y *= 0.5 + breathe * 0.5;
        }
        ctx.lineTo(x, h / 2 + y * Math.sin((x / w) * Math.PI));
      }
      ctx.strokeStyle = `rgba(${wc.r},${wc.g},${wc.b},${l.opacity})`;
      ctx.lineWidth = l.lw;
      ctx.stroke();
    }
  }

  // ── Style 2: Circle Bar (Radial) ──
  function drawCircleBar(ctx: CanvasRenderingContext2D, w: number, h: number, values: Float32Array) {
    const cx = w / 2;
    const cy = h / 2;
    const minR = Math.min(w, h) * 0.15;
    const maxR = Math.min(w, h) * 0.42;
    const count = values.length;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const amp = values[i];
      const barH = minR + amp * (maxR - minR);
      const barW = Math.max(2, (Math.PI * 2 * minR) / count * 0.6);
      const hue = 190 + (i / count) * 40; // cyan to blue

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      ctx.fillStyle = `hsla(${hue}, 60%, ${50 + amp * 30}%, ${0.4 + amp * 0.6})`;
      ctx.fillRect(-barW / 2, -barH, barW, barH - minR);

      // Glow at tip
      if (amp > 0.3) {
        ctx.shadowColor = `hsla(${hue}, 80%, 60%, ${amp * 0.5})`;
        ctx.shadowBlur = 8;
        ctx.fillRect(-barW / 2, -barH, barW, 2);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, minR * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 179, 206, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── Style 3: Deformed Circle (Morph) ──
  function drawDeformedCircle(ctx: CanvasRenderingContext2D, w: number, h: number, values: Float32Array) {
    const cx = w / 2;
    const cy = h / 2;
    const minR = Math.min(w, h) * 0.12;
    const maxR = Math.min(w, h) * 0.38;
    const count = values.length;

    // Outer morphing shape
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const idx = i % count;
      const angle = (idx / count) * Math.PI * 2;
      const amp = values[idx];
      const r = minR + amp * (maxR - minR);
      const x = cx + Math.cos(angle + timeRef.current * 0.5) * r;
      const y = cy + Math.sin(angle + timeRef.current * 0.5) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, minR, cx, cy, maxR);
    grad.addColorStop(0, "rgba(6, 182, 212, 0.3)");
    grad.addColorStop(0.5, "rgba(16, 185, 129, 0.15)");
    grad.addColorStop(1, "rgba(120, 179, 206, 0.05)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = "rgba(120, 179, 206, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner pulse circle
    const avgAmp = Array.from(values).reduce((a, b) => a + b, 0) / count;
    const innerR = minR * (0.4 + avgAmp * 0.6);
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(6, 182, 212, ${0.1 + avgAmp * 0.2})`;
    ctx.fill();
  }

  // ── Style 4: Inner Glow ──
  function drawInnerGlow(ctx: CanvasRenderingContext2D, w: number, h: number, values: Float32Array) {
    const count = values.length;
    const half = Math.floor(count / 2);
    const maxDeform = Math.min(w, h) * 0.35;

    // Left side
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < half; i++) {
      const t = i / (half - 1);
      const x = values[i] * maxDeform;
      ctx.lineTo(x, t * h);
    }
    ctx.lineTo(0, h);
    ctx.closePath();
    const leftGrad = ctx.createLinearGradient(0, 0, maxDeform, 0);
    leftGrad.addColorStop(0, "rgba(6, 182, 212, 0.25)");
    leftGrad.addColorStop(1, "rgba(6, 182, 212, 0)");
    ctx.fillStyle = leftGrad;
    ctx.fill();

    // Right side
    ctx.beginPath();
    ctx.moveTo(w, 0);
    for (let i = 0; i < half; i++) {
      const t = i / (half - 1);
      const x = w - values[(i + half) % count] * maxDeform;
      ctx.lineTo(x, t * h);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const rightGrad = ctx.createLinearGradient(w, 0, w - maxDeform, 0);
    rightGrad.addColorStop(0, "rgba(16, 185, 129, 0.25)");
    rightGrad.addColorStop(1, "rgba(16, 185, 129, 0)");
    ctx.fillStyle = rightGrad;
    ctx.fill();

    // Bottom glow
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = h - values[i] * maxDeform * 0.6;
      ctx.lineTo(t * w, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const bottomGrad = ctx.createLinearGradient(0, h, 0, h - maxDeform);
    bottomGrad.addColorStop(0, "rgba(245, 158, 11, 0.2)");
    bottomGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
    ctx.fillStyle = bottomGrad;
    ctx.fill();
  }

  // ── Style 5: Circle Circles (Orbit) ──
  function drawCircleCircles(ctx: CanvasRenderingContext2D, w: number, h: number, values: Float32Array) {
    const cx = w / 2;
    const cy = h / 2;
    const minR = Math.min(w, h) * 0.15;
    const maxR = Math.min(w, h) * 0.4;
    const count = values.length;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + timeRef.current * 0.3;
      const amp = values[i];
      const dist = minR + amp * (maxR - minR) * 0.8;
      const dotR = 2 + amp * 6;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const hue = 180 + (i / count) * 50;

      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 70%, ${55 + amp * 25}%, ${0.3 + amp * 0.7})`;
      ctx.fill();

      // Glow trail
      if (amp > 0.2) {
        ctx.beginPath();
        ctx.arc(x, y, dotR * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${amp * 0.15})`;
        ctx.fill();
      }
    }

    // Orbit ring
    ctx.beginPath();
    ctx.arc(cx, cy, minR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 179, 206, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
      />
      {/* Style label overlay */}
      {showLabel && (
        <div style={{
          position: "absolute",
          bottom: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "9px",
          color: "rgba(255,255,255,0.5)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>{"‹"}</span>
          {STYLE_LABELS[currentStyle]}
          <span style={{ color: "rgba(255,255,255,0.2)" }}>{"›"}</span>
        </div>
      )}
      {/* Dot indicators */}
      <div style={{
        position: "absolute",
        bottom: "4px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: "6px",
        pointerEvents: "none",
      }}>
        {STYLES.map((_, i) => (
          <div key={i} style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            backgroundColor: i === styleIndex ? "rgba(245, 158, 11, 0.8)" : "rgba(255,255,255,0.15)",
            transition: "background-color 0.2s",
          }} />
        ))}
      </div>
    </div>
  );
}
