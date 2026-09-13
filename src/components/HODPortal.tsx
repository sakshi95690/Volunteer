import React, { useState, useEffect, useCallback } from "react";
import type { Festival, Department, Volunteer, HODSession, VolunteerStatus } from "../types";
import {
  Card,
  Field,
  TextInput,
  Select,
  PrimaryButton,
  GhostButton,
  SummaryCard,
  Badge,
  ModalShell,
  formatId,
  reminderMessageLink,
  toCSV,
  downloadCSV,
  STATUS_FLOW,
} from "./Common";
import { IDCard } from "./IDCard";
import { api } from "../api";

export function HODLogin({
  onLogin,
}: {
  onLogin: (session: HODSession) => void;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function attempt() {
    if (!code.trim()) {
      setErr("Please enter your department access code");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await api.hodLogin(code.trim());
      onLogin(res.session);
    } catch (e: any) {
      setErr(e.message || "Invalid access code. Check with your festival admin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", margin: "0 0 4px", textAlign: "center" }}>
        HOD Login
      </h2>
      <p style={{ fontSize: 13.5, color: "#8A8375", margin: "10px 0 18px", textAlign: "center" }}>
        Enter your department's access code to review and approve volunteers.
      </p>
      <Field label="Department Access Code" required error={err}>
        <TextInput
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="e.g. PRAS26"
          style={{ textAlign: "center", letterSpacing: 2, fontFamily: "var(--font-display)", fontSize: 18 }}
          onKeyDown={(e) => e.key === "Enter" && attempt()}
        />
      </Field>
      <PrimaryButton onClick={attempt} disabled={loading}>
        {loading ? "Authenticating…" : "🔐 Log In"}
      </PrimaryButton>
      <p style={{ fontSize: 11.5, color: "#B0A88F", marginTop: 14, textAlign: "center" }}>
        Your access code is shared by the festival admin for your specific department.
      </p>
    </Card>
  );
}

export function HODDashboard({
  session,
  onLogout,
}: {
  session: HODSession;
  onLogout: () => void;
}) {
  const { festival, department } = session;
  const [records, setRecords] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [viewing, setViewing] = useState<Volunteer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getHODRegistrations({
        search: q.trim() || undefined,
        status: fStatus || undefined,
      });
      setRecords(res.volunteers);
    } catch (err) {
      console.error("Failed to load HOD volunteers:", err);
    } finally {
      setLoading(false);
    }
  }, [q, fStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(rec: Volunteer, newStatus: VolunteerStatus) {
    try {
      const updated = await api.updateRegistrationStatus(rec.id, newStatus);
      setRecords((rs) => rs.map((r) => (r.id === rec.id ? updated : r)));
      if (viewing && viewing.id === rec.id) setViewing(updated);
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  }

  async function updateField(rec: Volunteer, fields: Partial<Volunteer>) {
    try {
      const updated = await api.updateRegistration(rec.id, fields);
      setRecords((rs) => rs.map((r) => (r.id === rec.id ? updated : r)));
      if (viewing && viewing.id === rec.id) setViewing(updated);
    } catch (err: any) {
      alert(err.message || "Failed to update volunteer details");
    }
  }

  const counts = {
    total: records.length,
    pending: records.filter((r) => r.status === "Pending for Approval").length,
    approved: records.filter((r) => ["Approved", "Pending for Printing", "Printed"].includes(r.status)).length,
    rejected: records.filter((r) => r.status === "Rejected").length,
  };
  const activeCount = counts.total - counts.rejected;
  const deptCapacity = parseInt(department.capacity as string, 10) || 0;

  function exportCSV() {
    const headers = [
      { label: "Volunteer ID", get: (r: Volunteer) => formatId(festival.code, r.volunteerNumber || r.volunteerId) },
      { label: "Full Name", get: (r: Volunteer) => r.fullName },
      { label: "Contact", get: (r: Volunteer) => r.contact },
      { label: "Email", get: (r: Volunteer) => r.email },
      { label: "Time Slot", get: (r: Volunteer) => r.timeSlot },
      { label: "Age", get: (r: Volunteer) => r.age },
      { label: "Gender", get: (r: Volunteer) => r.gender },
      { label: "Address", get: (r: Volunteer) => r.address },
      { label: "Status", get: (r: Volunteer) => r.status },
    ];
    const csv = toCSV(records, headers);
    downloadCSV(`${department.name.replace(/\s+/g, "-")}-volunteers-${Date.now()}.csv`, csv);
  }

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {department.logoUrl ? (
              <img
                src={department.logoUrl}
                alt=""
                style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover" }}
              />
            ) : (
              <div style={{ fontSize: 26 }}>{department.emoji}</div>
            )}
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink)" }}>
                {department.name}
              </div>
              <div style={{ fontSize: 12, color: "#8A8375" }}>
                {festival.emoji} {festival.name} {festival.dateLabel}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              api.hodLogout();
              onLogout();
            }}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2D9C3",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--primary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Log Out
          </button>
        </div>

        {deptCapacity > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#6B6255", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.04em" }}>Volunteer Capacity</span>
              <span style={{ fontWeight: 700 }}>
                {activeCount} / {deptCapacity}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#E2D9C3", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, (activeCount / deptCapacity) * 100)}%`,
                  background: activeCount >= deptCapacity ? "var(--maroon)" : "var(--primary)",
                }}
              />
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Total Volunteers" value={counts.total} />
        <SummaryCard label="Pending Approval" value={counts.pending} accent="var(--amber)" />
        <SummaryCard label="Approved" value={counts.approved} accent="var(--green)" />
        <SummaryCard label="Rejected" value={counts.rejected} accent="var(--maroon)" />
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
            Department Volunteers
          </h2>
          <button
            onClick={exportCSV}
            disabled={records.length === 0}
            style={{
              background: "var(--gold)",
              border: "none",
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 700,
              color: "#2B1F05",
              cursor: records.length ? "pointer" : "not-allowed",
              opacity: records.length ? 1 : 0.5,
              whiteSpace: "nowrap",
            }}
          >
            ⬇️ CSV ({records.length})
          </button>
        </div>

        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, contact, or Volunteer ID"
          style={{ marginBottom: 10 }}
        />
        <Select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          style={{ fontSize: 12.5, padding: "8px 10px", marginBottom: 16 }}
        >
          <option value="">All Status</option>
          {[...STATUS_FLOW.slice(1), "Rejected"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        {loading ? (
          <p style={{ fontSize: 13, color: "#8A8375" }}>Loading volunteers…</p>
        ) : records.length === 0 ? (
          <p style={{ fontSize: 13, color: "#8A8375" }}>No volunteers found for this department yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {records.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  border: "1px solid #E8E0CE",
                  borderRadius: 10,
                  background: "#FFFFFF",
                  boxShadow: "0 1px 4px rgba(20,65,92,0.03)",
                }}
              >
                <img
                  src={r.photoUrl || (r as any).photo}
                  alt=""
                  onClick={() => setViewing(r)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    objectFit: "cover",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setViewing(r)}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13.5,
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.fullName}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8375" }}>
                    {formatId(festival.code, r.volunteerNumber || r.volunteerId)} · {r.timeSlot?.split(" (")[0]}
                  </div>
                </div>
                {r.status === "Pending for Approval" ? (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => updateStatus(r, "Approved")}
                      style={{
                        background: "#DCEBE1",
                        color: "#1E7B4D",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✅ Approve
                    </button>
                    <button
                      onClick={() => updateStatus(r, "Rejected")}
                      style={{
                        background: "#F6DEE1",
                        color: "#8C2424",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                ) : (
                  <Badge status={r.status} />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {viewing && (
        <ModalShell
          onClose={() => setViewing(null)}
          title={`Volunteer · ${formatId(festival.code, viewing.volunteerNumber || viewing.volunteerId)}`}
        >
          <IDCard record={viewing} festival={festival} />
          <div style={{ marginTop: 16, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.9 }}>
            <div>
              <strong>Email:</strong> {viewing.email || "—"}
            </div>
            <div>
              <strong>Age / Gender:</strong> {viewing.age} · {viewing.gender}
            </div>
            <div>
              <strong>Address:</strong> {viewing.address}
            </div>
          </div>
          {viewing.status === "Pending for Approval" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <PrimaryButton onClick={() => updateStatus(viewing, "Approved")}>
                ✅ Approve Registration
              </PrimaryButton>
              <GhostButton
                onClick={() => updateStatus(viewing, "Rejected")}
                style={{ borderColor: "var(--maroon)", color: "var(--maroon)" }}
              >
                ✕ Reject Registration
              </GhostButton>
            </div>
          )}
          {viewing.status !== "Pending for Approval" && (
            <p style={{ fontSize: 12.5, color: "#8A8375", marginTop: 16, textAlign: "center" }}>
              Printing status is managed by the festival admin.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <a
              href={`tel:${viewing.contact}`}
              style={{
                flex: 1,
                textAlign: "center",
                background: "var(--primary)",
                color: "#FBF7EC",
                borderRadius: 11,
                padding: "13px 10px",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              📞 Call Volunteer
            </a>
            <a
              href={reminderMessageLink(viewing, festival, department)}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                textAlign: "center",
                background: "var(--gold)",
                color: "#2B1F05",
                borderRadius: 11,
                padding: "13px 10px",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              💬 Send Reminder
            </a>
          </div>

          <div style={{ marginTop: 16 }}>
            <Field label="Time Slot" hint="Change this volunteer's assigned time slot">
              <Select
                value={viewing.timeSlot || ""}
                onChange={(e) => updateField(viewing, { timeSlot: e.target.value })}
              >
                {festival.timeSlots.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </ModalShell>
      )}
    </>
  );
}
