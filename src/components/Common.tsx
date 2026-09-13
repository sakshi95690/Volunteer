import React, { useRef, useEffect } from "react";
import type { Festival, Department, Volunteer, VolunteerStatus } from "../types";

export const STATUS_STYLE: Record<VolunteerStatus, { bg: string; fg: string }> = {
  Draft: { bg: "#EAE5D7", fg: "#6B6255" },
  "Pending for Approval": { bg: "#FBF3E0", fg: "#A06B08" },
  Approved: { bg: "#DCEBE1", fg: "#1E7B4D" },
  "Pending for Printing": { bg: "#E5EDF5", fg: "#14415C" },
  Printed: { bg: "#DCEBE1", fg: "#1E7B4D" },
  Rejected: { bg: "#F6DEE1", fg: "#8C2424" },
};

export const STATUS_FLOW: VolunteerStatus[] = [
  "Draft",
  "Pending for Approval",
  "Approved",
  "Pending for Printing",
  "Printed",
];

export function formatId(code?: string, n?: number): string {
  return `${code || "VOL"}-${String(n || 0).padStart(4, "0")}`;
}

export function formatDateShort(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatTimeShort(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatFestivalSchedule(f?: Festival): string {
  if (!f) return "";
  const datePart = f.startDate
    ? f.endDate && f.endDate !== f.startDate
      ? `${formatDateShort(f.startDate)} – ${formatDateShort(f.endDate)}`
      : formatDateShort(f.startDate)
    : "";
  const timePart = f.startTime
    ? f.endTime
      ? `${formatTimeShort(f.startTime)} – ${formatTimeShort(f.endTime)}`
      : formatTimeShort(f.startTime)
    : "";
  return [datePart, timePart].filter(Boolean).join(" · ");
}

export function waLink(phone?: string, message?: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message || "")}`;
}

export function hodMessageLink(dept: Department, festival: Festival): string {
  const schedule = formatFestivalSchedule(festival);
  const lines = [
    `🙏 Hare Krishna, ${dept.hodName || "Devotee"}!`,
    ``,
    `You've been assigned as HOD for the *${dept.name}* department at *${festival.name} ${festival.dateLabel}*.`,
    schedule ? `📅 ${schedule}` : ``,
    ``,
    `Your department login code: *${dept.accessCode}*`,
    `Open the volunteer portal → tap "HOD" → enter this code to review and approve your volunteers.`,
    ``,
    `🙏 Thank you for your service!`,
  ];
  return waLink(dept.hodPhone, lines.join("\n"));
}

export function reminderMessageLink(rec: Volunteer, festival: Festival, dept?: Department | null): string {
  const schedule = formatFestivalSchedule(festival);
  const lines = [
    `🙏 Hare Krishna, ${rec.fullName}!`,
    ``,
    `This is a reminder about your volunteer seva at *${festival.name} ${festival.dateLabel}*.`,
    schedule ? `📅 ${schedule}` : ``,
    `🏷️ Department: ${dept ? dept.name : "—"}`,
    `⏰ Time Slot: ${rec.timeSlot || "—"}`,
    ``,
    `Please arrive on time. Thank you for your valuable service!`,
    `🙏 Hare Krishna!`,
  ];
  return waLink(rec.contact, lines.join("\n"));
}

export function toCSV(rows: any[], headers: Array<{ label: string; get: (r: any) => any }>): string {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = headers.map((h) => esc(h.label)).join(",");
  const lines = rows.map((r) => headers.map((h) => esc(h.get(r))).join(","));
  return [head, ...lines].join("\r\n");
}

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  try {
    link.click();
  } catch (e) {
    console.warn("download click error:", e);
  }
  setTimeout(() => {
    try {
      document.body.removeChild(link);
    } catch {}
    URL.revokeObjectURL(url);
  }, 60000);
}

export function copyToClipboard(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch {
    return false;
  }
}

export function compressImage(file: File, maxDim = 640, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context error"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #E2D9C3",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--ink, #241E15)",
  background: "#FFFFFF",
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s ease",
};

export function Badge({ status }: { status?: VolunteerStatus | string }) {
  const s = STATUS_STYLE[(status as VolunteerStatus) || "Draft"] || STATUS_STYLE.Draft;
  return (
    <span
      className="badge"
      style={{
        background: s.bg,
        color: s.fg,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.1,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {status || "Draft"}
    </span>
  );
}

export function Field({
  label,
  required,
  error,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
  key?: React.Key;
}) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 700,
          color: "#6B6255",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 5,
        }}
      >
        {label} {required && <span style={{ color: "var(--maroon)" }}>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11.5, color: "#8A8375", marginTop: 4 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11.5, color: "var(--maroon)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...inputStyle, ...(props.style || {}), appearance: "none" }}>
      {props.children}
    </select>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
  type = "button",
  id,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
  id?: string;
}) {
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#E2D9C3" : "var(--primary, #14415C)",
        color: disabled ? "#8A8375" : "#FFFFFF",
        border: "none",
        borderRadius: 10,
        padding: "11px 18px",
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        width: "100%",
        letterSpacing: "0.01em",
        boxShadow: disabled ? "none" : "0 3px 10px rgba(20,65,92,0.18)",
        transition: "all 0.15s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  style,
  type = "button",
  id,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  type?: "button" | "submit";
  id?: string;
}) {
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      style={{
        background: "#FBF7EC",
        color: "var(--primary, #14415C)",
        border: "1.5px solid #C9BE9E",
        borderRadius: 10,
        padding: "10px 16px",
        fontSize: 13.5,
        fontWeight: 700,
        cursor: "pointer",
        width: "100%",
        transition: "all 0.15s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function GoldButton({
  children,
  onClick,
  style,
  id,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  id?: string;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      style={{
        background: "var(--gold, #C6961F)",
        color: "#2B1F05",
        border: "none",
        borderRadius: 10,
        padding: "11px 18px",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        width: "100%",
        boxShadow: "0 3px 10px rgba(198,150,31,0.22)",
        transition: "all 0.15s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style, id, className = "" }: { children: React.ReactNode; style?: React.CSSProperties; id?: string; className?: string }) {
  return (
    <div
      id={id}
      className={`card-box ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function TempleMotif({ height = 46 }: { height?: number }) {
  return (
    <svg viewBox="0 0 300 46" height={height} width="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="motifGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#C6961F" stopOpacity="0" />
          <stop offset="0.5" stopColor="#E8C562" stopOpacity="1" />
          <stop offset="1" stopColor="#C6961F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 34 Q75 6 150 34 T300 34" stroke="url(#motifGold)" strokeWidth="1.4" fill="none" />
      <circle cx="150" cy="14" r="4" fill="#E8C562" />
      <circle cx="110" cy="22" r="2" fill="#E8C562" opacity="0.7" />
      <circle cx="190" cy="22" r="2" fill="#E8C562" opacity="0.7" />
    </svg>
  );
}

export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,24,32,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 60,
        padding: "0 8px 8px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF7EC",
          borderRadius: 18,
          border: "1.5px solid #E2D9C3",
          padding: "20px 18px 26px",
          width: "100%",
          maxWidth: 480,
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink)", margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: "#8A8375", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SummaryCard({
  label,
  value,
  accent = "var(--ink, #241E15)",
  full,
}: {
  label: string;
  value: number | string;
  accent?: string;
  full?: boolean;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E8E0CE",
        borderRadius: 12,
        padding: "12px 14px",
        gridColumn: full ? "1 / -1" : "auto",
        boxShadow: "0 2px 8px rgba(20,65,92,0.04)",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8A8375", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: "var(--font-display)" }}>
        {value}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#64748B",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

export function SubTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 12px",
        borderRadius: 8,
        border: active ? "1.5px solid var(--primary, #14415C)" : "1px solid #E2D9C3",
        background: active ? "var(--primary, #14415C)" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#6B6255",
        fontWeight: 700,
        fontSize: 12.5,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

export function ToolBtn({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{
        background: active ? "var(--primary)" : "#FDFBF5",
        color: active ? "#fff" : "var(--ink)",
        border: "1px solid #E1D9C6",
        borderRadius: 7,
        padding: "5px 11px",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function RichTextField({
  label,
  hint,
  initialValue,
  onChange,
  placeholder,
  editorKey,
  rows = 4,
}: {
  label?: string;
  hint?: string;
  initialValue?: string;
  onChange: (val: string) => void;
  placeholder?: string;
  editorKey: string;
  rows?: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (divRef.current) divRef.current.innerHTML = initialValue || "";
  }, [editorKey]);

  function exec(cmd: string) {
    if (divRef.current) divRef.current.focus();
    document.execCommand(cmd, false, undefined);
    if (divRef.current) onChange(divRef.current.innerHTML);
  }

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    onChange(e.currentTarget.innerHTML);
  }

  const content = (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <ToolBtn onClick={() => exec("bold")} title="Bold">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic">
          <em>I</em>
        </ToolBtn>
      </div>
      <div
        key={editorKey}
        ref={divRef}
        className="rte-content"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        style={{ ...inputStyle, minHeight: rows * 24, cursor: "text" }}
      />
    </>
  );

  if (label) {
    return (
      <Field label={label} hint={hint}>
        {content}
      </Field>
    );
  }

  return <div style={{ marginBottom: 12 }}>{content}</div>;
}
