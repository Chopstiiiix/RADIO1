"use client";

import { useRef, useEffect } from "react";
import { isNative } from "../../lib/capacitor-bridge";

interface VisualizerProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
  artworkUrl?: string | null;
}

export default function Visualizer({ analyserNode, isPlaying, artworkUrl }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const frameSkipRef = useRef(0);
  const isMobile = isNative() || (typeof window !== "undefined" && window.innerWidth < 768);

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

    const waveColor = { r: 120, g: 179, b: 206 }; // #78B3CE

    const drawWave = (
      w: number, h: number,
      amplitude: number, frequency: number, phaseOffset: number,
      opacity: number, lineWidth: number, time: number,
      freqData?: Uint8Array, breathe?: number,
    ) => {
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let x = 0; x < w; x++) {
        let y = Math.sin(x * frequency + time + phaseOffset) * amplitude;
        y += Math.sin(x * (frequency * 3.5) + time * 2) * (amplitude * 0.2);
        if (freqData) {
          const di = Math.floor((x / w) * freqData.length);
          y *= 0.4 + (freqData[di] / 255) * 1.2;
        } else if (breathe !== undefined) {
          y *= 0.5 + breathe * 0.5;
        }
        ctx.lineTo(x, h / 2 + y * Math.sin((x / w) * Math.PI));
      }
      ctx.strokeStyle = `rgba(${waveColor.r},${waveColor.g},${waveColor.b},${opacity})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

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

      let freqData: Uint8Array<ArrayBuffer> | undefined;
      let hasRealData = false;
      if (analyserNode && isPlaying) {
        freqData = new Uint8Array(analyserNode.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        analyserNode.getByteFrequencyData(freqData);
        for (let i = 0; i < freqData.length; i++) {
          if (freqData[i] > 0) { hasRealData = true; break; }
        }
      }

      const breathe = isPlaying ? 0.5 + 0.5 * Math.sin(timeRef.current * 0.8) : 0;

      // Center line
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = artworkUrl ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Three layered waves — brighter when over artwork
      const fd = hasRealData ? freqData : undefined;
      const br = hasRealData ? undefined : breathe;
      const opMul = artworkUrl ? 1.3 : 1;
      drawWave(w, h, h * 0.3, 0.005, 0, 0.3 * opMul, 2, timeRef.current, fd, br);
      drawWave(w, h, h * 0.2, 0.01, Math.PI / 4, 0.8 * opMul, 1.5, timeRef.current, fd, br);
      drawWave(w, h, h * 0.1, 0.02, Math.PI, 0.5 * opMul, 1, timeRef.current, fd, br);

      timeRef.current -= 0.03;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isPlaying, artworkUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Artwork background layer */}
      {artworkUrl && (
        <>
          <img
            src={artworkUrl}
            alt="Track artwork"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
          {/* Gradient overlay for readability */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.3) 100%)",
          }} />
        </>
      )}
      {/* Wave canvas — always on top */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
        }}
      />
    </div>
  );
}
