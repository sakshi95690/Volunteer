import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Festival, Department, Volunteer } from "../types";
import {
  Card,
  Field,
  TextInput,
  Select,
  PrimaryButton,
  GhostButton,
  GoldButton,
  compressImage,
  formatFestivalSchedule,
  formatId,
} from "./Common";
import { IDCard } from "./IDCard";
import { api } from "../api";

interface Props {
  festival: Festival;
  onGoFind: (contact: string) => void;
  onSwitchFestival: () => void;
  multipleFestivals: boolean;
}

export function RegisterView({ festival, onGoFind, onSwitchFestival, multipleFestivals }: Props) {
  const fc = festival.formConfig || {
    email: { enabled: false, required: false },
    age: { enabled: true, required: true },
    gender: { enabled: true, required: true },
    address: { enabled: true, required: true },
  };
  const customFieldDefs = festival.customFields || [];

  const blank = {
    fullName: "",
    contact: "",
    email: "",
    timeSlot: "",
    department: "",
    age: "",
    gender: "",
    address: "",
    photo: "",
    customFields: Object.fromEntries(customFieldDefs.map((c) => [c.id, ""])),
  };

  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState<Volunteer | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>(festival.departments || []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDepartments = useCallback(async () => {
    try {
      const depts = await api.getDepartments(festival.id, true);
      if (depts && depts.length > 0) {
        setDepartments(depts);
      }
    } catch (err) {
      console.error("Failed to load department capacity:", err);
    }
  }, [festival.id]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const activeDepts = departments.filter((d) => d.active);

  function isFull(d: Department) {
    const cap = parseInt(d.capacity as string, 10);
    if (!cap) return false;
    return (d.currentCount || 0) >= cap;
  }

  function set(field: string, val: any) {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function setCustomField(id: string, val: string) {
    setForm((f) => ({ ...f, customFields: { ...f.customFields, [id]: val } }));
    setErrors((prev) => ({ ...prev, [`cf_${id}`]: undefined }));
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      setErrors((er) => ({ ...er, photo: "Please upload a JPG or PNG image." }));
      return;
    }
    setLoadingPhoto(true);
    try {
      const dataUrl = await compressImage(file);
      set("photo", dataUrl);
      setErrors((er) => ({ ...er, photo: undefined }));
    } catch {
      setErrors((er) => ({ ...er, photo: "Could not read that image. Try a different file." }));
    }
    setLoadingPhoto(false);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Full name is required.";
    if (!/^[6-9]\d{9}$/.test(form.contact.trim())) e.contact = "Enter a valid 10-digit mobile number.";
    if (fc.email.enabled && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = "Enter a valid email address.";
    }
    if (fc.email.enabled && fc.email.required && !form.email.trim()) {
      e.email = "Email ID is required.";
    }
    if (!form.timeSlot) e.timeSlot = "Please select a time slot.";
    if (!form.department) e.department = "Please select a department.";
    if (
      fc.age.enabled &&
      fc.age.required &&
      (!form.age || Number(form.age) < 10 || Number(form.age) > 90)
    ) {
      e.age = "Enter a valid age.";
    }
    if (fc.gender.enabled && fc.gender.required && !form.gender) {
      e.gender = "Please select gender.";
    }
    if (fc.address.enabled && fc.address.required && !form.address.trim()) {
      e.address = "Address is required.";
    }
    if (!form.photo) e.photo = "Please upload a photo.";

    customFieldDefs.forEach((c) => {
      if (c.required && !(form.customFields[c.id] || "").trim()) {
        e[`cf_${c.id}`] = `${c.label} is required.`;
      }
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function openPreview() {
    if (!validate()) return;
    setSubmitError(null);
    setShowPreview(true);
  }

  async function submitRegistration() {
    if (!validate()) {
      setShowPreview(false);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await api.createRegistration({
        festivalId: festival.id,
        fullName: form.fullName,
        contact: form.contact,
        email: form.email,
        timeSlot: form.timeSlot,
        departmentId: form.department,
        age: form.age,
        gender: form.gender,
        address: form.address,
        photo: form.photo,
        customFields: form.customFields,
      });

      setSubmitted(res.volunteer);
      setShowPreview(false);
    } catch (err: any) {
      const message = err.message || "Registration submission failed";
      setSubmitError(message);
      if (message.includes("contact number is already registered")) {
        setErrors((er) => ({ ...er, contact: message }));
      } else if (message.includes("capacity")) {
        setErrors((er) => ({ ...er, department: message }));
      }
      loadDepartments();
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    const vNumber = submitted.volunteerNumber || submitted.volunteerId;
    return (
      <Card style={{ textAlign: "center", padding: "20px 16px" }}>
        <div style={{ fontSize: 36 }}>🌸</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--ink)", margin: "8px 0 4px" }}>
          Registration Submitted!
        </h2>
        <p style={{ fontSize: 13, color: "#6B6255", margin: "0 0 14px" }}>
          Your registration is received and pending for approval.
        </p>
        <div
          style={{
            background: "#F8F5EC",
            border: "1px dashed #C9BE9E",
            borderRadius: 12,
            padding: "12px",
            maxWidth: 240,
            margin: "0 auto 16px",
          }}
        >
          <div style={{ fontSize: 11, color: "#9A927E", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            Volunteer ID
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--primary)", fontWeight: 800 }}>
            {formatId(festival.code, vNumber)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PrimaryButton onClick={() => onGoFind(submitted.contact)}>
            🔎 Track Status & Find Card
          </PrimaryButton>
          <GhostButton
            onClick={() => {
              setSubmitted(null);
              setForm(blank);
            }}
          >
            Register Another
          </GhostButton>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card style={{ overflow: "hidden", padding: festival.bannerImageUrl ? 0 : undefined }}>
        {festival.bannerImageUrl && (
          <img
            src={festival.bannerImageUrl}
            alt=""
            style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: festival.bannerImageUrl ? "14px 16px 0" : 0,
            marginBottom: 14,
          }}
        >
          {festival.logoImageUrl ? (
            <img
              src={festival.logoImageUrl}
              alt=""
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                objectFit: "cover",
                border: "1.5px solid var(--gold)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{ fontSize: 22 }}>{festival.emoji}</div>
          )}
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700, color: "var(--ink)" }}>
              {festival.name} {festival.dateLabel}
            </div>
            {formatFestivalSchedule(festival) && (
              <div style={{ fontSize: 11.5, color: "#8A8375", marginTop: 1 }}>{formatFestivalSchedule(festival)}</div>
            )}
            {multipleFestivals && (
              <button
                onClick={onSwitchFestival}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--primary)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Switch Festival
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: festival.bannerImageUrl ? "0 16px 16px" : 0 }}>
          {submitError && (
            <div
              style={{
                background: "#F6DEE1",
                border: "1px solid #E5A8B2",
                color: "var(--maroon)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13.5,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              ⚠️ {submitError}
            </div>
          )}

          <Field label="Full Name" required error={errors.fullName}>
            <TextInput
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              placeholder="As it should appear on your card"
            />
          </Field>

          <Field label="Contact Number" required error={errors.contact} hint="10-digit mobile number">
            <TextInput
              value={form.contact}
              onChange={(e) => set("contact", e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="9XXXXXXXXX"
              inputMode="numeric"
            />
          </Field>

          {fc.email.enabled && (
            <Field
              label="Email ID"
              required={fc.email.required}
              error={errors.email}
              hint={fc.email.required ? undefined : "Optional"}
            >
              <TextInput
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
                type="email"
              />
            </Field>
          )}

          <Field label="Time Slot" required error={errors.timeSlot}>
            <Select value={form.timeSlot} onChange={(e) => set("timeSlot", e.target.value)}>
              <option value="">Select a time slot</option>
              {festival.timeSlots.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Department" required error={errors.department}>
            <Select value={form.department} onChange={(e) => set("department", e.target.value)}>
              <option value="">Select a department</option>
              {activeDepts.map((d) => {
                const cap = parseInt(d.capacity as string, 10);
                const count = d.currentCount || 0;
                const full = isFull(d);
                const label = cap
                  ? `${d.emoji} ${d.name} (${count}/${cap}${full ? " — Full" : ""})`
                  : `${d.emoji} ${d.name}`;
                return (
                  <option key={d.id} value={d.id} disabled={full}>
                    {label}
                  </option>
                );
              })}
            </Select>
          </Field>

          {(() => {
            const selectedDept = activeDepts.find((d) => d.id === form.department);
            if (!selectedDept || !selectedDept.instructions) return null;
            return (
              <div
                style={{
                  background: "#FBF3E0",
                  border: "1px solid #EAD9A8",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "#8A5A10", marginBottom: 3 }}>
                  📋 Note for {selectedDept.name} Volunteers
                </div>
                <div
                  className="rte-content"
                  style={{ fontSize: 12, color: "#6B5A3A", lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: selectedDept.instructions }}
                />
              </div>
            );
          })()}

          {(fc.age.enabled || fc.gender.enabled) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: fc.age.enabled && fc.gender.enabled ? "1fr 1fr" : "1fr",
                gap: 12,
              }}
            >
              {fc.age.enabled && (
                <Field label="Age" required={fc.age.required} error={errors.age}>
                  <TextInput
                    value={form.age}
                    onChange={(e) => set("age", e.target.value.replace(/\D/g, "").slice(0, 2))}
                    inputMode="numeric"
                    placeholder="e.g. 24"
                  />
                </Field>
              )}
              {fc.gender.enabled && (
                <Field label="Gender" required={fc.gender.required} error={errors.gender}>
                  <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </Select>
                </Field>
              )}
            </div>
          )}

          {fc.address.enabled && (
            <Field label="Address" required={fc.address.required} error={errors.address}>
              <textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px 13px",
                  borderRadius: 10,
                  border: "1.5px solid #E1D9C6",
                  fontSize: 15.5,
                  fontFamily: "inherit",
                  color: "var(--ink)",
                  background: "#fff",
                  boxSizing: "border-box",
                  outline: "none",
                  resize: "vertical",
                }}
                placeholder="House no., street, area, city"
              />
            </Field>
          )}

          {customFieldDefs.map((c) => (
            <Field key={c.id} label={c.label} required={c.required} error={errors[`cf_${c.id}`]}>
              <TextInput
                value={form.customFields[c.id] || ""}
                onChange={(e) => setCustomField(c.id, e.target.value)}
              />
            </Field>
          ))}

          <Field
            label="Upload Photo"
            required
            error={errors.photo}
            hint="JPG or PNG · clear face photo"
          >
            <div
              onClick={() => fileRef.current && fileRef.current.click()}
              style={{
                border: "1.5px dashed #C9BE9E",
                borderRadius: 12,
                padding: form.photo ? 10 : 16,
                textAlign: "center",
                cursor: "pointer",
                background: "#FDFBF5",
                transition: "all 0.15s ease",
              }}
            >
              {form.photo ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                  <img
                    src={form.photo}
                    alt="Preview"
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 10,
                      objectFit: "cover",
                      border: "1.5px solid var(--gold)",
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>Change photo</span>
                </div>
              ) : loadingPhoto ? (
                <span style={{ fontSize: 13, color: "#8A8375" }}>Processing photo…</span>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📷</span>
                  <span style={{ fontSize: 13.5, color: "var(--primary)", fontWeight: 600 }}>Tap to upload photo</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handlePhoto}
              style={{ display: "none" }}
            />
          </Field>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            <PrimaryButton onClick={submitRegistration} disabled={submitting}>
              {submitting ? "Submitting Registration…" : "✅ Submit Registration"}
            </PrimaryButton>
            <GhostButton onClick={openPreview}>
              👁️ Preview Card
            </GhostButton>
          </div>
        </div>
      </Card>

      {showPreview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,26,20,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowPreview(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#F4EFE1",
              borderRadius: "18px 18px 0 0",
              padding: "16px 16px 24px",
              width: "100%",
              maxWidth: 440,
              maxHeight: "88vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>Volunteer ID Card Preview</div>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  background: "#EBE4D3",
                  border: "none",
                  borderRadius: "50%",
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  cursor: "pointer",
                  color: "#5A5243",
                }}
              >
                ✕
              </button>
            </div>

            <IDCard
              record={{
                ...form,
                status: "Pending for Approval",
                photoUrl: form.photo,
                departmentId: form.department,
              }}
              festival={festival}
              allowDownload={false}
            />

            {submitError && (
              <div
                style={{
                  background: "#F6DEE1",
                  border: "1px solid #E5A8B2",
                  color: "var(--maroon)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginTop: 10,
                  textAlign: "center",
                }}
              >
                ⚠️ {submitError}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <PrimaryButton onClick={submitRegistration} disabled={submitting}>
                {submitting ? "Submitting Registration…" : "✅ Confirm & Submit"}
              </PrimaryButton>
              <GhostButton onClick={() => setShowPreview(false)}>Back to Form</GhostButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
