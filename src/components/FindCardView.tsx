import React, { useState, useEffect, useCallback } from "react";
import type { Festival, Volunteer } from "../types";
import {
  Card,
  Field,
  TextInput,
  PrimaryButton,
  GoldButton,
  Badge,
} from "./Common";
import { IDCard } from "./IDCard";
import { api } from "../api";

interface Props {
  festivals: Festival[];
  prefillId?: string | null;
}

export function FindCardView({ festivals, prefillId }: Props) {
  const [query, setQuery] = useState(prefillId || "");
  const [results, setResults] = useState<Array<{ volunteer: Volunteer; festival: Festival | null; department: any }> | null>(null);
  const [status, setStatus] = useState<"" | "error" | "notfound">("");
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    const phoneDigits = q.trim().replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setStatus("error");
      setResults(null);
      return;
    }
    setSearching(true);
    setStatus("");

    try {
      const found = await api.findRegistrations(phoneDigits);
      if (found && found.length > 0) {
        setResults(found);
        setStatus("");
      } else {
        setResults(null);
        setStatus("notfound");
      }
    } catch (err) {
      console.error("Search registrations error:", err);
      setResults(null);
      setStatus("notfound");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (prefillId) {
      doSearch(prefillId);
    }
  }, [prefillId, doSearch]);

  return (
    <Card>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, color: "var(--ink)", margin: "0 0 4px" }}>
        Find My Volunteer Card
      </h2>
      <p style={{ fontSize: 13.5, color: "#8A8375", margin: "0 0 18px" }}>
        Enter your registered mobile number to check your status.
      </p>
      <Field label="Mobile Number" required>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="9XXXXXXXXX"
          inputMode="numeric"
          onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
        />
      </Field>
      <PrimaryButton onClick={() => doSearch(query)} disabled={searching}>
        {searching ? "Searching…" : "🔎 Find My Card"}
      </PrimaryButton>

      {status === "error" && (
        <p style={{ color: "var(--maroon)", fontSize: 13.5, marginTop: 12 }}>
          Enter a valid 10-digit mobile number.
        </p>
      )}
      {status === "notfound" && (
        <p style={{ color: "var(--maroon)", fontSize: 13.5, marginTop: 12 }}>
          We couldn't find a registration matching that mobile number. Double check and try again.
        </p>
      )}

      {results &&
        results.map((item) => {
          const result = item.volunteer;
          const festival = item.festival || festivals.find((f) => f.id === result.festivalId);
          const dept = item.department || festival?.departments?.find((d) => d.id === result.departmentId);
          const canSeeCard = ["Approved", "Pending for Printing", "Printed"].includes(result.status);

          return (
            <div
              key={result.id}
              style={{ marginTop: 22, paddingTop: 22, borderTop: "1px solid #EEE7D5" }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  color: "#9A927E",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  marginBottom: 8,
                }}
              >
                {festival ? `${festival.emoji} ${festival.name} ${festival.dateLabel}` : "Festival"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <img
                  src={result.photoUrl || (result as any).photo}
                  alt={result.fullName}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    objectFit: "cover",
                    border: "1.5px solid var(--gold)",
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{result.fullName}</div>
                  <div style={{ fontSize: 13, color: "#8A8375" }}>
                    {dept ? `${dept.emoji} ${dept.name}` : "—"} · {result.timeSlot?.split(" (")[0]}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Badge status={result.status} />
                  </div>
                </div>
              </div>

              {dept && (dept.hodName || dept.hodPhone) && (
                <div
                  style={{
                    background: "#FBF3E0",
                    border: "1px solid #EAD9A8",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11.5, color: "#9A8250", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Your HOD
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)", marginTop: 2 }}>
                      {dept.hodName || "Not set yet"}
                    </div>
                    {dept.hodPhone && (
                      <div style={{ fontSize: 13, color: "#6B6255", marginTop: 1 }}>{dept.hodPhone}</div>
                    )}
                  </div>
                  {dept.hodPhone && (
                    <a
                      href={`tel:${dept.hodPhone}`}
                      style={{
                        background: "var(--gold)",
                        color: "#2B1F05",
                        borderRadius: 9,
                        padding: "9px 14px",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      📞 Call
                    </a>
                  )}
                </div>
              )}

              {dept && dept.instructions && (
                <div
                  style={{
                    background: "#FBF3E0",
                    border: "1px solid #EAD9A8",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#8A5A10", marginBottom: 6 }}>
                    📋 Instructions for {dept.name} Volunteers
                  </div>
                  <div
                    className="rte-content"
                    style={{ fontSize: 13, color: "#6B5A3A", lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: dept.instructions }}
                  />
                </div>
              )}

              {result.status === "Printed" && (
                <div
                  style={{
                    background: "#EAF4EC",
                    border: "1px solid #BFE0C6",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontWeight: 700, color: "var(--green)", fontSize: 14.5 }}>
                    📍 Card Ready for Collection
                  </div>
                  <div style={{ fontSize: 13.5, color: "#3E5C46", marginTop: 4 }}>
                    Please contact your department welcome counter or HOD to collect your badge.
                  </div>
                </div>
              )}

              {canSeeCard ? (
                <>
                  <IDCard record={result} festival={festival} />
                  {dept && dept.groupLink && (
                    <GoldButton
                      style={{ marginTop: 16 }}
                      onClick={() => window.open(dept.groupLink, "_blank")}
                    >
                      👥 Join Your Department Group
                    </GoldButton>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13.5, color: "#8A8375" }}>
                  Your ID card will appear here once your registration is approved.
                </p>
              )}
            </div>
          );
        })}
    </Card>
  );
}
