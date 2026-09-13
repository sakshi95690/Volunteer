import React, { useState, useEffect, useCallback } from "react";
import type { Festival, HODSession } from "./types";
import { FestivalPicker } from "./components/FestivalPicker";
import { RegisterView } from "./components/RegisterView";
import { FindCardView } from "./components/FindCardView";
import { HODLogin, HODDashboard } from "./components/HODPortal";
import { AdminLogin, AdminPortal } from "./components/AdminPortal";
import { api } from "./api";

export default function App() {
  const [activeTab, setActiveTab] = useState<"register" | "find" | "hod" | "admin">("register");
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedFestId, setPickedFestId] = useState<string | null>(null);
  const [findContact, setFindContact] = useState<string | null>(null);
  const [hodSession, setHodSession] = useState<HODSession | null>(null);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);

  // Load festivals
  const loadFestivals = useCallback(async () => {
    try {
      const list = await api.getFestivals(false);
      setFestivals(list);
    } catch (err) {
      console.error("Failed to load festivals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle URL hash navigation (e.g. #fid=...)
  useEffect(() => {
    function parseHash() {
      const hash = window.location.hash;
      if (hash.startsWith("#fid=")) {
        const id = hash.replace("#fid=", "");
        setPickedFestId(id);
        setActiveTab("register");
      }
    }
    parseHash();
    window.addEventListener("hashchange", parseHash);
    return () => window.removeEventListener("hashchange", parseHash);
  }, []);

  // Check auth session
  useEffect(() => {
    loadFestivals();
    async function initAuth() {
      try {
        const auth = await api.checkAuth();
        if (auth?.user?.role === "admin") {
          setAdminLoggedIn(true);
        } else if (auth?.user?.role === "hod" && auth?.session) {
          setHodSession(auth.session);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      }
    }
    initAuth();
  }, [loadFestivals]);

  const activeFestivals = festivals.filter((f) => f.active);
  const currentFest = activeFestivals.find((f) => f.id === pickedFestId) || activeFestivals[0] || null;

  return (
    <div className="app-container" style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      <div className="app-wrapper">
        {/* Seva Connect Header */}
        <header style={{ marginBottom: 16, textAlign: "center", paddingTop: 4 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: "var(--primary, #14415C)",
              margin: "2px 0 12px",
              lineHeight: 1.2,
            }}
          >
            Seva Connect
          </h1>

          {/* Active Session Indicator (if logged into Admin or HOD) */}
          {(adminLoggedIn || hodSession) && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: adminLoggedIn ? "#E5EDF5" : "#FBF3E0",
                border: `1px solid ${adminLoggedIn ? "#B9D1E6" : "#E8D09E"}`,
                borderRadius: 20,
                padding: "3px 12px",
                marginBottom: 10,
                fontSize: 11.5,
                fontWeight: 600,
                color: adminLoggedIn ? "var(--primary, #14415C)" : "#A06B08",
              }}
            >
              <span>
                {adminLoggedIn
                  ? "🛡️ Super Admin"
                  : `🏷️ HOD: ${hodSession?.department?.name || "Lead"}`}
              </span>
              <button
                onClick={() => {
                  if (adminLoggedIn) setAdminLoggedIn(false);
                  if (hodSession) setHodSession(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8C2424",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                }}
              >
                (Logout)
              </button>
            </div>
          )}

          {/* Segmented Navigation Bar - Mobile-first responsive layout */}
          <nav
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 3,
              background: "#EBE4D3",
              border: "1px solid #DFD6C2",
              padding: 3,
              borderRadius: 11,
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            {[
              { id: "register", label: "Register", icon: "📝" },
              { id: "find", label: "Find Card", icon: "🔍" },
              { id: "hod", label: "HOD", icon: "🏷️" },
              { id: "admin", label: "Admin", icon: "🛡️" },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    background: active ? "var(--primary, #14415C)" : "transparent",
                    color: active ? "#FFFFFF" : "var(--ink, #241E15)",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 2px",
                    minHeight: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    cursor: "pointer",
                    boxShadow: active ? "0 2px 8px rgba(20,65,92,0.22)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{tab.icon}</span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: active ? 700 : 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </header>

        {/* Main View Content */}
        <main>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#8A8375" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🪷</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Loading volunteer portal…</div>
            </div>
          ) : (
            <>
              {/* TAB 1: REGISTER */}
              {activeTab === "register" && (
                <>
                  {!currentFest || (!pickedFestId && activeFestivals.length > 1) ? (
                    <FestivalPicker
                      festivals={activeFestivals}
                      onPick={(id) => {
                        setPickedFestId(id);
                        window.location.hash = `#fid=${id}`;
                      }}
                    />
                  ) : (
                    <RegisterView
                      festival={currentFest}
                      onGoFind={(contact) => {
                        setFindContact(contact);
                        setActiveTab("find");
                      }}
                      onSwitchFestival={() => setPickedFestId(null)}
                      multipleFestivals={activeFestivals.length > 1}
                    />
                  )}
                </>
              )}

              {/* TAB 2: FIND CARD */}
              {activeTab === "find" && (
                <FindCardView festivals={festivals} prefillId={findContact} />
              )}

              {/* TAB 3: HOD PORTAL */}
              {activeTab === "hod" && (
                <>
                  {!hodSession ? (
                    <HODLogin onLogin={(sess) => setHodSession(sess)} />
                  ) : (
                    <HODDashboard session={hodSession} onLogout={() => setHodSession(null)} />
                  )}
                </>
              )}

              {/* TAB 4: ADMIN PORTAL */}
              {activeTab === "admin" && (
                <>
                  {!adminLoggedIn ? (
                    <AdminLogin onLogin={() => setAdminLoggedIn(true)} />
                  ) : (
                    <AdminPortal
                      festivals={festivals}
                      onRefreshFestivals={loadFestivals}
                      onLogout={() => setAdminLoggedIn(false)}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
