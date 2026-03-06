import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts, theme } from "../theme";

/* ── Fade wrapper ── */
export const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  durationFrames?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, durationFrames = 20, style }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [delay, delay + durationFrames], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>
      {children}
    </div>
  );
};

/* ── Scale-in with spring ── */
export const ScaleIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
}> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity: scale,
      }}
    >
      {children}
    </div>
  );
};

/* ── Gradient text ── */
export const GradientText: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <span
    style={{
      background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

/* ── Glow dot ── */
export const GlowDot: React.FC<{
  size?: number;
  x: number | string;
  y: number | string;
  opacity?: number;
}> = ({ size = 400, x, y, opacity = 0.12 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: size,
      height: size,
      borderRadius: "50%",
      background: theme.brand,
      opacity,
      filter: `blur(${size / 3}px)`,
      pointerEvents: "none",
    }}
  />
);

/* ── Full-screen dark background ── */
export const DarkBg: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.bg,
      fontFamily: fonts.body,
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

/* ── Badge pill ── */
export const Badge: React.FC<{
  children: React.ReactNode;
  color?: string;
}> = ({ children, color = theme.brand }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "6px 18px",
      borderRadius: 999,
      fontSize: 18,
      fontWeight: 600,
      fontFamily: fonts.body,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}
  >
    {children}
  </span>
);

/* ── Mock browser chrome ── */
export const BrowserFrame: React.FC<{
  children: React.ReactNode;
  url?: string;
}> = ({ children, url = "app.optsolv.com" }) => (
  <div
    style={{
      borderRadius: 16,
      border: `1px solid ${theme.border}`,
      overflow: "hidden",
      boxShadow: `0 40px 100px ${theme.brandGlow}, 0 0 0 1px ${theme.border}`,
    }}
  >
    {/* Title bar */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        background: "#1a1a1a",
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div
            key={c}
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: c,
            }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "#262626",
            borderRadius: 8,
            padding: "4px 24px",
            fontSize: 14,
            color: theme.textMuted,
            fontFamily: fonts.mono,
          }}
        >
          {url}
        </div>
      </div>
    </div>
    {/* Content */}
    <div style={{ background: theme.bg }}>{children}</div>
  </div>
);

/* ── Animated counter ── */
export const Counter: React.FC<{
  from: number;
  to: number;
  startFrame?: number;
  durationFrames?: number;
  suffix?: string;
  style?: React.CSSProperties;
}> = ({
  from,
  to,
  startFrame = 0,
  durationFrames = 40,
  suffix = "",
  style,
}) => {
  const frame = useCurrentFrame();
  const value = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [from, to],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <span style={{ fontFamily: fonts.mono, ...style }}>
      {Math.round(value)}
      {suffix}
    </span>
  );
};
