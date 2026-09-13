import React, { useState } from "react";
import JSZip from "jszip";
import type { Festival, Volunteer } from "../types";
import { STATUS_STYLE, TempleMotif, Badge, formatId } from "./Common";

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function sanitizeImageSource(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:image/") || src.startsWith("/")) return src;
  try {
    const url = new URL(src);
    if (
      url.hostname.endsWith("cloudinary.com") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.includes("run.app")
    ) {
      return src;
    }
    console.warn(
      `[IDCard] Image source "${url.hostname}" is not a verified Cloudinary/backend domain. Serving with crossOrigin="anonymous".`
    );
    return src;
  } catch {
    return src;
  }
}

function loadImageSafe(src?: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const sanitized = sanitizeImageSource(src);
    if (!sanitized) return resolve(null);

    const img = new Image();
    const timeout = setTimeout(() => {
      resolve(null);
    }, 2500);

    if (!sanitized.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = sanitized;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx: number, sy: number, sw: number, sh: number;
  if (ir > tr) {
    sh = img.height;
    sw = sh * tr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / tr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

export async function generateCardPng(record: Partial<Volunteer>, festival?: Festival | null): Promise<string> {
  const cardConfig = festival?.cardConfig || {
    primaryColor: "#F27D26",
    accentColor: "#D97706",
    showDepartment: true,
    showContact: true,
    showHOD: true,
    showTimeSlot: true,
  };

  const W = 720,
    H = 1040;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  if (typeof document !== "undefined" && (document as any).fonts && (document as any).fonts.ready) {
    try {
      await (document as any).fonts.ready;
    } catch {}
  }

  // outer rounded frame
  roundRectPath(ctx, 0, 0, W, H, 40);
  ctx.save();
  ctx.clip();

  ctx.fillStyle = "#FBF7EC";
  ctx.fillRect(0, 0, W, H);

  const headerH = 300;
  const grad = ctx.createLinearGradient(0, 0, W, headerH);
  grad.addColorStop(0, cardConfig.primaryColor);
  grad.addColorStop(1, "#0D2E42");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);
  ctx.restore();

  // festival icon top-right
  const iconSize = 56;
  const iconX = W - 40 - iconSize,
    iconY = 36;
  const logoImg = festival?.logoImageUrl ? await loadImageSafe(festival.logoImageUrl) : null;
  if (logoImg) {
    ctx.save();
    roundRectPath(ctx, iconX, iconY, iconSize, iconSize, 14);
    ctx.clip();
    drawImageCover(ctx, logoImg, iconX, iconY, iconSize, iconSize);
    ctx.restore();
  } else {
    ctx.font = "44px serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(festival ? festival.emoji : "🙏", W - 40, iconY - 6);
  }

  ctx.strokeStyle = "rgba(232,197,98,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 132);
  ctx.lineTo(W - 60, 132);
  ctx.stroke();

  ctx.fillStyle = "#F3E0AC";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "600 34px 'Cinzel', serif";
  const festLine = festival ? `${festival.name} ${festival.dateLabel}` : "Volunteer";
  ctx.fillText(truncateToWidth(ctx, festLine, W - 100), W / 2, 210);

  // photo
  const photoSize = 180;
  const photoX = 60,
    photoY = headerH + 60;
  roundRectPath(ctx, photoX, photoY, photoSize, photoSize, 28);
  ctx.fillStyle = "#EFE7D2";
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, photoX, photoY, photoSize, photoSize, 28);
  ctx.clip();
  const photoSrc = record.photoUrl || record.photo;
  const photoImg = photoSrc ? await loadImageSafe(photoSrc) : null;
  if (photoImg) {
    drawImageCover(ctx, photoImg, photoX, photoY, photoSize, photoSize);
  } else {
    ctx.fillStyle = "#F5EFE0";
    ctx.fillRect(photoX, photoY, photoSize, photoSize);
    
    // Crisp decorative devotee avatar fallback
    ctx.fillStyle = cardConfig.primaryColor;
    ctx.beginPath();
    ctx.arc(photoX + photoSize / 2, photoY + photoSize * 0.4, photoSize * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(photoX + photoSize / 2, photoY + photoSize * 0.96, photoSize * 0.42, Math.PI, Math.PI * 2);
    ctx.fill();

    const initials = (record.fullName || "V")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, photoX + photoSize / 2, photoY + photoSize * 0.4);
  }
  ctx.restore();
  ctx.strokeStyle = cardConfig.accentColor;
  ctx.lineWidth = 4;
  roundRectPath(ctx, photoX, photoY, photoSize, photoSize, 28);
  ctx.stroke();

  // name / id / status
  const textX = photoX + photoSize + 36;
  const textMaxW = W - textX - 40;
  ctx.textAlign = "left";
  ctx.fillStyle = "#1C2B3A";
  ctx.font = "600 38px 'Cinzel', serif";
  ctx.fillText(truncateToWidth(ctx, record.fullName || "—", textMaxW), textX, photoY + 46);

  ctx.fillStyle = cardConfig.primaryColor;
  ctx.font = "bold 24px Inter, Arial, sans-serif";
  const vNum = record.volunteerNumber || record.volunteerId;
  const idLabel = vNum ? formatId(festival?.code, vNum) : "ID pending approval";
  ctx.fillText(truncateToWidth(ctx, idLabel, textMaxW), textX, photoY + 84);

  const statusStyle = STATUS_STYLE[record.status || "Draft"] || STATUS_STYLE.Draft;
  const badgeText = record.status || "Draft";
  ctx.font = "bold 20px Inter, Arial, sans-serif";
  const badgeW = Math.min(textMaxW, ctx.measureText(badgeText).width + 40);
  const badgeH = 42;
  const badgeY = photoY + 106;
  ctx.fillStyle = statusStyle.bg;
  roundRectPath(ctx, textX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = statusStyle.fg;
  ctx.textBaseline = "middle";
  ctx.fillText(truncateToWidth(ctx, badgeText, badgeW - 30), textX + 18, badgeY + badgeH / 2 + 1);
  ctx.textBaseline = "alphabetic";

  // detail grid
  const deptId = record.departmentId || record.department;
  const dept = festival ? festival.departments?.find((d) => d.id === deptId) : null;
  const gridY = photoY + photoSize + 64;
  const colW = (W - 160) / 2;

  function detailBlock(label: string, value: string, x: number, y: number, maxWidth: number) {
    if (!ctx) return;
    ctx.textAlign = "left";
    ctx.fillStyle = "#9A927E";
    ctx.font = "bold 15px Inter, Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = "#1C2B3A";
    ctx.font = "600 21px Inter, Arial, sans-serif";
    ctx.fillText(truncateToWidth(ctx, value, maxWidth), x, y + 30);
  }

  const rows: Array<{ label: string; value: string; full: boolean }> = [];
  if (cardConfig.showDepartment) {
    rows.push({
      label: "Department",
      value: dept ? `${dept.emoji} ${dept.name}` : "—",
      full: false,
    });
  }
  if (cardConfig.showContact) {
    rows.push({ label: "Contact", value: record.contact || "—", full: false });
  }
  if (cardConfig.showHOD) {
    rows.push({ label: "HOD Name", value: dept && dept.hodName ? dept.hodName : "—", full: false });
  }
  if (cardConfig.showTimeSlot) {
    rows.push({ label: "Time Slot", value: record.timeSlot || "—", full: true });
  }

  let cursorY = gridY;
  let colIndex = 0;
  for (const row of rows) {
    if (row.full) {
      if (colIndex === 1) {
        cursorY += 92;
        colIndex = 0;
      }
      detailBlock(row.label, row.value, 60, cursorY, W - 120);
      cursorY += 92;
    } else {
      const x = colIndex === 0 ? 60 : 60 + colW + 40;
      detailBlock(row.label, row.value, x, cursorY, colW);
      colIndex += 1;
      if (colIndex === 2) {
        cursorY += 92;
        colIndex = 0;
      }
    }
  }

  try {
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[generateCardPng] toDataURL failed:", err);
    return "";
  }
}

export async function downloadCardPng(record: Partial<Volunteer>, festival?: Festival | null) {
  const dataUrl = await generateCardPng(record, festival);
  if (!dataUrl) {
    throw new Error("Failed to render card PNG");
  }
  const vNum = record.volunteerNumber || record.volunteerId;
  const idLabel = vNum ? formatId(festival?.code, vNum) : "volunteer-card";
  const link = document.createElement("a");
  link.setAttribute("download", `${idLabel}-${(record.fullName || "volunteer").replace(/\s+/g, "-")}.png`);
  link.href = dataUrl;
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
  }, 10000);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function exportCardsZip(
  records: Volunteer[],
  festivalOf: (r: Volunteer) => Festival | null | undefined,
  folderName = "Volunteer-ID-Cards",
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (!records || records.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder(folderName) || zip;

  let done = 0;
  for (const r of records) {
    try {
      const fest = festivalOf(r);
      const dataUrl = await generateCardPng(r, fest);
      if (dataUrl && dataUrl.startsWith("data:image/png;base64,")) {
        const base64 = dataUrl.substring("data:image/png;base64,".length);
        const vNum = r.volunteerNumber || r.volunteerId;
        const idLabel = vNum ? formatId(fest?.code, vNum) : `VOL-${done + 1}`;
        const cleanName = (r.fullName || "Volunteer").replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `${idLabel}-${cleanName}.png`;
        folder.file(filename, base64, { base64: true });
      }
    } catch (err) {
      console.warn(`[exportCardsZip] Error generating card for ${r.fullName}:`, err);
    }
    done += 1;
    if (onProgress) onProgress(done, records.length);
    await delay(25);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const downloadUrl = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", `${folderName}.zip`);
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  try {
    link.click();
  } catch (e) {
    console.warn("zip download click error:", e);
  }
  setTimeout(() => {
    try {
      document.body.removeChild(link);
    } catch {}
    URL.revokeObjectURL(downloadUrl);
  }, 60000);
}

export async function exportCardsBatch(
  records: Volunteer[],
  festivalOf: (r: Volunteer) => Festival | null | undefined,
  onProgress?: (done: number, total: number) => void
) {
  return exportCardsZip(records, festivalOf, "Volunteer-Cards", onProgress);
}

function CardDetail({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={{ fontSize: 10.5, color: "#9A927E", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export function IDCard({
  record,
  festival,
  allowDownload = true,
}: {
  record: Partial<Volunteer>;
  festival?: Festival | null;
  allowDownload?: boolean;
}) {
  const deptId = record.departmentId || record.department;
  const dept = festival ? festival.departments?.find((d) => d.id === deptId) : null;
  const cardConfig = festival?.cardConfig || {
    primaryColor: "#F27D26",
    accentColor: "#D97706",
    showDepartment: true,
    showContact: true,
    showHOD: true,
    showTimeSlot: true,
  };
  const [downloading, setDownloading] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  async function downloadPng() {
    setDownloading(true);
    try {
      await downloadCardPng(record, festival);
    } catch {
      alert("Could not generate the image. Please try again.");
    }
    setDownloading(false);
  }

  const vNum = record.volunteerNumber || record.volunteerId;
  const photoSrc = record.photoUrl || record.photo;

  return (
    <div
      style={{
        width: "100%",
        ["--primary" as any]: cardConfig.primaryColor,
        ["--gold" as any]: cardConfig.accentColor,
      }}
    >
      <div
        className="card-canvas"
        style={{
          width: "100%",
          maxWidth: 320,
          margin: "0 auto",
          borderRadius: 16,
          overflow: "hidden",
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${cardConfig.primaryColor}, ${cardConfig.accentColor})`,
            padding: "16px 16px 12px",
            color: "white",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.9 }}>
              ISKCON SEVA
            </div>
            {festival && festival.logoImageUrl ? (
              <img
                src={festival.logoImageUrl}
                alt=""
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  objectFit: "cover",
                  border: "1px solid rgba(255,255,255,0.6)",
                }}
              />
            ) : (
              <div style={{ fontSize: 18 }}>{festival ? festival.emoji : "🙏"}</div>
            )}
          </div>
          <div
            style={{
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            {festival ? festival.name : "Volunteer"}
          </div>
          <div style={{ fontSize: 10, opacity: 0.92, marginTop: 2, fontWeight: 500 }}>
            Festival Volunteer {festival ? festival.dateLabel : ""}
          </div>
        </div>

        <div style={{ background: "#FFFFFF", padding: "16px 16px 18px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 10,
                overflow: "hidden",
                border: `2px solid #E2E8F0`,
                flexShrink: 0,
                background: "#F1F5F9",
              }}
            >
              {photoSrc && !photoLoadError ? (
                <img
                  src={photoSrc}
                  alt="Volunteer"
                  crossOrigin="anonymous"
                  onError={() => {
                    console.warn(`[IDCard] Preview photo failed to load: ${photoSrc}`);
                    setPhotoLoadError(true);
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : photoLoadError ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 10,
                    textAlign: "center",
                    background: "#FEF2F2",
                    color: "#991B1B",
                    padding: 4,
                  }}
                  title="Photo failed to load from image storage"
                >
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontSize: 9, lineHeight: 1.1, marginTop: 2, fontWeight: 600 }}>Load failed</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoLoadError(false);
                    }}
                    style={{
                      fontSize: 8.5,
                      textDecoration: "underline",
                      background: "none",
                      border: "none",
                      color: "#DC2626",
                      cursor: "pointer",
                      padding: 0,
                      marginTop: 2,
                    }}
                  >
                    Retry photo
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    fontSize: 24,
                  }}
                >
                  🙏
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--earth-dark, #4A3728)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {record.fullName || "—"}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  fontFamily: "monospace",
                  color: "#475569",
                  background: "#F1F5F9",
                  padding: "2px 6px",
                  borderRadius: 4,
                  display: "inline-block",
                  marginTop: 4,
                }}
              >
                {vNum ? formatId(festival?.code, vNum) : "ID pending approval"}
              </div>
              <div style={{ marginTop: 6 }}>
                <Badge status={record.status || "Draft"} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {cardConfig.showDepartment && (
              <CardDetail
                label="Department"
                value={
                  dept ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {dept.logoUrl ? (
                        <img
                          src={dept.logoUrl}
                          alt=""
                          style={{ width: 14, height: 14, borderRadius: 3, objectFit: "cover" }}
                        />
                      ) : (
                        <span>{dept.emoji}</span>
                      )}
                      {dept.name}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
            )}
            {cardConfig.showContact && <CardDetail label="Contact" value={record.contact || "—"} />}
            {cardConfig.showHOD && (
              <CardDetail label="HOD Name" value={dept && dept.hodName ? dept.hodName : "—"} />
            )}
            {cardConfig.showTimeSlot && (
              <CardDetail label="Time Slot" value={record.timeSlot || "—"} full />
            )}
          </div>
        </div>
      </div>

      {allowDownload && (
        <button
          onClick={downloadPng}
          disabled={downloading}
          style={{
            display: "block",
            width: "100%",
            maxWidth: 320,
            margin: "12px auto 0",
            background: "var(--saffron, #F27D26)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 6,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: downloading ? "wait" : "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          {downloading ? "Preparing…" : "⬇️ Download ID Card (PNG)"}
        </button>
      )}

      {allowDownload && photoLoadError && (
        <p
          style={{
            maxWidth: 320,
            margin: "8px auto 0",
            fontSize: 11,
            color: "#B45309",
            textAlign: "center",
          }}
        >
          ⚠️ Photo could not load from storage. The downloaded card will show a photo placeholder unless retried successfully.
        </p>
      )}
    </div>
  );
}
