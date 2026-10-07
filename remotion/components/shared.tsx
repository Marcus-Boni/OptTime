import type React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts, theme } from "../theme";

/* ── Official OptSolv Brand Logo Mark ── */
export const OptSolvLogo: React.FC<{
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ size = 28, color = "#FEF9F6", style }) => (
  <svg
    width={size}
    height={Math.round(size * 1.5)}
    viewBox="0 0 22 33"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: "block", flexShrink: 0, ...style }}
    aria-label="OptSolv Logo"
  >
    <title>OptSolv Logo</title>
    <path
      d="M20.4456 5.94912L10.1852 0.815186V3.94402L21.1289 9.41962V7.05441C21.1289 6.58606 20.8646 6.1581 20.4456 5.94862V5.94912Z"
      fill={color}
    />
    <path
      d="M14.0962 17.213V15.7062C14.0962 14.9755 13.6647 14.3136 12.9964 14.0189L0.798737 8.63754V11.7664L11.3549 16.0683L11.3589 16.4594L11.3549 16.8504L0.798737 21.1524V24.2812L12.9964 18.8999C13.6647 18.6051 14.0962 17.9432 14.0962 17.2125V17.213Z"
      fill={color}
    />
    <path
      d="M10.1852 32.1041L20.4456 26.9701C20.8641 26.7607 21.1289 26.3327 21.1289 25.8644V23.4991L10.1852 28.9747V32.1041Z"
      fill={color}
    />
    <path
      d="M20.3538 14.368C20.3538 12.7779 19.4421 11.3284 18.0086 10.6401L0.805699 2.37985V5.5087L16.8868 13.1789C17.3322 13.3914 17.6155 13.8408 17.6155 14.3341V18.5857C17.6155 19.079 17.3317 19.5284 16.8868 19.7408L0.805699 27.4111V30.5399L18.0086 22.2796C19.4421 21.5913 20.3538 20.1419 20.3538 18.5518V14.368Z"
      fill={color}
    />
  </svg>
);

/* ── Official Microsoft Azure DevOps Brand Logo SVG ── */
export const AzureDevOpsLogo: React.FC<{
  size?: number;
  style?: React.CSSProperties;
}> = ({ size = 36, style }) => (
  <Img
    src={staticFile("azure-devops-logo.svg")}
    style={{
      width: size,
      height: size,
      display: "block",
      flexShrink: 0,
      objectFit: "contain",
      ...style,
    }}
  />
);

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
  color?: string;
}> = ({ size = 400, x, y, opacity = 0.12, color = theme.brand }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
          alignItems: "center",
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
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <OptSolvLogo size={14} color={theme.brand} />
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

/* ── Official Microsoft Teams Mark SVG ── */
export const TeamsLogoMark: React.FC<{
  size?: number;
  style?: React.CSSProperties;
}> = ({ size = 32, style }) => (
  <svg
    width={size}
    height={Math.round((size * 2073.333) / 2228.833)}
    viewBox="0 0 2228.833 2073.333"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: "block", flexShrink: 0, ...style }}
    aria-label="Microsoft Teams"
  >
    <title>Microsoft Teams</title>
    <path
      fill="#5059C9"
      d="M1554.637 777.5h575.713c54.391 0 98.483 44.092 98.483 98.483v524.398c0 199.901-162.051 361.952-361.952 361.952h-1.711c-199.901.028-361.975-162-362.004-361.901V828.971c0-28.427 23.044-51.471 51.471-51.471z"
    />
    <circle fill="#5059C9" cx="1943.75" cy="440.583" r="233.25" />
    <circle fill="#7B83EB" cx="1218.083" cy="336.917" r="336.917" />
    <path
      fill="#7B83EB"
      d="M1667.323 777.5H717.01c-53.743 1.33-96.257 45.931-95.01 99.676v598.105c-7.505 322.519 247.657 590.16 570.167 598.053 322.51-7.893 577.671-275.534 570.167-598.053V877.176c1.247-53.745-41.266-98.346-95.011-99.676z"
    />
    <path
      opacity=".1"
      d="M1244 777.5v838.145c-.258 38.435-23.549 72.964-59.09 87.598a94.81 94.81 0 0 1-35.765 7.257H667.613a516.02 516.02 0 0 1-18.142-51.833c-18.144-59.477-27.402-121.307-27.472-183.49V877.02c-1.246-53.659 41.198-98.19 94.855-99.52H1244z"
    />
    <linearGradient
      id="remotion-teams-logo-gradient"
      gradientUnits="userSpaceOnUse"
      x1="198.099"
      y1="1683.0726"
      x2="942.2344"
      y2="394.2607"
      gradientTransform="matrix(1 0 0 -1 0 2075.3333)"
    >
      <stop offset="0" stopColor="#5a62c3" />
      <stop offset=".5" stopColor="#4d55bd" />
      <stop offset="1" stopColor="#3940ab" />
    </linearGradient>
    <path
      fill="url(#remotion-teams-logo-gradient)"
      d="M95.01 466.5h950.312c52.473 0 95.01 42.538 95.01 95.01v950.312c0 52.473-42.538 95.01-95.01 95.01H95.01c-52.473 0-95.01-42.538-95.01-95.01V561.51c0-52.472 42.538-95.01 95.01-95.01z"
    />
    <path
      fill="#FFF"
      d="M820.211 828.193H630.241v517.297H509.211V828.193H320.123V727.844h500.088v100.349z"
    />
  </svg>
);
