import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Festival, Department, Volunteer, VolunteerStatus } from "../types";
import {
  Card,
  Field,
  TextInput,
  Select,
  PrimaryButton,
  GhostButton,
  GoldButton,
  SummaryCard,
  SectionLabel,
  SubTabButton,
  Badge,
  ModalShell,
  RichTextField,
  compressImage,
  formatId,
  formatDateShort,
  formatFestivalSchedule,
  hodMessageLink,
  reminderMessageLink,
  toCSV,
  downloadCSV,
  copyToClipboard,
  STATUS_FLOW,
} from "./Common";
import { IDCard, exportCardsBatch, exportCardsZip, downloadCardPng } from "./IDCard";
import { api } from "../api";

const PRESET_TEMPLATES = [
  {
    name: "Sri Krishna Janmashtami",
    code: "JANM",
    emoji: "🦚",
    dateLabel: "2026",
    color: "#14415C",
    accent: "#C6961F",
  },
  {
    name: "Ratha Yatra",
    code: "RATH",
    emoji: "🛞",
    dateLabel: "2026",
    color: "#8C2B3A",
    accent: "#E8C562",
  },
  {
    name: "Gaura Purnima",
    code: "GAUR",
    emoji: "🌕",
    dateLabel: "2026",
    color: "#8A5A10",
    accent: "#E8C562",
  },
  {
    name: "Govardhan Puja",
    code: "GOVD",
    emoji: "🪨",
    dateLabel: "2026",
    color: "#256042",
    accent: "#E8C562",
  },
  {
    name: "Gita Jayanti",
    code: "GITA",
    emoji: "📖",
    dateLabel: "2026",
    color: "#3F3B8C",
    accent: "#E8C562",
  },
];

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function attempt() {
    if (!pass.trim()) {
      setErr("Password is required");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      await api.adminLogin(pass.trim());
      onLogin();
    } catch (e: any) {
      setErr(e.message || "Incorrect admin credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", margin: "0 0 4px", textAlign: "center" }}>
        Admin Access
      </h2>
      <p style={{ fontSize: 13.5, color: "#8A8375", margin: "10px 0 18px", textAlign: "center" }}>
        Enter your administrator password to manage festivals, departments, and volunteers.
      </p>
      <Field label="Password" required error={err}>
        <TextInput
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Enter admin password"
          onKeyDown={(e) => e.key === "Enter" && attempt()}
        />
      </Field>
      <PrimaryButton onClick={attempt} disabled={loading}>
        {loading ? "Logging In…" : "🔐 Enter Portal"}
      </PrimaryButton>
    </Card>
  );
}

export function AdminPortal({
  festivals,
  onRefreshFestivals,
  onLogout,
}: {
  festivals: Festival[];
  onRefreshFestivals: () => Promise<void>;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "festivals" | "departments" | "slots" | "form" | "card" | "registrations">("overview");
  const [selectedFestId, setSelectedFestId] = useState<string>(festivals[0]?.id || "");
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loadingVols, setLoadingVols] = useState(false);
  const [showArchivedVols, setShowArchivedVols] = useState(false);

  // Filters for registrations
  const [fDept, setFDept] = useState("");
  const [fSlot, setFSlot] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [viewingVol, setViewingVol] = useState<Volunteer | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  // Archive & status tabs
  const [festFilter, setFestFilter] = useState<"all" | "active" | "draft" | "archived">("all");
  const [deptFilter, setDeptFilter] = useState<"active" | "archived">("active");
  const [allFestivalsWithArchived, setAllFestivalsWithArchived] = useState<Festival[]>([]);
  const [allDeptsWithArchived, setAllDeptsWithArchived] = useState<Department[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Record<string, boolean>>({});

  // Input states for Slots & Custom fields
  const [newSlotText, setNewSlotText] = useState("");
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomRequired, setNewCustomRequired] = useState(false);

  // Department modal state
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [isNewDept, setIsNewDept] = useState(false);

  // Festival modal state
  const [editingFest, setEditingFest] = useState<Festival | null>(null);
  const [isNewFest, setIsNewFest] = useState(false);

  // In-app confirmation dialog state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  // In-app toast feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [copiedFestId, setCopiedFestId] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 3500);
  }, []);

  const selectedFest = festivals.find((f) => f.id === selectedFestId) || festivals[0];

  const loadArchivedFestivals = useCallback(async () => {
    try {
      const list = await api.getFestivals(false, true);
      setAllFestivalsWithArchived(list);
    } catch (err) {
      console.error("Failed to load festivals with archive:", err);
    }
  }, []);

  const loadArchivedDepts = useCallback(async () => {
    if (!selectedFestId) return;
    try {
      const list = await api.getDepartments(selectedFestId, false, true);
      setAllDeptsWithArchived(list);
    } catch (err) {
      console.error("Failed to load departments with archive:", err);
    }
  }, [selectedFestId]);

  useEffect(() => {
    loadArchivedFestivals();
  }, [festivals, loadArchivedFestivals]);

  useEffect(() => {
    loadArchivedDepts();
  }, [selectedFestId, festivals, loadArchivedDepts]);

    const loadVolunteers = useCallback(async () => {
    setLoadingVols(true);
    try {
      const MAX_PAGES = 100; // safety ceiling: 100 * 500 = 50,000 records
      const baseParams = {
        festivalId: selectedFestId || undefined,
        departmentId: fDept || undefined,
        timeSlot: fSlot || undefined,
        status: fStatus || undefined,
        search: fSearch.trim() || undefined,
        includeArchived: showArchivedVols,
      };

      let page = 1;
      let all: Volunteer[] = [];
      let total = 0;
      let totalPages = 1;

      do {
        const res = await api.getRegistrations({ ...baseParams, page, limit: 500 });
        total = res.total;
        totalPages = res.totalPages;
        all = all.concat(res.volunteers);
        page += 1;
      } while (page <= totalPages && page <= MAX_PAGES);

      if (all.length < total) {
        console.error(`[loadVolunteers] Safety cap hit — loaded ${all.length} of ${total} volunteers.`);
        showToast(
          `Warning: only loaded ${all.length} of ${total} volunteers (too many to display safely). Contact support.`,
          "error"
        );
      }

      setVolunteers(all);
    } catch (err) {
      console.error("Failed to load registrations:", err);
    } finally {
      setLoadingVols(false);
    }
  }, [selectedFestId, fDept, fSlot, fStatus, fSearch, showArchivedVols]);

  useEffect(() => {
    if (activeTab === "overview" || activeTab === "registrations") {
      loadVolunteers();
    }
  }, [activeTab, loadVolunteers]);

  // Overall Stats
  const counts = {
    total: volunteers.length,
    draft: volunteers.filter((v) => v.status === "Draft").length,
    pendingApproval: volunteers.filter((v) => v.status === "Pending for Approval").length,
    approved: volunteers.filter((v) => v.status === "Approved").length,
    pendingPrint: volunteers.filter((v) => v.status === "Pending for Printing").length,
    printed: volunteers.filter((v) => v.status === "Printed").length,
    rejected: volunteers.filter((v) => v.status === "Rejected").length,
  };

  async function updateVolStatus(id: string, newStatus: VolunteerStatus) {
    try {
      const updated = await api.updateRegistrationStatus(id, newStatus);
      setVolunteers((prev) => prev.map((v) => (v.id === id ? updated : v)));
      if (viewingVol && viewingVol.id === id) setViewingVol(updated);
      showToast(`Status updated to ${newStatus}`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
    }
  }

  async function handleBatchCards() {
    const selectedList = volunteers.filter((v) => selectedIds[v.id]);
    const targetList = selectedList.length > 0 ? selectedList : volunteers;
    if (targetList.length === 0) {
      showToast("No volunteers available to export cards.", "info");
      return;
    }
    const folderName = `${(selectedFest?.code || "Festival").toUpperCase()}-Cards-${selectedList.length > 0 ? "Selected" : "All"}`;
    setBatchProgress({ done: 0, total: targetList.length });
    try {
      await exportCardsZip(
        targetList,
        (r) => festivals.find((f) => f.id === r.festivalId) || selectedFest,
        folderName,
        (done, total) => setBatchProgress({ done, total })
      );
      showToast(`Successfully exported ${targetList.length} cards to ${folderName}.zip!`, "success");
    } catch (err: any) {
      showToast("Failed to export cards: " + (err?.message || "Unknown error"), "error");
    } finally {
      setTimeout(() => setBatchProgress(null), 1500);
    }
  }

  function handleExportCSV() {
    if (!volunteers || volunteers.length === 0) {
      showToast("No volunteers available to export.", "info");
      return;
    }
    const headers = [
      { label: "Volunteer ID", get: (v: Volunteer) => formatId(selectedFest?.code, v.volunteerNumber || v.volunteerId) },
      { label: "Full Name", get: (v: Volunteer) => v.fullName },
      { label: "Contact", get: (v: Volunteer) => v.contact },
      { label: "Email", get: (v: Volunteer) => v.email || "" },
      { label: "Festival", get: () => selectedFest?.name || "" },
      {
        label: "Department",
        get: (v: Volunteer) => {
          const d = selectedFest?.departments?.find((dept) => dept.id === v.departmentId);
          return d ? d.name : v.departmentId;
        },
      },
      { label: "Time Slot", get: (v: Volunteer) => v.timeSlot },
      { label: "Age", get: (v: Volunteer) => v.age || "" },
      { label: "Gender", get: (v: Volunteer) => v.gender || "" },
      { label: "Address", get: (v: Volunteer) => v.address || "" },
      { label: "Status", get: (v: Volunteer) => v.status },
      { label: "Registered At", get: (v: Volunteer) => new Date(v.createdAt).toLocaleString() },
    ];
    const csv = toCSV(volunteers, headers);
    downloadCSV(`volunteers-${selectedFest?.code || "all"}-${Date.now()}.csv`, csv);
    showToast(`Exported ${volunteers.length} volunteer records to CSV!`, "success");
  }

  // Festival mutation helpers
  async function saveFestival(data: Partial<Festival>) {
    try {
      if (isNewFest) {
        await api.createFestival({ ...data, active: false });
        showToast("Festival created as Draft. Add departments then click Publish when ready!", "success");
      } else if (editingFest) {
        await api.updateFestival(editingFest.id, data);
        showToast("Festival settings saved!", "success");
      }
      setEditingFest(null);
      await onRefreshFestivals();
      loadArchivedFestivals();
    } catch (err: any) {
      showToast(err.message || "Failed to save festival", "error");
    }
  }

  async function duplicateFest(id: string) {
    try {
      const copy = await api.duplicateFestival(id);
      await onRefreshFestivals();
      loadArchivedFestivals();
      setSelectedFestId(copy.id);
      showToast(`Festival duplicated as "${copy.name}"!`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to duplicate festival", "error");
    }
  }

  async function publishFest(f: Festival) {
    try {
      await api.publishFestival(f.id);
      await onRefreshFestivals();
      loadArchivedFestivals();
      showToast(`"${f.name}" is now LIVE! Registrations are open.`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to publish festival", "error");
    }
  }

  async function unpublishFest(f: Festival) {
    try {
      await api.updateFestival(f.id, { active: false });
      await onRefreshFestivals();
      loadArchivedFestivals();
      showToast(`"${f.name}" paused and set to Draft mode.`, "info");
    } catch (err: any) {
      showToast(err.message || "Failed to unpublish festival", "error");
    }
  }

  function promptDeleteFest(id: string, permanent = true) {
    const fest = (allFestivalsWithArchived.length ? allFestivalsWithArchived : festivals).find((f) => f.id === id);
    setConfirmState({
      isOpen: true,
      title: permanent ? "Delete Festival Permanently?" : "Archive Festival?",
      message: permanent
        ? `Are you sure you want to permanently delete "${fest?.name || "this festival"}" and all associated departments, slots, and volunteer records? This action cannot be undone.`
        : `Move "${fest?.name || "this festival"}" to archive?`,
      confirmLabel: permanent ? "Delete Permanently" : "Archive",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteFestival(id, permanent);
          await onRefreshFestivals();
          loadArchivedFestivals();
          if (selectedFestId === id) {
            const remaining = festivals.filter((f) => f.id !== id);
            if (remaining.length > 0) setSelectedFestId(remaining[0].id);
          }
          showToast(`Festival "${fest?.name || ""}" deleted successfully.`, "success");
        } catch (err: any) {
          showToast(err.message || "Failed to delete festival", "error");
        }
      },
    });
  }

  async function restoreFest(id: string) {
    try {
      await api.restoreFestival(id);
      await onRefreshFestivals();
      loadArchivedFestivals();
      showToast("Festival restored from archive.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to restore festival", "error");
    }
  }

  // Department mutation helpers
  async function saveDepartment(data: Partial<Department>) {
    if (!selectedFest) return;
    try {
      if (isNewDept) {
        await api.createDepartment(selectedFest.id, data);
        showToast("Department created successfully!", "success");
      } else if (editingDept) {
        await api.updateDepartment(editingDept.id, data);
        showToast("Department updated successfully!", "success");
      }
      setEditingDept(null);
      await onRefreshFestivals();
      loadArchivedDepts();
    } catch (err: any) {
      showToast(err.message || "Failed to save department", "error");
    }
  }

  function promptDeleteDept(id: string, permanent = true) {
    const dept = (selectedFest?.departments || []).find((d) => d.id === id);
    setConfirmState({
      isOpen: true,
      title: permanent ? "Delete Department Permanently?" : "Archive Department?",
      message: permanent
        ? `Permanently delete "${dept?.name || "this department"}" and all associated volunteer records? This action is irreversible.`
        : "Move this department to archive?",
      confirmLabel: permanent ? "Delete Permanently" : "Archive",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteDepartment(id, permanent);
          await onRefreshFestivals();
          loadArchivedDepts();
          showToast("Department deleted successfully.", "success");
        } catch (err: any) {
          showToast(err.message || "Failed to delete department", "error");
        }
      },
    });
  }

  function promptBulkDeleteDepts() {
    const ids = Object.keys(selectedDeptIds).filter((id) => selectedDeptIds[id]);
    if (ids.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: `Delete ${ids.length} Departments?`,
      message: `Permanently delete ${ids.length} selected department(s) and all associated volunteer records? This cannot be undone.`,
      confirmLabel: `Delete ${ids.length} Departments`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteDepartmentsBulk(ids, true);
          setSelectedDeptIds({});
          await onRefreshFestivals();
          loadArchivedDepts();
          showToast(`Successfully deleted ${ids.length} departments.`, "success");
        } catch (err: any) {
          showToast(err.message || "Failed to delete departments", "error");
        }
      },
    });
  }

  async function restoreDept(id: string) {
    try {
      await api.restoreDepartment(id);
      await onRefreshFestivals();
      loadArchivedDepts();
      showToast("Department restored from archive.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to restore department", "error");
    }
  }

  async function regenCode(id: string) {
    try {
      const newCode = await api.regenerateAccessCode(id);
      if (editingDept && editingDept.id === id) {
        setEditingDept({ ...editingDept, accessCode: newCode });
      }
      await onRefreshFestivals();
      showToast(`New access code generated: ${newCode}`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to regenerate access code", "error");
    }
  }

  function promptDeleteVolunteer(id: string, permanent = true) {
    const vol = volunteers.find((v) => v.id === id);
    setConfirmState({
      isOpen: true,
      title: permanent ? "Delete Volunteer Record?" : "Archive Volunteer?",
      message: permanent
        ? `Permanently delete registration for "${vol?.fullName || "volunteer"}"? This cannot be undone.`
        : "Move this volunteer record to archive?",
      confirmLabel: permanent ? "Delete Record" : "Archive",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteRegistration(id, permanent);
          setVolunteers((prev) => prev.filter((v) => v.id !== id));
          setViewingVol(null);
          showToast("Volunteer record deleted successfully.", "success");
        } catch (err: any) {
          showToast(err.message || "Failed to delete volunteer", "error");
        }
      },
    });
  }

  function promptBulkDeleteVols() {
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (ids.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: `Delete ${ids.length} Volunteers?`,
      message: `Permanently delete ${ids.length} selected volunteer records from the database? This cannot be undone.`,
      confirmLabel: `Delete ${ids.length} Volunteers`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteRegistrationsBulk(ids, true);
          setSelectedIds({});
          loadVolunteers();
          showToast(`Successfully deleted ${ids.length} volunteer records.`, "success");
        } catch (err: any) {
          showToast(err.message || "Failed to bulk delete volunteers", "error");
        }
      },
    });
  }

  async function restoreVolunteerRecord(id: string) {
    try {
      await api.restoreRegistration(id);
      loadVolunteers();
      setViewingVol(null);
      showToast("Volunteer record restored from archive.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to restore volunteer", "error");
    }
  }

  async function handleAddTimeSlot() {
    if (!selectedFest) return;
    const text = newSlotText.trim();
    if (!text) {
      showToast("Please enter a time slot.", "info");
      return;
    }
    const currentSlots = selectedFest.timeSlots || [];
    if (currentSlots.includes(text)) {
      showToast("This time slot already exists.", "info");
      return;
    }
    const next = [...currentSlots, text];
    try {
      await api.updateFestival(selectedFest.id, { timeSlots: next });
      setNewSlotText("");
      await onRefreshFestivals();
      showToast(`Time slot "${text}" added!`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to add time slot", "error");
    }
  }

  async function handleRemoveTimeSlot(index: number) {
    if (!selectedFest) return;
    const currentSlots = selectedFest.timeSlots || [];
    const removedSlot = currentSlots[index];
    const next = currentSlots.filter((_, idx) => idx !== index);
    try {
      await api.updateFestival(selectedFest.id, { timeSlots: next });
      await onRefreshFestivals();
      showToast(`Removed time slot "${removedSlot}"`, "info");
    } catch (err: any) {
      showToast(err.message || "Failed to remove time slot", "error");
    }
  }

  async function handleAddCustomField() {
    if (!selectedFest) return;
    const label = newCustomLabel.trim();
    if (!label) {
      showToast("Please enter a field label.", "info");
      return;
    }
    const id = label.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30) || `field_${Date.now()}`;
    const currentFields = selectedFest.customFields || [];
    if (currentFields.some((f) => f.id === id || f.label.toLowerCase() === label.toLowerCase())) {
      showToast("A field with this name already exists.", "info");
      return;
    }
    const next = [...currentFields, { id, label, required: newCustomRequired }];
    try {
      await api.updateFestival(selectedFest.id, { customFields: next });
      setNewCustomLabel("");
      setNewCustomRequired(false);
      await onRefreshFestivals();
      showToast(`Custom field "${label}" added!`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to add custom field", "error");
    }
  }

  async function handleRemoveCustomField(index: number) {
    if (!selectedFest) return;
    const currentFields = selectedFest.customFields || [];
    const removedField = currentFields[index];
    const next = currentFields.filter((_, idx) => idx !== index);
    try {
      await api.updateFestival(selectedFest.id, { customFields: next });
      await onRefreshFestivals();
      showToast(`Removed custom field "${removedField?.label || ""}"`, "info");
    } catch (err: any) {
      showToast(err.message || "Failed to remove custom field", "error");
    }
  }

  function copyRegistrationLink(f: Festival) {
    const url = `${window.location.origin}/#fid=${f.id}`;
    copyToClipboard(url);
    setCopiedFestId(f.id);
    setTimeout(() => {
      setCopiedFestId((cur) => (cur === f.id ? null : cur));
    }, 2500);
    showToast(`Registration link copied for "${f.name}"!`, "success");
  }

  return (
    <>
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 24 }}>🏛️</div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink)" }}>
                Festival Administration
              </div>
              <div style={{ fontSize: 12.5, color: "#8A8375" }}>
                Managing {festivals.length} festival(s)
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              api.adminLogout();
              onLogout();
            }}
            style={{
              background: "none",
              border: "1px solid #E1D9C6",
              borderRadius: 9,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--primary)",
              cursor: "pointer",
            }}
          >
            Log Out
          </button>
        </div>

        {/* Festival Picker in Admin */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#8A8375", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
            Active Festival Workspace:
          </label>
          <Select value={selectedFestId} onChange={(e) => setSelectedFestId(e.target.value)}>
            {festivals.map((f) => (
              <option key={f.id} value={f.id}>
                {f.emoji} {f.name} ({f.dateLabel}) {!f.active ? "— [Unpublished]" : ""}
              </option>
            ))}
          </Select>
        </div>

        {/* Subtabs - smooth horizontal scroll on mobile */}
        <div
          className="no-scrollbar"
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {[
            { id: "overview", label: "📊 Overview" },
            { id: "registrations", label: "👥 Volunteers" },
            { id: "festivals", label: "🎉 Festivals" },
            { id: "departments", label: "🏷️ Departments" },
            { id: "slots", label: "⏰ Slots" },
            { id: "form", label: "📝 Form" },
            { id: "card", label: "🪪 Card" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                flexShrink: 0,
                whiteSpace: "nowrap",
                padding: "7px 11px",
                borderRadius: 8,
                border: activeTab === t.id ? "1.5px solid var(--primary, #14415C)" : "1px solid #E2D9C3",
                background: activeTab === t.id ? "var(--primary, #14415C)" : "#FFFFFF",
                color: activeTab === t.id ? "#FFFFFF" : "#6B6255",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {/* 1. OVERVIEW */}
      {activeTab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
            <SummaryCard label="Total Registered" value={counts.total} />
            <SummaryCard label="Pending Approval" value={counts.pendingApproval} accent="var(--amber)" />
            <SummaryCard label="Approved" value={counts.approved} accent="var(--green)" />
            <SummaryCard label="Pending Print" value={counts.pendingPrint} accent="#14415C" />
            <SummaryCard label="Printed Badges" value={counts.printed} accent="var(--green)" />
            <SummaryCard label="Rejected" value={counts.rejected} accent="var(--maroon)" />
          </div>

          {selectedFest && (
            <Card>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: "0 0 12px" }}>
                Department Capacities
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(selectedFest.departments || []).map((d) => {
                  const deptVols = volunteers.filter((v) => v.departmentId === d.id);
                  const cap = parseInt(d.capacity as string, 10) || 0;
                  const ratio = cap > 0 ? Math.min(100, Math.round((deptVols.length / cap) * 100)) : null;

                  return (
                    <div key={d.id} style={{ padding: "10px 12px", border: "1px solid #E8E0CE", borderRadius: 10, background: "#FFFFFF" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>
                          {d.emoji} {d.name}
                        </span>
                        <span style={{ fontSize: 12, color: "#8A8375" }}>
                          {deptVols.length} {cap > 0 ? `/ ${cap} (${ratio}%)` : "volunteers"}
                        </span>
                      </div>
                      {cap > 0 && (
                        <div style={{ height: 6, background: "#E8E0CE", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${ratio}%`,
                              background: (ratio || 0) >= 100 ? "var(--maroon)" : "var(--primary)",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {/* 2. REGISTRATIONS */}
      {activeTab === "registrations" && (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
                Volunteers ({volunteers.length})
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleExportCSV}
                  style={{
                    background: "var(--gold)",
                    color: "#2B1F05",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ⬇️ CSV
                </button>
                <button
                  onClick={handleBatchCards}
                  style={{
                    background: "#FFFFFF",
                    color: "var(--primary)",
                    border: "1px solid #E2D9C3",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Export cards to a ZIP folder with print-ready high-quality PNGs"
                >
                  🪪 {Object.values(selectedIds).filter(Boolean).length > 0 ? `Export Cards (${Object.values(selectedIds).filter(Boolean).length})` : "Export All Cards"}
                </button>
              </div>
            </div>

            {batchProgress && (
              <div style={{ background: "#F5EFE0", border: "1px solid #E2D9C3", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "var(--ink)" }}>
                Generating cards folder: {batchProgress.done} of {batchProgress.total}…
              </div>
            )}

            {/* Filters */}
            <TextInput
              value={fSearch}
              onChange={(e) => setFSearch(e.target.value)}
              placeholder="Search by name, contact or ID"
              style={{ marginBottom: 8 }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <Select value={fDept} onChange={(e) => setFDept(e.target.value)} style={{ fontSize: 12, padding: "7px 10px" }}>
                <option value="">All Departments</option>
                {selectedFest?.departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.emoji} {d.name}
                  </option>
                ))}
              </Select>
              <Select value={fSlot} onChange={(e) => setFSlot(e.target.value)} style={{ fontSize: 12, padding: "7px 10px" }}>
                <option value="">All Slots</option>
                {selectedFest?.timeSlots?.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>

            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ fontSize: 12, padding: "7px 10px", marginBottom: 10 }}>
              <option value="">All Status</option>
              {STATUS_FLOW.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="Rejected">Rejected</option>
            </Select>

            {/* Archive records toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "6px 12px", background: "#F6F1E3", borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  checked={showArchivedVols}
                  onChange={(e) => setShowArchivedVols(e.target.checked)}
                />
                📦 Show Archived / Deleted Records
              </label>
              {showArchivedVols && (
                <span style={{ fontSize: 11.5, color: "#8A8375" }}>
                  Including soft-deleted
                </span>
              )}
            </div>

            {/* Select all bar & Bulk Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12, flexWrap: "wrap", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600, color: "#6B6255" }}>
                <input
                  type="checkbox"
                  checked={volunteers.length > 0 && volunteers.every((v) => selectedIds[v.id])}
                  onChange={(e) => {
                    const check = e.target.checked;
                    const newMap: Record<string, boolean> = {};
                    volunteers.forEach((v) => {
                      newMap[v.id] = check;
                    });
                    setSelectedIds(newMap);
                  }}
                />
                Select All
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {Object.values(selectedIds).filter(Boolean).length > 0 && (
                  <button
                    onClick={promptBulkDeleteVols}
                    style={{
                      background: "#FFF5F5",
                      color: "var(--maroon)",
                      border: "1px solid #F6DEE1",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    🗑️ Delete Selected ({Object.values(selectedIds).filter(Boolean).length})
                  </button>
                )}
                <span style={{ color: "#8A8375" }}>
                  {Object.values(selectedIds).filter(Boolean).length} selected
                </span>
              </div>
            </div>

            {loadingVols ? (
              <p style={{ fontSize: 13, color: "#8A8375" }}>Loading volunteers…</p>
            ) : volunteers.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8A8375" }}>No matching volunteers found.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {volunteers.map((v) => {
                  const dept = selectedFest?.departments?.find((d) => d.id === v.departmentId);
                  const vNum = v.volunteerNumber || v.volunteerId;
                  const isSelected = viewingVol?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: isSelected ? "1.5px solid var(--primary)" : "1px solid #E8E0CE",
                        borderRadius: 10,
                        background: isSelected ? "#F4EFE2" : selectedIds[v.id] ? "#F9F6EE" : "#FFFFFF",
                        transition: "all 0.1s ease",
                        boxShadow: "0 1px 4px rgba(20,65,92,0.03)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedIds[v.id]}
                        onChange={(e) => setSelectedIds({ ...selectedIds, [v.id]: e.target.checked })}
                      />
                      <img
                        src={v.photoUrl || (v as any).photo}
                        alt=""
                        onClick={() => setViewingVol(v)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          objectFit: "cover",
                          cursor: "pointer",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setViewingVol(v)}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{v.fullName}</div>
                        <div style={{ fontSize: 11.5, color: "#8A8375" }}>
                          {formatId(selectedFest?.code, vNum)} · {dept?.name || "—"}
                        </div>
                      </div>
                      <Badge status={v.status} />
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await downloadCardPng(v, selectedFest);
                            showToast(`Downloaded ID card for ${v.fullName}!`, "success");
                          } catch (err: any) {
                            showToast(err.message || "Failed to download card", "error");
                          }
                        }}
                        style={{
                          background: "#F5EFE0",
                          border: "1px solid #E2D9C3",
                          color: "var(--ink)",
                          borderRadius: 6,
                          padding: "5px 8px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                        title="Download Print-Ready ID Card PNG"
                      >
                        🪪
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          promptDeleteVolunteer(v.id, true);
                        }}
                        style={{
                          background: "#FFF5F5",
                          border: "1px solid #F6DEE1",
                          color: "var(--maroon)",
                          borderRadius: 6,
                          padding: "5px 8px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                        title="Delete Volunteer Permanently"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Volunteer Detail & ID Card Modal */}
          {viewingVol && (
            <ModalShell
              title={`Volunteer · ${formatId(selectedFest?.code, viewingVol.volunteerNumber || viewingVol.volunteerId)}`}
              onClose={() => setViewingVol(null)}
            >
              <IDCard record={viewingVol} festival={selectedFest} allowDownload />

              <div style={{ marginTop: 16, width: "100%", background: "#FFFFFF", padding: 14, borderRadius: 12, border: "1px solid #E8E0CE" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8A8375", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>
                  Status Workflow
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {STATUS_FLOW.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateVolStatus(viewingVol.id, s)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        border: viewingVol.status === s ? "1.5px solid var(--primary)" : "1px solid #E2D9C3",
                        background: viewingVol.status === s ? "var(--primary)" : "#FFFFFF",
                        color: viewingVol.status === s ? "#FFFFFF" : "#6B6255",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => updateVolStatus(viewingVol.id, "Rejected")}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      border: viewingVol.status === "Rejected" ? "1.5px solid var(--maroon)" : "1px solid #F6DEE1",
                      background: viewingVol.status === "Rejected" ? "var(--maroon)" : "#F6DEE1",
                      color: viewingVol.status === "Rejected" ? "#FFFFFF" : "var(--maroon)",
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {/* Action Buttons: Call, WhatsApp, Delete */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                <a
                  href={`tel:${viewingVol.contact}`}
                  style={{
                    textAlign: "center",
                    background: "var(--primary)",
                    color: "#FFFFFF",
                    borderRadius: 10,
                    padding: "11px 8px",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  📞 Call
                </a>
                <a
                  href={reminderMessageLink(
                    viewingVol,
                    selectedFest,
                    selectedFest?.departments?.find((d) => d.id === viewingVol.departmentId)
                  )}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textAlign: "center",
                    background: "var(--gold)",
                    color: "#2B1F05",
                    borderRadius: 10,
                    padding: "11px 8px",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  💬 WhatsApp
                </a>
              </div>

              <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink)", lineHeight: 1.8, background: "#FFFFFF", padding: 14, borderRadius: 12, border: "1px solid #E8E0CE" }}>
                <div><strong>Contact:</strong> {viewingVol.contact}</div>
                <div><strong>Email:</strong> {viewingVol.email || "—"}</div>
                <div><strong>Time Slot:</strong> {viewingVol.timeSlot}</div>
                <div><strong>Age / Gender:</strong> {viewingVol.age} · {viewingVol.gender}</div>
                <div><strong>Address:</strong> {viewingVol.address || "—"}</div>
              </div>

              {viewingVol.archivedAt ? (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "#FFF0D4", border: "1px solid #FFE0A0", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#7A4E00", fontWeight: 600, textAlign: "center" }}>
                    📦 This volunteer record is currently archived
                  </div>
                  <button
                    onClick={() => restoreVolunteerRecord(viewingVol.id)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: "#EAF5EA",
                      border: "1px solid #C2E0C2",
                      borderRadius: 10,
                      color: "#1E5E1E",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ♻️ Restore Volunteer Record
                  </button>
                  <button
                    onClick={() => promptDeleteVolunteer(viewingVol.id, true)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: "#FFF5F5",
                      border: "1px solid #F6DEE1",
                      borderRadius: 10,
                      color: "var(--maroon)",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ⚠️ Permanently Purge Record
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => promptDeleteVolunteer(viewingVol.id, false)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      background: "#FFF5F5",
                      border: "1px solid #F6DEE1",
                      borderRadius: 10,
                      color: "var(--maroon)",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    🗑️ Move to Archive
                  </button>
                  <button
                    onClick={() => promptDeleteVolunteer(viewingVol.id, true)}
                    style={{
                      padding: "10px 14px",
                      background: "#FFFFFF",
                      border: "1px solid #F6DEE1",
                      borderRadius: 10,
                      color: "var(--maroon)",
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    title="Permanent Purge"
                  >
                    ⚠️ Purge
                  </button>
                </div>
              )}
            </ModalShell>
          )}
        </>
      )}

      {/* 3. FESTIVALS */}
      {activeTab === "festivals" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>Festivals Management</h3>
              <div style={{ fontSize: 12, color: "#8A8375" }}>Create festivals, manage lifecycle, and toggle public registration</div>
            </div>
            <button
              onClick={() => {
                setIsNewFest(true);
                setEditingFest({
                  id: "",
                  name: "",
                  code: "",
                  dateLabel: "2026",
                  emoji: "🪷",
                  active: false,
                  departments: [],
                  timeSlots: ["Full Day (6:00 AM – 10:00 PM)", "Morning (6:00 AM – 2:00 PM)", "Evening (2:00 PM – 10:00 PM)"],
                  formConfig: {
                    email: { enabled: false, required: false },
                    age: { enabled: true, required: true },
                    gender: { enabled: true, required: true },
                    address: { enabled: true, required: true },
                  },
                  customFields: [],
                  cardConfig: {
                    primaryColor: "#14415C",
                    accentColor: "#C6961F",
                    showDepartment: true,
                    showContact: true,
                    showHOD: true,
                    showTimeSlot: true,
                  },
                });
              }}
              style={{
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                lineHeight: 1,
              }}
              title="Create Festival"
            >
              +
            </button>
          </div>

          {/* Festival filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid #EEE7D5", paddingBottom: 10 }}>
            {(
              [
                { id: "all", label: `All (${(allFestivalsWithArchived.length > 0 ? allFestivalsWithArchived : festivals).length})` },
                { id: "active", label: `🟢 Published (${(allFestivalsWithArchived.length > 0 ? allFestivalsWithArchived : festivals).filter((f) => f.active && !f.archivedAt).length})` },
                { id: "draft", label: `⚪ Drafts (${(allFestivalsWithArchived.length > 0 ? allFestivalsWithArchived : festivals).filter((f) => !f.active && !f.archivedAt).length})` },
                { id: "archived", label: `📦 Archived (${(allFestivalsWithArchived.length > 0 ? allFestivalsWithArchived : festivals).filter((f) => !!f.archivedAt).length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setFestFilter(t.id)}
                style={{
                  background: festFilter === t.id ? "var(--primary)" : "#F4EFE2",
                  color: festFilter === t.id ? "#FFFFFF" : "var(--ink)",
                  border: "none",
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(allFestivalsWithArchived.length > 0 ? allFestivalsWithArchived : festivals)
              .filter((f) => {
                if (festFilter === "active") return f.active && !f.archivedAt;
                if (festFilter === "draft") return !f.active && !f.archivedAt;
                if (festFilter === "archived") return !!f.archivedAt;
                return true;
              })
              .map((f) => (
              <div key={f.id} style={{ padding: 14, border: f.archivedAt ? "1px dashed #D0C5B0" : "1px solid #EEE7D5", borderRadius: 12, background: f.archivedAt ? "#FAF8F4" : "#FFFFFF" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {f.logoImageUrl ? (
                      <img
                        src={f.logoImageUrl}
                        alt=""
                        style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 26 }}>{f.emoji}</span>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                        {f.name} ({f.dateLabel})
                        {f.archivedAt ? (
                          <span style={{ fontSize: 11, background: "#FFF0D4", color: "#8A5A00", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                            📦 Archived
                          </span>
                        ) : f.active ? (
                          <span style={{ fontSize: 11, background: "#E5F7E5", color: "#1D741D", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                            🟢 Published (Live)
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, background: "#F0ECE1", color: "#6A6255", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                            ⚪ Draft
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A8375", marginTop: 2 }}>
                        Code: <strong>{f.code}</strong> · {f.departments?.length || 0} departments · {f.timeSlots?.length || 0} slots
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {f.archivedAt ? (
                      <>
                        <button
                          onClick={() => restoreFest(f.id)}
                          style={{
                            background: "#EAF5EA",
                            border: "1px solid #C2E0C2",
                            color: "#1E5E1E",
                            borderRadius: 6,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ♻️ Restore
                        </button>
                        <button
                          onClick={() => promptDeleteFest(f.id, true)}
                          style={{
                            background: "#FFF5F5",
                            border: "1px solid #F6DEE1",
                            color: "var(--maroon)",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Permanent Purge"
                        >
                          ⚠️ Purge
                        </button>
                      </>
                    ) : (
                      <>
                        {!f.active ? (
                          <button
                            onClick={() => publishFest(f)}
                            style={{
                              background: "var(--gold)",
                              color: "#2B1F05",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                            title="Validate departments & slots, then open public registration"
                          >
                            🚀 Publish Festival
                          </button>
                        ) : (
                          <button
                            onClick={() => unpublishFest(f)}
                            style={{
                              background: "#F0ECE1",
                              color: "#554E42",
                              border: "1px solid #DCD4C2",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Pause registrations and return to draft"
                          >
                            ⏸️ Pause / Draft
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setIsNewFest(false);
                            setEditingFest(f);
                          }}
                          style={{
                            background: "#F0E9D5",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => duplicateFest(f.id)}
                          style={{
                            background: "#E8EDF5",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          📑 Duplicate
                        </button>
                        <button
                          onClick={() => promptDeleteFest(f.id, true)}
                          style={{
                            background: "#F6DEE1",
                            color: "var(--maroon)",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Permanently Delete Festival"
                        >
                          🗑️ Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Direct Link Sharing */}
                {!f.archivedAt && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => copyRegistrationLink(f)}
                      style={{
                        background: copiedFestId === f.id ? "#E2F4E6" : "none",
                        border: copiedFestId === f.id ? "1px solid #73C287" : "1px dashed #C9BE9E",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: copiedFestId === f.id ? "#1B6E32" : "var(--primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {copiedFestId === f.id ? "✓ Link Copied!" : "📋 Copy Registration Link"}
                    </button>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/#fid=${f.id}`}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      style={{
                        fontSize: 11.5,
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #E2D9C3",
                        background: "#FAF7EE",
                        color: "#6B6255",
                        width: 250,
                        cursor: "pointer",
                      }}
                      title="Direct Registration Link (click to select all)"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 4. DEPARTMENTS */}
      {activeTab === "departments" && selectedFest && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>
                Departments Management
              </h3>
              <div style={{ fontSize: 12, color: "#8A8375" }}>For {selectedFest.name}</div>
            </div>
            <button
              onClick={() => {
                setIsNewDept(true);
                setEditingDept({
                  id: "",
                  festivalId: selectedFest.id,
                  name: "",
                  emoji: "🙏",
                  active: true,
                  accessCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                  capacity: "",
                  instructions: "",
                });
              }}
              style={{
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + Add Department
            </button>
          </div>

          {/* Department tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid #EEE7D5", paddingBottom: 10 }}>
            {(
              [
                {
                  id: "active",
                  label: `Active (${(allDeptsWithArchived.length > 0 ? allDeptsWithArchived : selectedFest.departments || []).filter((d) => !d.archivedAt).length})`,
                },
                {
                  id: "archived",
                  label: `📦 Archived (${(allDeptsWithArchived.length > 0 ? allDeptsWithArchived : []).filter((d) => !!d.archivedAt).length})`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setDeptFilter(t.id)}
                style={{
                  background: deptFilter === t.id ? "var(--primary)" : "#F4EFE2",
                  color: deptFilter === t.id ? "#FFFFFF" : "var(--ink)",
                  border: "none",
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Bulk delete & selection for departments */}
          {(() => {
            const currentDepts = (allDeptsWithArchived.length > 0 ? allDeptsWithArchived : selectedFest.departments || [])
              .filter((d) => (deptFilter === "archived" ? !!d.archivedAt : !d.archivedAt));
            const selectedCount = currentDepts.filter((d) => selectedDeptIds[d.id]).length;
            return currentDepts.length > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, fontSize: 12, flexWrap: "wrap", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600, color: "#6B6255" }}>
                  <input
                    type="checkbox"
                    checked={currentDepts.length > 0 && currentDepts.every((d) => selectedDeptIds[d.id])}
                    onChange={(e) => {
                      const check = e.target.checked;
                      const next = { ...selectedDeptIds };
                      currentDepts.forEach((d) => {
                        next[d.id] = check;
                      });
                      setSelectedDeptIds(next);
                    }}
                  />
                  Select All
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selectedCount > 0 && (
                    <button
                      onClick={promptBulkDeleteDepts}
                      style={{
                        background: "#FFF5F5",
                        color: "var(--maroon)",
                        border: "1px solid #F6DEE1",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      🗑️ Delete Selected ({selectedCount})
                    </button>
                  )}
                  <span style={{ color: "#8A8375" }}>{selectedCount} selected</span>
                </div>
              </div>
            ) : null;
          })()}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(allDeptsWithArchived.length > 0 ? allDeptsWithArchived : selectedFest.departments || [])
              .filter((d) => (deptFilter === "archived" ? !!d.archivedAt : !d.archivedAt))
              .map((d) => (
              <div key={d.id} style={{ padding: 12, border: d.archivedAt ? "1px dashed #D0C5B0" : "1px solid #EEE7D5", borderRadius: 12, background: selectedDeptIds[d.id] ? "#F9F6EE" : d.archivedAt ? "#FAF8F4" : "#FFFFFF" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={!!selectedDeptIds[d.id]}
                      onChange={(e) => setSelectedDeptIds({ ...selectedDeptIds, [d.id]: e.target.checked })}
                      style={{ cursor: "pointer" }}
                    />
                    {d.logoUrl ? (
                      <img
                        src={d.logoUrl}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 22 }}>{d.emoji}</span>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                        {d.name}
                        {d.archivedAt && (
                          <span style={{ fontSize: 11, background: "#FFF0D4", color: "#8A5A00", padding: "1px 6px", borderRadius: 8, fontWeight: 700 }}>
                            📦 Archived
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A8375" }}>
                        HOD: {d.hodName || "Not assigned"} {d.hodPhone ? `(${d.hodPhone})` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--primary)", marginTop: 2 }}>
                        Access Code: <strong>{d.accessCode}</strong>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {d.archivedAt ? (
                      <>
                        <button
                          onClick={() => restoreDept(d.id)}
                          style={{
                            background: "#EAF5EA",
                            border: "1px solid #C2E0C2",
                            color: "#1E5E1E",
                            borderRadius: 6,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ♻️ Restore
                        </button>
                        <button
                          onClick={() => promptDeleteDept(d.id, true)}
                          style={{
                            background: "#FFF5F5",
                            border: "1px solid #F6DEE1",
                            color: "var(--maroon)",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Permanent Purge"
                        >
                          ⚠️ Purge
                        </button>
                      </>
                    ) : (
                      <>
                        {d.hodPhone && (
                          <a
                            href={hodMessageLink(d, selectedFest)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              background: "#E2F4E6",
                              color: "#1E6B39",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 11.5,
                              fontWeight: 700,
                              textDecoration: "none",
                            }}
                          >
                            💬 Send Code
                          </a>
                        )}
                        <button
                          onClick={() => {
                            setIsNewDept(false);
                            setEditingDept(d);
                          }}
                          style={{
                            background: "#F0E9D5",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => promptDeleteDept(d.id, true)}
                          style={{
                            background: "#F6DEE1",
                            color: "var(--maroon)",
                            border: "none",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Permanently delete department"
                        >
                          🗑️ Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 5. SLOTS */}
      {activeTab === "slots" && selectedFest && (
        <Card>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 12px" }}>
            Time Slots ({selectedFest.timeSlots.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {selectedFest.timeSlots.map((slot, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "#FDFBF5",
                  border: "1px solid #EEE7D5",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 13.5 }}>{slot}</span>
                <button
                  onClick={() => handleRemoveTimeSlot(i)}
                  style={{ background: "none", border: "none", color: "var(--maroon)", cursor: "pointer", padding: "4px 8px" }}
                  title="Remove time slot"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <TextInput
              value={newSlotText}
              onChange={(e) => setNewSlotText(e.target.value)}
              placeholder="Enter new time slot (e.g. Afternoon (12:00 PM – 4:00 PM))"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTimeSlot();
                }
              }}
            />
            <button
              onClick={handleAddTimeSlot}
              style={{
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + Add Slot
            </button>
          </div>
        </Card>
      )}

      {/* 6. FORM CONFIG */}
      {activeTab === "form" && selectedFest && (
        <Card>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 12px" }}>
            Registration Form Settings
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
            {(["age", "gender", "address"] as const).map((field) => {
              const conf = (selectedFest.formConfig as any)[field] || { enabled: true, required: false };
              return (
                <div
                  key={field}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 10,
                    border: "1px solid #EEE7D5",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ textTransform: "capitalize", fontWeight: 600, fontSize: 14 }}>{field}</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={conf.enabled}
                        onChange={async (e) => {
                          const next = {
                            ...selectedFest.formConfig,
                            [field]: { ...conf, enabled: e.target.checked },
                          };
                          await api.updateFestival(selectedFest.id, { formConfig: next });
                          await onRefreshFestivals();
                        }}
                      />
                      Enabled
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={conf.required}
                        disabled={!conf.enabled}
                        onChange={async (e) => {
                          const next = {
                            ...selectedFest.formConfig,
                            [field]: { ...conf, required: e.target.checked },
                          };
                          await api.updateFestival(selectedFest.id, { formConfig: next });
                          await onRefreshFestivals();
                        }}
                      />
                      Required
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <h4 style={{ fontFamily: "var(--font-display)", fontSize: 16, margin: "16px 0 8px" }}>Custom Fields</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {(selectedFest.customFields || []).map((cf, i) => (
              <div
                key={cf.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "#FDFBF5",
                  border: "1px solid #EEE7D5",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 13.5 }}>
                  {cf.label} {cf.required ? "(Required)" : "(Optional)"}
                </span>
                <button
                  onClick={() => handleRemoveCustomField(i)}
                  style={{ background: "none", border: "none", color: "var(--maroon)", cursor: "pointer", padding: "4px 8px" }}
                  title="Remove custom field"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ background: "#FDFBF5", padding: 12, borderRadius: 10, border: "1px solid #EEE7D5", marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 8 }}>
              Add New Custom Field
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <TextInput
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  placeholder="Field label (e.g. T-Shirt Size, Emergency Contact)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddCustomField();
                    }
                  }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newCustomRequired}
                  onChange={(e) => setNewCustomRequired(e.target.checked)}
                />
                Required
              </label>
              <button
                onClick={handleAddCustomField}
                style={{
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                + Add Field
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* 7. CARD CONFIG */}
      {activeTab === "card" && selectedFest && (
        <Card>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 12px" }}>
            ID Card Styling & Toggles
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <Field label="Primary Color">
              <input
                type="color"
                value={selectedFest.cardConfig?.primaryColor || "#14415C"}
                onChange={async (e) => {
                  const next = {
                    ...selectedFest.cardConfig,
                    primaryColor: e.target.value,
                  };
                  await api.updateFestival(selectedFest.id, { cardConfig: next });
                  await onRefreshFestivals();
                }}
                style={{ width: "100%", height: 42, borderRadius: 8, cursor: "pointer" }}
              />
            </Field>
            <Field label="Accent Color">
              <input
                type="color"
                value={selectedFest.cardConfig?.accentColor || "#C6961F"}
                onChange={async (e) => {
                  const next = {
                    ...selectedFest.cardConfig,
                    accentColor: e.target.value,
                  };
                  await api.updateFestival(selectedFest.id, { cardConfig: next });
                  await onRefreshFestivals();
                }}
                style={{ width: "100%", height: 42, borderRadius: 8, cursor: "pointer" }}
              />
            </Field>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {[
              { key: "showDepartment", label: "Show Department" },
              { key: "showContact", label: "Show Contact" },
              { key: "showHOD", label: "Show HOD Name" },
              { key: "showTimeSlot", label: "Show Time Slot" },
            ].map(({ key, label }) => {
              const val = (selectedFest.cardConfig as any)[key] ?? true;
              return (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    border: "1px solid #EEE7D5",
                    borderRadius: 8,
                    fontSize: 13.5,
                  }}
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={async (e) => {
                      const next = {
                        ...selectedFest.cardConfig,
                        [key]: e.target.checked,
                      };
                      await api.updateFestival(selectedFest.id, { cardConfig: next });
                      await onRefreshFestivals();
                    }}
                  />
                </label>
              );
            })}
          </div>

          <h4 style={{ fontFamily: "var(--font-display)", fontSize: 16, margin: "16px 0 8px" }}>Card Preview</h4>
          <IDCard
            record={{
              fullName: "Devotee Volunteer",
              volunteerNumber: 108,
              timeSlot: selectedFest.timeSlots[0] || "Morning (6:00 AM – 2:00 PM)",
              departmentId: selectedFest.departments[0]?.id,
              status: "Approved",
              contact: "9876543210",
            }}
            festival={selectedFest}
            allowDownload={false}
          />
        </Card>
      )}

      {/* MODAL: VIEW VOLUNTEER */}
      {viewingVol && selectedFest && (
        <ModalShell
          title={`Volunteer · ${formatId(selectedFest.code, viewingVol.volunteerNumber || viewingVol.volunteerId)}`}
          onClose={() => setViewingVol(null)}
        >
          <IDCard record={viewingVol} festival={selectedFest} />

          <div style={{ marginTop: 16, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.8 }}>
            <div>
              <strong>Contact:</strong> {viewingVol.contact}
            </div>
            <div>
              <strong>Email:</strong> {viewingVol.email || "—"}
            </div>
            <div>
              <strong>Age / Gender:</strong> {viewingVol.age} · {viewingVol.gender}
            </div>
            <div>
              <strong>Address:</strong> {viewingVol.address}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <SectionLabel>Update Status</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {STATUS_FLOW.map((s) => (
                <button
                  key={s}
                  onClick={() => updateVolStatus(viewingVol.id, s)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 7,
                    border: viewingVol.status === s ? "1.5px solid var(--primary)" : "1px solid #C9BE9E",
                    background: viewingVol.status === s ? "var(--primary)" : "#fff",
                    color: viewingVol.status === s ? "#fff" : "var(--ink)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => updateVolStatus(viewingVol.id, "Rejected")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 7,
                  border: viewingVol.status === "Rejected" ? "1.5px solid var(--maroon)" : "1px solid #E5A8B2",
                  background: viewingVol.status === "Rejected" ? "var(--maroon)" : "#F6DEE1",
                  color: viewingVol.status === "Rejected" ? "#fff" : "var(--maroon)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <a
              href={`tel:${viewingVol.contact}`}
              style={{
                flex: 1,
                textAlign: "center",
                background: "var(--primary)",
                color: "#FBF7EC",
                borderRadius: 10,
                padding: "12px 10px",
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              📞 Call
            </a>
            <a
              href={reminderMessageLink(
                viewingVol,
                selectedFest,
                selectedFest.departments.find((d) => d.id === viewingVol.departmentId)
              )}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                textAlign: "center",
                background: "var(--gold)",
                color: "#2B1F05",
                borderRadius: 10,
                padding: "12px 10px",
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              💬 WhatsApp
            </a>
          </div>
        </ModalShell>
      )}

      {/* MODAL: EDIT FESTIVAL */}
      {editingFest && (
        <ModalShell
          title={isNewFest ? "Create Festival" : `Edit ${editingFest.name}`}
          onClose={() => setEditingFest(null)}
        >
          {isNewFest && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Quick Template</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {PRESET_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    type="button"
                    onClick={() => {
                      setEditingFest({
                        ...editingFest,
                        name: tmpl.name,
                        code: tmpl.code,
                        emoji: tmpl.emoji,
                        cardConfig: {
                          ...editingFest.cardConfig,
                          primaryColor: tmpl.color,
                          accentColor: tmpl.accent,
                        },
                      });
                    }}
                    style={{
                      padding: "5px 9px",
                      background: "#fff",
                      border: "1px solid #C9BE9E",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {tmpl.emoji} {tmpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="Festival Name" required>
            <TextInput
              value={editingFest.name}
              onChange={(e) => setEditingFest({ ...editingFest, name: e.target.value })}
              placeholder="e.g. Sri Krishna Janmashtami"
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Field label="Code" required hint="3-4 letters">
              <TextInput
                value={editingFest.code}
                onChange={(e) => setEditingFest({ ...editingFest, code: e.target.value.toUpperCase().slice(0, 5) })}
                placeholder="JANM"
              />
            </Field>
            <Field label="Emoji">
              <TextInput
                value={editingFest.emoji}
                onChange={(e) => setEditingFest({ ...editingFest, emoji: e.target.value })}
                placeholder="🦚"
              />
            </Field>
            <Field label="Year / Label">
              <TextInput
                value={editingFest.dateLabel}
                onChange={(e) => setEditingFest({ ...editingFest, dateLabel: e.target.value })}
                placeholder="2026"
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Start Date">
              <TextInput
                type="date"
                value={editingFest.startDate || ""}
                onChange={(e) => setEditingFest({ ...editingFest, startDate: e.target.value })}
              />
            </Field>
            <Field label="End Date">
              <TextInput
                type="date"
                value={editingFest.endDate || ""}
                onChange={(e) => setEditingFest({ ...editingFest, endDate: e.target.value })}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Start Time">
              <TextInput
                type="time"
                value={editingFest.startTime || ""}
                onChange={(e) => setEditingFest({ ...editingFest, startTime: e.target.value })}
              />
            </Field>
            <Field label="End Time">
              <TextInput
                type="time"
                value={editingFest.endTime || ""}
                onChange={(e) => setEditingFest({ ...editingFest, endTime: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Banner Image URL">
            <TextInput
              value={editingFest.bannerImageUrl || ""}
              onChange={(e) => setEditingFest({ ...editingFest, bannerImageUrl: e.target.value })}
              placeholder="https://... or upload below"
            />
            <input
              type="file"
              accept="image/*"
              style={{ marginTop: 6, fontSize: 12 }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = await compressImage(f, 960);
                setEditingFest({ ...editingFest, bannerImageUrl: url });
              }}
            />
          </Field>

          <Field label="Logo Image URL">
            <TextInput
              value={editingFest.logoImageUrl || ""}
              onChange={(e) => setEditingFest({ ...editingFest, logoImageUrl: e.target.value })}
              placeholder="https://... or upload below"
            />
            <input
              type="file"
              accept="image/*"
              style={{ marginTop: 6, fontSize: 12 }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = await compressImage(f, 320);
                setEditingFest({ ...editingFest, logoImageUrl: url });
              }}
            />
          </Field>

          <RichTextField
            label="Festival Description / Welcome Note"
            editorKey={editingFest.id || "new-fest"}
            initialValue={editingFest.description || ""}
            onChange={(val) => setEditingFest({ ...editingFest, description: val })}
          />

          {isNewFest ? (
            <div style={{ fontSize: 13, color: "#6A5E4E", marginBottom: 18, background: "#F6F1E3", padding: "10px 14px", borderRadius: 8, border: "1px solid #E4D9C3" }}>
              ℹ️ <strong>Draft Mode</strong>: Newly created festivals start as drafts. Configure its departments and time slots, then click <strong>🚀 Publish Festival</strong> when you are ready to open registrations.
            </div>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editingFest.active}
                onChange={(e) => setEditingFest({ ...editingFest, active: e.target.checked })}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Published for Volunteer Registration</span>
            </label>
          )}

          <PrimaryButton onClick={() => saveFestival(editingFest)}>
            💾 Save Festival
          </PrimaryButton>
        </ModalShell>
      )}

      {/* MODAL: EDIT DEPARTMENT */}
      {editingDept && selectedFest && (
        <ModalShell
          title={isNewDept ? "Add Department" : `Edit ${editingDept.name}`}
          onClose={() => setEditingDept(null)}
        >
          <Field label="Department Name" required>
            <TextInput
              value={editingDept.name}
              onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
              placeholder="e.g. Prasadam Distribution"
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}>
            <Field label="Emoji">
              <TextInput
                value={editingDept.emoji}
                onChange={(e) => setEditingDept({ ...editingDept, emoji: e.target.value })}
                placeholder="🍲"
              />
            </Field>
            <Field label="Capacity" hint="Leave empty for unlimited">
              <TextInput
                type="number"
                value={editingDept.capacity || ""}
                onChange={(e) => setEditingDept({ ...editingDept, capacity: e.target.value })}
                placeholder="Unlimited"
              />
            </Field>
          </div>

          <Field label="HOD Name">
            <TextInput
              value={editingDept.hodName || ""}
              onChange={(e) => setEditingDept({ ...editingDept, hodName: e.target.value })}
              placeholder="e.g. Govinda Dasa"
            />
          </Field>

          <Field label="HOD WhatsApp Phone" hint="10-digit mobile number">
            <TextInput
              value={editingDept.hodPhone || ""}
              onChange={(e) => setEditingDept({ ...editingDept, hodPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="9876543210"
            />
          </Field>

          <Field label="Department Access Code" hint="Used by HOD to log in">
            <div style={{ display: "flex", gap: 8 }}>
              <TextInput
                value={editingDept.accessCode}
                onChange={(e) => setEditingDept({ ...editingDept, accessCode: e.target.value.toUpperCase().slice(0, 8) })}
                style={{ fontFamily: "monospace", letterSpacing: 2, fontWeight: 700 }}
              />
              {!isNewDept && (
                <button
                  type="button"
                  onClick={() => regenCode(editingDept.id)}
                  style={{
                    background: "#F0E9D5",
                    border: "1px solid #C9BE9E",
                    borderRadius: 9,
                    padding: "0 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  🔄 New Code
                </button>
              )}
            </div>
          </Field>

          <Field label="WhatsApp Group Invite Link">
            <TextInput
              value={editingDept.groupLink || ""}
              onChange={(e) => setEditingDept({ ...editingDept, groupLink: e.target.value })}
              placeholder="https://chat.whatsapp.com/..."
            />
          </Field>

          <RichTextField
            label="Volunteer Instructions"
            hint="Shown to registered volunteers in this department"
            editorKey={editingDept.id || "new-dept"}
            initialValue={editingDept.instructions || ""}
            onChange={(val) => setEditingDept({ ...editingDept, instructions: val })}
          />

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={editingDept.active}
              onChange={(e) => setEditingDept({ ...editingDept, active: e.target.checked })}
            />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Active in Registration Form</span>
          </label>

          <PrimaryButton onClick={() => saveDepartment(editingDept)}>
            💾 Save Department
          </PrimaryButton>
        </ModalShell>
      )}

      {/* In-app Custom Confirmation Modal (bypasses iframe native confirm restrictions) */}
      {confirmState && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(12, 17, 26, 0.65)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setConfirmState(null)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 16,
              padding: "24px 26px",
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              border: "1px solid #EFE7D2",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{confirmState.isDestructive ? "⚠️" : "ℹ️"}</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--font-display)" }}>
                {confirmState.title}
              </h3>
            </div>
            <p style={{ fontSize: 14, color: "#605646", lineHeight: 1.5, margin: "0 0 22px 0" }}>
              {confirmState.message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setConfirmState(null)}
                style={{
                  background: "#F5EFE0",
                  border: "1px solid #E2D9C3",
                  color: "var(--ink)",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  await action();
                }}
                style={{
                  background: confirmState.isDestructive ? "var(--maroon)" : "var(--primary)",
                  border: "none",
                  color: "#FFFFFF",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: confirmState.isDestructive ? "0 2px 8px rgba(184,51,42,0.3)" : "0 2px 8px rgba(242,125,38,0.3)",
                }}
              >
                {confirmState.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Toast Banner */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 10000,
            background:
              toast.type === "success"
                ? "#14532D"
                : toast.type === "error"
                ? "#7F1D1D"
                : "#1E293B",
            color: "#FFFFFF",
            borderRadius: 10,
            padding: "12px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
            maxWidth: 380,
          }}
        >
          <span>{toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}</span>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#FFFFFF",
              opacity: 0.7,
              cursor: "pointer",
              padding: 0,
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
