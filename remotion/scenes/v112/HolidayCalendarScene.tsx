import { CalendarDays, CheckCircle2, Zap } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Badge,
  Counter,
  GlowDot,
  GradientText,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 4 — Calendário Corporativo Inteligente & Ajuste de Capacidade (0–390 frames = 13s)
 *
 * Demonstrates:
 * 1. Automatic holiday ingestion: BrasilAPI (nacionais) + Vila Velha / ES (municipais) + Pontes customizadas.
 * 2. Instant capacity deduction: holiday days receive 0h daily goal.
 * 3. Weekly capacity drops from 40h to 24h in real time across all app views (Meu Tempo, Visão Semanal, HQ, Teams).
 */

export const HolidayCalendarScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [365, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headerSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const calendarSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const capacitySpring = spring({
    frame: frame - 60,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // Week days mock data
  const weekDays = [
    {
      name: "Segunda",
      date: "20/04",
      hours: "08:00",
      status: "work",
      label: "Dia Útil Normal",
      color: theme.brand,
    },
    {
      name: "Terça",
      date: "21/04",
      hours: "00:00",
      status: "holiday",
      label: "Tiradentes (BrasilAPI)",
      sub: "Feriado Nacional",
      color: theme.warning,
    },
    {
      name: "Quarta",
      date: "22/04",
      hours: "08:00",
      status: "work",
      label: "Dia Útil Normal",
      color: theme.brand,
    },
    {
      name: "Quinta",
      date: "23/04",
      hours: "08:00",
      status: "work",
      label: "Dia Útil Normal",
      color: theme.brand,
    },
    {
      name: "Sexta",
      date: "24/04",
      hours: "00:00",
      status: "holiday",
      label: "N. Sra. da Penha (Vila Velha)",
      sub: "Feriado Municipal & Ponte",
      color: theme.azureLight,
    },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot
        x="50%"
        y="25%"
        size={800}
        opacity={0.16}
        color={theme.warning}
      />
      <GlowDot x="80%" y="70%" size={500} opacity={0.1} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 28,
        }}
      >
        {/* Header */}
        <div
          style={{
            transform: `scale(${headerSpring})`,
            opacity: headerSpring,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badge color={theme.warning}>Governança de Jornadas</Badge>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: theme.brandLight,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CalendarDays size={16} /> BrasilAPI + Feriados Municipais &
              Pontes
            </span>
          </div>

          <h2
            style={{
              fontFamily: fonts.display,
              fontSize: 46,
              fontWeight: 700,
              color: theme.white,
              letterSpacing: "-0.02em",
            }}
          >
            Calendário Corporativo &{" "}
            <GradientText>Capacidade Automática</GradientText>
          </h2>

          <p
            style={{
              fontSize: 20,
              color: theme.textMuted,
              maxWidth: 960,
              lineHeight: 1.45,
            }}
          >
            Feriados nacionais e municipais zeram a meta do dia automaticamente
            e recalculam a capacidade da equipe em tempo real
          </p>
        </div>

        {/* Calendar Week Strip */}
        <div
          style={{
            transform: `scale(${calendarSpring})`,
            opacity: calendarSpring,
            display: "flex",
            gap: 18,
            width: "100%",
            maxWidth: 1240,
          }}
        >
          {weekDays.map((day, idx) => {
            const isHoliday = day.status === "holiday";
            const dayCardSpring = spring({
              frame: frame - 40 - idx * 8,
              fps,
              config: { damping: 14, stiffness: 120 },
            });

            return (
              <div
                key={day.name}
                style={{
                  flex: 1,
                  transform: `scale(${dayCardSpring})`,
                  opacity: dayCardSpring,
                  backgroundColor: isHoliday
                    ? "rgba(245, 158, 11, 0.08)"
                    : theme.bgCard,
                  border: `1px solid ${
                    isHoliday ? `${day.color}60` : theme.borderLight
                  }`,
                  borderRadius: 18,
                  padding: "24px 18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 12,
                  boxShadow: isHoliday
                    ? `0 15px 35px rgba(245, 158, 11, 0.15)`
                    : "0 15px 30px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: isHoliday ? day.color : theme.textMuted,
                  }}
                >
                  {day.name}
                </div>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 20,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  {day.date}
                </div>

                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    backgroundColor: isHoliday
                      ? `${day.color}25`
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${
                      isHoliday ? day.color : theme.border
                    }40`,
                    fontFamily: fonts.mono,
                    fontSize: 16,
                    fontWeight: 700,
                    color: isHoliday ? day.color : theme.brandLight,
                  }}
                >
                  Meta: {day.hours}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: isHoliday ? theme.white : theme.textDimmed,
                    fontWeight: isHoliday ? 600 : 400,
                    lineHeight: 1.3,
                    minHeight: 32,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <span>{day.label}</span>
                  {day.sub && (
                    <span style={{ fontSize: 11, color: theme.textMuted }}>
                      {day.sub}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Capacity Impact Card */}
        <div
          style={{
            transform: `scale(${capacitySpring})`,
            opacity: capacitySpring,
            width: "100%",
            maxWidth: 1240,
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.borderLight}`,
            borderRadius: 20,
            padding: "24px 36px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: `${theme.brand}20`,
                border: `1px solid ${theme.brand}50`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={26} color={theme.brand} />
            </div>

            <div>
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: 20,
                  fontWeight: 700,
                  color: theme.white,
                  marginBottom: 4,
                }}
              >
                Cálculo Dinâmico de Capacidade Semanal
              </div>
              <div style={{ fontSize: 14, color: theme.textMuted }}>
                2 feriados identificados na semana • 16h deduzidas
                automaticamente da jornada padrão
              </div>
            </div>
          </div>

          {/* Animated Counter */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: theme.textDimmed }}>
                Jornada Esperada
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: theme.brandLight,
                  fontFamily: fonts.mono,
                }}
              >
                <Counter
                  from={40}
                  to={24}
                  startFrame={70}
                  durationFrames={45}
                  suffix="h00"
                />
              </div>
            </div>

            <div
              style={{
                padding: "8px 16px",
                borderRadius: 12,
                backgroundColor: `${theme.success}20`,
                border: `1px solid ${theme.success}50`,
                color: theme.success,
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CheckCircle2 size={16} /> Meta Ajustada
            </div>
          </div>
        </div>

        {/* Surfaces pill bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 14,
            color: theme.textMuted,
          }}
        >
          <span style={{ fontWeight: 600, color: theme.white }}>
            Refletido em:
          </span>
          <span style={{ color: theme.brandLight }}>Meu Tempo</span>
          <span>•</span>
          <span style={{ color: theme.azureLight }}>Visão Semanal</span>
          <span>•</span>
          <span style={{ color: theme.brandLight }}>HQ Executivo</span>
          <span>•</span>
          <span style={{ color: theme.purple }}>Teams Bot</span>
          <span>•</span>
          <span style={{ color: theme.success }}>MCP Server</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
