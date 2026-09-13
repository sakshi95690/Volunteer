import React from "react";
import type { Festival } from "../types";
import { Card, formatFestivalSchedule } from "./Common";

interface Props {
  festivals: Festival[];
  onPick: (id: string) => void;
}

export function FestivalPicker({ festivals, onPick }: Props) {
  const active = festivals.filter((f) => f.active);

  return (
    <Card>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>
        Choose a Festival
      </h2>
      <p style={{ fontSize: 13.5, color: "#8A8375", margin: "0 0 18px" }}>
        Select which event you'd like to volunteer for.
      </p>
      {active.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#8A8375" }}>
          No festivals are currently open for registration. Please check back soon.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {active.map((f) => (
            <button
              key={f.id}
              onClick={() => onPick(f.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                border: "1.5px solid #E9E1CC",
                borderRadius: 13,
                background: "#FDFBF5",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  overflow: "hidden",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                {f.logoImageUrl ? (
                  <img
                    src={f.logoImageUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}
                  />
                ) : (
                  f.emoji
                )}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{f.name}</div>
                <div style={{ fontSize: 12.5, color: "#8A8375" }}>
                  {formatFestivalSchedule(f) || f.dateLabel}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
