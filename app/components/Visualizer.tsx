"use client";

import { useRef, useEffect } from "react";

interface VisualizerProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export default function Visualizer({ analyserNode, isPlaying }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animFrameRef = useRef<number>(0);

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
    // Handle mobile orientation changes
    window.addEventListener("orientationchange", () => setTimeout(resize, 100));

    const waveColor = { r: 120, g: 179, b: 206 }; // #78B3CE

    const drawWave = (
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

        // Modulate by audio data if available
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

    const draw = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Center line
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();

      let freqData: Uint8Array<ArrayBuffer> | undefined;
      if (analyserNode && isPlaying) {
        freqData = new Uint8Array(analyserNode.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        analyserNode.getByteFrequencyData(freqData);
      }

      // Three layered waves — matches the reference exactly
      drawWave(w, h, h * 0.3, 0.005, 0, 0.3, 2, timeRef.current, freqData);
      drawWave(w, h, h * 0.2, 0.01, Math.PI / 4, 0.8, 1.5, timeRef.current, freqData);
      drawWave(w, h, h * 0.1, 0.02, Math.PI, 0.5, 1, timeRef.current, freqData);

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
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
