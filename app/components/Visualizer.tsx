"use client";

import { useRef, useEffect } from "react";

interface VisualizerProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export default function Visualizer({ analyserNode, isPlaying }: VisualizerProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const smoothedRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;
    const bgCtx = bgCanvas.getContext("2d");
    const fgCtx = fgCanvas.getContext("2d");
    if (!bgCtx || !fgCtx) return;

    let currentDpr = window.devicePixelRatio || 1;
    const resize = () => {
      currentDpr = window.devicePixelRatio || 1;
      const rect = bgCanvas.parentElement!.getBoundingClientRect();
      bgCanvas.width = rect.width * currentDpr;
      bgCanvas.height = rect.height * currentDpr;
      bgCtx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
      fgCanvas.width = rect.width * currentDpr;
      fgCanvas.height = rect.height * currentDpr;
      fgCtx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 100));

    const waveColor = { r: 120, g: 179, b: 206 }; // #78B3CE
    const BANDS = 48;

    const drawWave = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      amplitude: number,
      frequency: number,
      phaseOffset: number,
      opacity: number,
      lineWidth: number,
      time: number,
      freqData?: Uint8Array
    ) => {
      ctx.beginPath();
      ctx.moveTo(0, h / 2);

      for (let x = 0; x < w; x++) {
        let y = Math.sin(x * frequency + time + phaseOffset) * amplitude;
        y += Math.sin(x * (frequency * 3.5) + time * 2) * (amplitude * 0.2);

        if (freqData) {
          const dataIndex = Math.floor((x / w) * freqData.length);
          const freqValue = freqData[dataIndex] / 255;
          y *= 0.4 + freqValue * 1.2;
        }

        const envelope = Math.sin((x / w) * Math.PI);
        ctx.lineTo(x, h / 2 + y * envelope);
      }

      ctx.strokeStyle = `rgba(${waveColor.r}, ${waveColor.g}, ${waveColor.b}, ${opacity})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    const drawGradientSpectrum = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      freqData: Uint8Array | undefined
    ) => {
      if (!freqData) return;

      if (!smoothedRef.current || smoothedRef.current.length !== BANDS) {
        smoothedRef.current = new Float32Array(BANDS);
      }
      const smoothed = smoothedRef.current;
      const binSize = Math.floor(freqData.length / BANDS);
      const gap = 2;
      const barW = (w - gap * (BANDS - 1)) / BANDS;

      for (let i = 0; i < BANDS; i++) {
        let sum = 0;
        for (let j = 0; j < binSize; j++) {
          sum += freqData[i * binSize + j];
        }
        const target = sum / binSize / 255;
        // Smooth: rise fast, fall slow
        smoothed[i] += (target - smoothed[i]) * (target > smoothed[i] ? 0.4 : 0.08);

        const barH = smoothed[i] * h;
        if (barH < 1) continue;

        const x = i * (barW + gap);
        const y = h - barH;

        // Gradient per bar: cyan at bottom → emerald at top
        const grad = ctx.createLinearGradient(x, h, x, y);
        grad.addColorStop(0, `rgba(6, 182, 212, ${0.15 + smoothed[i] * 0.25})`);   // cyan
        grad.addColorStop(0.5, `rgba(16, 185, 129, ${0.1 + smoothed[i] * 0.2})`);  // emerald
        grad.addColorStop(1, `rgba(120, 179, 206, ${0.05 + smoothed[i] * 0.1})`);  // light blue fade

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, barH);

        // Soft glow at peak
        if (smoothed[i] > 0.3) {
          const glowGrad = ctx.createRadialGradient(
            x + barW / 2, y, 0,
            x + barW / 2, y, barW * 1.5
          );
          glowGrad.addColorStop(0, `rgba(6, 182, 212, ${smoothed[i] * 0.15})`);
          glowGrad.addColorStop(1, "rgba(6, 182, 212, 0)");
          ctx.fillStyle = glowGrad;
          ctx.fillRect(x - barW, y - barW, barW * 3, barW * 2);
        }
      }
    };

    const draw = () => {
      const rect = bgCanvas.parentElement!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);

      let freqData: Uint8Array<ArrayBuffer> | undefined;
      if (analyserNode && isPlaying) {
        freqData = new Uint8Array(analyserNode.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        analyserNode.getByteFrequencyData(freqData);
      }

      // Background: gradient spectrum bars
      drawGradientSpectrum(bgCtx, w, h, freqData);

      // Foreground: center line
      fgCtx.beginPath();
      fgCtx.moveTo(0, h / 2);
      fgCtx.lineTo(w, h / 2);
      fgCtx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      fgCtx.lineWidth = 1;
      fgCtx.stroke();

      // Foreground: three layered waves
      drawWave(fgCtx, w, h, h * 0.3, 0.005, 0, 0.3, 2, timeRef.current, freqData);
      drawWave(fgCtx, w, h, h * 0.2, 0.01, Math.PI / 4, 0.8, 1.5, timeRef.current, freqData);
      drawWave(fgCtx, w, h, h * 0.1, 0.02, Math.PI, 0.5, 1, timeRef.current, freqData);

      timeRef.current -= 0.03;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isPlaying]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={bgCanvasRef}
        style={{ display: "block", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
      />
      <canvas
        ref={fgCanvasRef}
        style={{ display: "block", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
      />
    </div>
  );
}
