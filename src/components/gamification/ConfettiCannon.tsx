"use client";

import { useEffect, useRef } from "react";

export interface ConfettiCannonProps {
  /** Starts a burst when it flips to true. */
  active: boolean;
  /** "epic" fires a denser, longer burst — used for level-ups. */
  intensity?: "normal" | "epic";
  /** Called once every particle has settled or left the viewport. */
  onDone?: () => void;
  className?: string;
}

type Shape = "rect" | "ribbon" | "circle";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
  wobble: number;
  wobbleSpeed: number;
  color: string;
  shape: Shape;
  life: number;
  maxLife: number;
}

// Brand orange leads, with cooler accents so the burst does not read as a
// single flat colour on either theme.
const PALETTE = [
  "#f97316",
  "#fb923c",
  "#fdba74",
  "#facc15",
  "#22c55e",
  "#38bdf8",
  "#a78bfa",
  "#f5f5f5",
];

const GRAVITY = 0.14;
const DRAG = 0.994;
const SHAPES: Shape[] = ["rect", "rect", "ribbon", "circle"];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

function createParticle(
  originX: number,
  originY: number,
  angle: number,
  power: number,
  maxLife: number,
): Particle {
  const speed = randomBetween(power * 0.55, power);
  const size = randomBetween(6, 13);
  const shape = pick(SHAPES);

  return {
    x: originX,
    y: originY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    width: size,
    height: shape === "ribbon" ? size * randomBetween(1.6, 2.4) : size,
    rotation: randomBetween(0, Math.PI * 2),
    spin: randomBetween(-0.22, 0.22),
    wobble: randomBetween(0, Math.PI * 2),
    wobbleSpeed: randomBetween(0.04, 0.09),
    color: pick(PALETTE),
    shape,
    life: 0,
    maxLife,
  };
}

/**
 * Procedural confetti on a canvas — no image assets, no runtime dependency.
 *
 * Two side cannons fire inward while a wide top burst rains down, which reads
 * as a celebration rather than as a single mechanical explosion. Honours
 * `prefers-reduced-motion` by rendering nothing at all.
 */
export default function ConfettiCannon({
  active,
  intensity = "normal",
  onDone,
  className,
}: ConfettiCannonProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      onDoneRef.current?.();
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      if (!canvas || !context) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();

    const isEpic = intensity === "epic";
    const sideCount = isEpic ? 90 : 55;
    const rainCount = isEpic ? 110 : 70;
    const maxLife = isEpic ? 320 : 240;

    const particles: Particle[] = [];

    for (let i = 0; i < sideCount; i += 1) {
      particles.push(
        createParticle(
          -10,
          height * randomBetween(0.62, 0.92),
          randomBetween(-Math.PI / 2.6, -Math.PI / 9),
          randomBetween(14, 22),
          maxLife,
        ),
      );
      particles.push(
        createParticle(
          width + 10,
          height * randomBetween(0.62, 0.92),
          Math.PI - randomBetween(-Math.PI / 2.6, -Math.PI / 9),
          randomBetween(14, 22),
          maxLife,
        ),
      );
    }

    for (let i = 0; i < rainCount; i += 1) {
      particles.push(
        createParticle(
          randomBetween(0, width),
          randomBetween(-height * 0.3, -20),
          randomBetween(Math.PI / 3, (2 * Math.PI) / 3),
          randomBetween(2, 6),
          maxLife,
        ),
      );
    }

    function draw() {
      if (!context) return;
      context.clearRect(0, 0, width, height);

      let alive = 0;

      for (const particle of particles) {
        particle.life += 1;
        if (particle.life > particle.maxLife) continue;

        particle.vx *= DRAG;
        particle.vy = particle.vy * DRAG + GRAVITY;
        particle.wobble += particle.wobbleSpeed;
        particle.x += particle.vx + Math.cos(particle.wobble) * 0.7;
        particle.y += particle.vy;
        particle.rotation += particle.spin;

        if (particle.y > height + 40) continue;
        alive += 1;

        const fadeStart = particle.maxLife * 0.72;
        const alpha =
          particle.life <= fadeStart
            ? 1
            : Math.max(
                0,
                1 -
                  (particle.life - fadeStart) / (particle.maxLife - fadeStart),
              );

        context.save();
        context.globalAlpha = alpha;
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;

        if (particle.shape === "circle") {
          context.beginPath();
          context.arc(0, 0, particle.width / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          // Squashing the width by the wobble fakes a paper flip in 3D.
          const squash = Math.abs(Math.cos(particle.wobble));
          context.fillRect(
            -particle.width / 2,
            -particle.height / 2,
            particle.width * (0.35 + squash * 0.65),
            particle.height,
          );
        }

        context.restore();
      }

      if (alive === 0) {
        context.clearRect(0, 0, width, height);
        frameRef.current = null;
        onDoneRef.current?.();
        return;
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      context.clearRect(0, 0, width, height);
    };
  }, [active, intensity]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "pointer-events-none fixed inset-0 z-[95]"}
    />
  );
}
