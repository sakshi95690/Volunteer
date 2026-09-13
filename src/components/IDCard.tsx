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

  const deptId = record.departmentId || record.department;
  const dept = festival ? festival.departments?.find((d) => d.id === deptId) : null;
  const vNum = record.volunteerNumber || record.volunteerId;
  const idLabel = vNum ? formatId(festival?.code, vNum) : "ID pending approval";
  const photoSrc = record.photoUrl || record.photo;

  // ---- Build the exact same field list / grid rows that the on-screen
  // IDCard preview produces (mirrors its CSS grid auto-placement) ----
  type RowItem = { label: string; value: string; emoji?: string };
  const fieldItems: RowItem[] = [];
  if (cardConfig.showDepartment) {
    fieldItems.push({
      label: "Department",
      value: dept ? dept.name : "—",
      emoji: dept && !dept.logoUrl ? dept.emoji : undefined,
    });
  }
  if (cardConfig.showContact) {
    fieldItems.push({ label: "Contact", value: record.contact || "—" });
  }
  if (cardConfig.showHOD) {
    fieldItems.push({ label: "HOD Name", value: dept && dept.hodName ? dept.hodName : "—" });
  }
  const fullItem: RowItem | null = cardConfig.showTimeSlot
    ? { label: "Time Slot", value: record.timeSlot || "—" }
    : null;

  type Row = { cells: (RowItem | null)[]; full: boolean; item?: RowItem };
  const rows: Row[] = [];
  let pending: (RowItem | null)[] | null = null;
  let col = 0;
  for (const it of fieldItems) {
    if (!pending) pending = [null, null];
    pending[col] = it;
    col += 1;
    if (col === 2) {
      rows.push({ cells: pending, full: false });
      pending = null;
      col = 0;
    }
  }
  if (pending) {
    rows.push({ cells: pending, full: false });
  }
  if (fullItem) {
    rows.push({ cells: [fullItem, fullItem], full: true, item: fullItem });
  }

  // ---- Layout constants: identical px values to the IDCard preview JSX
  // (maxWidth 320, 16px paddings, 72px photo, etc.) scaled up for a crisp PNG ----
  const SCALE = 3;
  const CARD_W = 320;
  const RADIUS = 16;
  const HEADER_PAD_TOP = 16,
    HEADER_PAD_X = 16,
    HEADER_PAD_BOTTOM = 12;
  const BODY_PAD_X = 16,
    BODY_PAD_TOP = 16,
    BODY_PAD_BOTTOM = 18;
  const PHOTO_SIZE = 72;
  const ROW_H = 32;
  const ROW_GAP = 8;
  const HEADER_ROW1_H = 24;
  const FESTIVAL_NAME_H = 17;
  const SUBTITLE_H = 12;

  const headerH = HEADER_PAD_TOP + HEADER_ROW1_H + 4 + FESTIVAL_NAME_H + 2 + SUBTITLE_H + HEADER_PAD_BOTTOM;
  const gridH = rows.length ? rows.length * ROW_H + (rows.length - 1) * ROW_GAP : 0;
  const bodyH = BODY_PAD_TOP + PHOTO_SIZE + (gridH ? 14 + gridH : 0) + BODY_PAD_BOTTOM;
  const CARD_H = headerH + bodyH;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(SCALE, SCALE);

  if (typeof document !== "undefined" && (document as any).fonts && (document as any).fonts.ready) {
    try {
      await (document as any).fonts.ready;
    } catch {}
  }

  const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

  function drawDetail(item: RowItem, x: number, y: number, maxWidth: number) {
    if (!ctx) return;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#9A927E";
    ctx.font = `700 10.5px ${FONT}`;
    ctx.fillText(item.label.toUpperCase(), x, y);
    ctx.fillStyle = "#241E15";
    ctx.font = `600 13.5px ${FONT}`;
    const prefix = item.emoji ? `${item.emoji} ` : "";
    ctx.fillText(truncateToWidth(ctx, prefix + item.value, maxWidth), x, y + 14);
  }

  // ---- outer rounded white card ----
  roundRectPath(ctx, 0, 0, CARD_W, CARD_H, RADIUS);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ---- header gradient (matches: linear-gradient(135deg, primary, accent)) ----
  const grad = ctx.createLinearGradient(0, 0, CARD_W, headerH);
  grad.addColorStop(0, cardConfig.primaryColor);
  grad.addColorStop(1, cardConfig.accentColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, headerH);

  let hy = HEADER_PAD_TOP;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText("ISKCON SEVA", HEADER_PAD_X, hy + 5);

  const logoSize = 24;
  const logoX = CARD_W - HEADER_PAD_X - logoSize;
  const logoImg = festival?.logoImageUrl ? await loadImageSafe(festival.logoImageUrl) : null;
  if (logoImg) {
    ctx.save();
    roundRectPath(ctx, logoX, hy, logoSize, logoSize, 6);
    ctx.clip();
    drawImageCover(ctx, logoImg, logoX, hy, logoSize, logoSize);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    roundRectPath(ctx, logoX, hy, logoSize, logoSize, 6);
    ctx.stroke();
  } else {
    ctx.font = "18px serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(festival ? festival.emoji : "🙏", CARD_W - HEADER_PAD_X, hy + 2);
  }

  hy += HEADER_ROW1_H + 4;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 14px ${FONT}`;
  const festName = (festival ? festival.name : "Volunteer").toUpperCase();
  ctx.fillText(truncateToWidth(ctx, festName, CARD_W - HEADER_PAD_X * 2), CARD_W / 2, hy);

  hy += FESTIVAL_NAME_H + 2;
  ctx.font = `500 10px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const subtitle = `Festival Volunteer ${festival ? festival.dateLabel : ""}`.trim();
  ctx.fillText(truncateToWidth(ctx, subtitle, CARD_W - HEADER_PAD_X * 2), CARD_W / 2, hy);

  // ---- body: photo + name/id/status ----
  const photoX = BODY_PAD_X;
  const photoY = headerH + BODY_PAD_TOP;

  roundRectPath(ctx, photoX, photoY, PHOTO_SIZE, PHOTO_SIZE, 10);
  ctx.fillStyle = "#F1F5F9";
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, photoX, photoY, PHOTO_SIZE, PHOTO_SIZE, 10);
  ctx.clip();
  const photoImg = photoSrc ? await loadImageSafe(photoSrc) : null;
  if (photoImg) {
    drawImageCover(ctx, photoImg, photoX, photoY, PHOTO_SIZE, PHOTO_SIZE);
  } else {
    ctx.font = "28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1C2B3A";
    ctx.fillText("🙏", photoX + PHOTO_SIZE / 2, photoY + PHOTO_SIZE / 2 + 2);
  }
  ctx.restore();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 2;
  roundRectPath(ctx, photoX, photoY, PHOTO_SIZE, PHOTO_SIZE, 10);
  ctx.stroke();

  const textX = photoX + PHOTO_SIZE + 12;
  const textMaxW = CARD_W - BODY_PAD_X - textX;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#4A3728";
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(truncateToWidth(ctx, record.fullName || "—", textMaxW), textX, photoY + 2);

  const idY = photoY + 2 + 19;
  ctx.font = `11.5px monospace`;
  const idPadX = 6;
  const idW = Math.min(textMaxW, ctx.measureText(idLabel).width + idPadX * 2);
  ctx.fillStyle = "#F1F5F9";
  roundRectPath(ctx, textX, idY, idW, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#475569";
  ctx.fillText(truncateToWidth(ctx, idLabel, idW - idPadX * 2), textX + idPadX, idY + 3);

  const badgeY = idY + 18 + 6;
  const statusStyle = STATUS_STYLE[record.status || "Draft"] || STATUS_STYLE.Draft;
  const badgeText = record.status || "Draft";
  ctx.font = `700 11px ${FONT}`;
  const badgeW = Math.min(textMaxW, ctx.measureText(badgeText).width + 18);
  const badgeH = 18;
  ctx.fillStyle = statusStyle.bg;
  roundRectPath(ctx, textX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = statusStyle.fg;
  ctx.textBaseline = "middle";
  ctx.fillText(truncateToWidth(ctx, badgeText, badgeW - 18), textX + 9, badgeY + badgeH / 2 + 1);
  ctx.textBaseline = "top";

  // ---- detail grid (Department / Contact / HOD Name / Time Slot) ----
  if (rows.length) {
    let gy = photoY + PHOTO_SIZE + 14;
    const colW = (CARD_W - BODY_PAD_X * 2 - 8) / 2;
    for (const row of rows) {
      if (row.full && row.item) {
        drawDetail(row.item, BODY_PAD_X, gy, CARD_W - BODY_PAD_X * 2);
      } else {
        row.cells.forEach((cell, i) => {
          if (!cell) return;
          const cx = BODY_PAD_X + i * (colW + 8);
          drawDetail(cell, cx, gy, colW);
        });
      }
      gy += ROW_H + ROW_GAP;
    }
  }

  ctx.restore(); // outer clip

  // ---- 1px card border (matches: border: "1px solid #E2E8F0") ----
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  roundRectPath(ctx, 0.5, 0.5, CARD_W - 1, CARD_H - 1, RADIUS);
  ctx.stroke();

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
