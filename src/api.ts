import type { Festival, Department, Volunteer, VolunteerStatus, AdminUser, HodUser } from "./types";

// In a split deployment (frontend on Firebase, backend on Render), the API
// lives on a different origin, so it must be an absolute URL supplied at
// build time via VITE_API_URL (e.g. "https://your-app.onrender.com/api").
// Falls back to the relative "/api" for same-origin/monolith deployments.
const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api";

class ApiClient {
  private adminToken: string | null = null;
  private hodToken: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.adminToken = localStorage.getItem("iskcon_admin_token");
      this.hodToken = localStorage.getItem("iskcon_hod_token");
    }
  }

  setAdminToken(token: string | null) {
    this.adminToken = token;
    if (token) {
      localStorage.setItem("iskcon_admin_token", token);
    } else {
      localStorage.removeItem("iskcon_admin_token");
    }
  }

  setHODToken(token: string | null) {
    this.hodToken = token;
    if (token) {
      localStorage.setItem("iskcon_hod_token", token);
    } else {
      localStorage.removeItem("iskcon_hod_token");
    }
  }

  hasAdminToken(): boolean {
    return !!this.adminToken;
  }

  hasHODToken(): boolean {
    return !!this.hodToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    tokenType: "admin" | "hod" | "none" = "none"
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (tokenType === "admin" && this.adminToken) {
      headers["Authorization"] = `Bearer ${this.adminToken}`;
    } else if (tokenType === "hod" && this.hodToken) {
      headers["Authorization"] = `Bearer ${this.hodToken}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.error || `Request failed with status ${res.status}`;
      throw new Error(msg);
    }

    return data as T;
  }

  // AUTH
  async adminLogin(password: string, email?: string): Promise<{ token: string; user: any }> {
    const res = await this.request<{ token: string; user: any }>("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ password, email }),
    });
    this.setAdminToken(res.token);
    return res;
  }

  async hodLogin(
    accessCode: string
  ): Promise<{ token: string; session: { festival: Festival; department: Department } }> {
    const res = await this.request<{
      token: string;
      session: { festival: Festival; department: Department };
    }>("/auth/hod/login", {
      method: "POST",
      body: JSON.stringify({ accessCode }),
    });
    this.setHODToken(res.token);
    return res;
  }

  async checkAuth(): Promise<any> {
    return this.request(
      "/auth/me",
      {},
      this.adminToken ? "admin" : this.hodToken ? "hod" : "none"
    );
  }

  adminLogout() {
    this.setAdminToken(null);
  }

  hodLogout() {
    this.setHODToken(null);
  }

  // FESTIVALS
  async getFestivals(activeOnly = false, includeArchived = false): Promise<Festival[]> {
    const list = await this.request<any[]>(
      `/festivals?activeOnly=${activeOnly}&includeArchived=${includeArchived}`
    );
    return Promise.all(
      list.map(async (f) => {
        const full = await this.getFestival(f.id);
        return full;
      })
    );
  }

  async getFestival(id: string): Promise<Festival> {
    const raw = await this.request<any>(`/festivals/${id}`);
    return {
      ...raw,
      bannerImageUrl: raw.bannerImageUrl || raw.bannerImage || "",
      logoImageUrl: raw.logoImageUrl || raw.logoImage || "",
      departments: (raw.departments || []).map((d: any) => ({
        ...d,
        logoUrl: d.logoUrl || d.logo || "",
      })),
      customFields: raw.customFields || [],
    };
  }

  async createFestival(data: Partial<Festival>): Promise<Festival> {
    return this.request<Festival>(
      "/festivals",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      "admin"
    );
  }

  async publishFestival(id: string): Promise<{ success: boolean; festival: Festival }> {
    return this.request<{ success: boolean; festival: Festival }>(
      `/festivals/${id}/publish`,
      {
        method: "POST",
      },
      "admin"
    );
  }

  async updateFestival(id: string, updates: Partial<Festival>): Promise<Festival> {
    return this.request<Festival>(
      `/festivals/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
      "admin"
    );
  }

  async deleteFestival(id: string, permanent = false): Promise<void> {
    await this.request(
      `/festivals/${id}?permanent=${permanent}`,
      {
        method: "DELETE",
      },
      "admin"
    );
  }

  async restoreFestival(id: string): Promise<void> {
    await this.request(
      `/festivals/${id}/restore`,
      {
        method: "POST",
      },
      "admin"
    );
  }

  async duplicateFestival(id: string): Promise<Festival> {
    return this.request<Festival>(
      `/festivals/${id}/duplicate`,
      {
        method: "POST",
      },
      "admin"
    );
  }

  // DEPARTMENTS
  async getDepartments(
    festivalId: string,
    activeOnly = false,
    includeArchived = false
  ): Promise<Department[]> {
    return this.request<Department[]>(
      `/festivals/${festivalId}/departments?activeOnly=${activeOnly}&includeArchived=${includeArchived}`
    );
  }

  async createDepartment(festivalId: string, data: Partial<Department>): Promise<Department> {
    return this.request<Department>(
      `/festivals/${festivalId}/departments`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      "admin"
    );
  }

  async updateDepartment(id: string, updates: Partial<Department>): Promise<Department> {
    return this.request<Department>(
      `/departments/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
      "admin"
    );
  }

  async deleteDepartment(id: string, permanent = false): Promise<void> {
    await this.request(
      `/departments/${id}?permanent=${permanent}`,
      {
        method: "DELETE",
      },
      "admin"
    );
  }

  async deleteDepartmentsBulk(ids: string[], permanent = false): Promise<{ success: boolean; deletedCount: number }> {
    return this.request<{ success: boolean; deletedCount: number }>(
      "/departments/bulk-delete",
      {
        method: "POST",
        body: JSON.stringify({ ids, permanent }),
      },
      "admin"
    );
  }

  async restoreDepartment(id: string): Promise<void> {
    await this.request(
      `/departments/${id}/restore`,
      {
        method: "POST",
      },
      "admin"
    );
  }

  async regenerateAccessCode(id: string): Promise<string> {
    const res = await this.request<{ accessCode: string }>(
      `/departments/${id}/new-code`,
      {
        method: "POST",
      },
      "admin"
    );
    return res.accessCode;
  }

  // REGISTRATIONS
  async createRegistration(data: {
    festivalId: string;
    fullName: string;
    contact: string;
    email?: string;
    timeSlot: string;
    departmentId: string;
    age?: string | number;
    gender?: string;
    address?: string;
    photo: string;
    customFields?: Record<string, string>;
  }): Promise<{ volunteer: Volunteer; festival: Festival; department: Department; formattedId: string }> {
    const res = await this.request<any>("/registrations", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return {
      ...res,
      volunteer: {
        ...res.volunteer,
        recordId: res.volunteer.id,
        volunteerId: res.volunteer.volunteerNumber,
        department: res.volunteer.departmentId,
        photo: res.volunteer.photoUrl,
      },
    };
  }

  async findRegistrations(
    contact: string
  ): Promise<Array<{ volunteer: Volunteer; festival: Festival; department: Department }>> {
    const list = await this.request<any[]>(
      `/registrations/find?contact=${encodeURIComponent(contact)}`
    );
    return list.map((item) => ({
      ...item,
      volunteer: {
        ...item.volunteer,
        recordId: item.volunteer.id,
        volunteerId: item.volunteer.volunteerNumber,
        department: item.volunteer.departmentId,
        photo: item.volunteer.photoUrl,
      },
    }));
  }

  async getRegistrations(params: {
    festivalId?: string;
    departmentId?: string;
    timeSlot?: string;
    status?: string;
    search?: string;
    includeArchived?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ volunteers: Volunteer[]; total: number; page: number; totalPages: number }> {
    const query = new URLSearchParams();
    if (params.festivalId) query.set("festivalId", params.festivalId);
    if (params.departmentId) query.set("departmentId", params.departmentId);
    if (params.timeSlot) query.set("timeSlot", params.timeSlot);
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    if (params.includeArchived) query.set("includeArchived", "true");
    if (params.page) query.set("page", params.page.toString());
    if (params.limit) query.set("limit", params.limit.toString());

    const res = await this.request<any>(`/registrations?${query.toString()}`, {}, "admin");
    return {
      ...res,
      volunteers: res.volunteers.map((v: any) => ({
        ...v,
        recordId: v.id,
        volunteerId: v.volunteerNumber,
        department: v.departmentId,
        photo: v.photoUrl,
      })),
    };
  }

  async getRegistrationDetails(id: string): Promise<any> {
    return this.request(`/registrations/${id}`, {}, "hod");
  }

  async updateRegistrationStatus(
    id: string,
    status: VolunteerStatus,
    remarks?: string
  ): Promise<Volunteer> {
    const tokenType = this.adminToken ? "admin" : "hod";
    const updated = await this.request<any>(
      `/registrations/${id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, remarks }),
      },
      tokenType
    );
    return {
      ...updated,
      recordId: updated.id,
      volunteerId: updated.volunteerNumber,
      department: updated.departmentId,
      photo: updated.photoUrl,
    };
  }

  async updateRegistration(id: string, updates: Partial<Volunteer>): Promise<Volunteer> {
    const tokenType = this.adminToken ? "admin" : "hod";
    const updated = await this.request<any>(
      `/registrations/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(updates),
      },
      tokenType
    );
    return {
      ...updated,
      recordId: updated.id,
      volunteerId: updated.volunteerNumber,
      department: updated.departmentId,
      photo: updated.photoUrl,
    };
  }

  async deleteRegistration(id: string, permanent = false): Promise<void> {
    await this.request(
      `/registrations/${id}?permanent=${permanent}`,
      {
        method: "DELETE",
      },
      "admin"
    );
  }

  async deleteRegistrationsBulk(ids: string[], permanent = false): Promise<{ success: boolean; deletedCount: number }> {
    return this.request<{ success: boolean; deletedCount: number }>(
      "/registrations/bulk-delete",
      {
        method: "POST",
        body: JSON.stringify({ ids, permanent }),
      },
      "admin"
    );
  }

  async restoreRegistration(id: string): Promise<void> {
    await this.request(
      `/registrations/${id}/restore`,
      {
        method: "POST",
      },
      "admin"
    );
  }

  async getHODRegistrations(params?: { search?: string; status?: string }): Promise<{
    volunteers: Volunteer[];
    total: number;
    department: Department;
    festival: Festival;
  }> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.status) query.set("status", params.status);

    const res = await this.request<any>(`/hod/registrations?${query.toString()}`, {}, "hod");
    return {
      ...res,
      volunteers: res.volunteers.map((v: any) => ({
        ...v,
        recordId: v.id,
        volunteerId: v.volunteerNumber,
        department: v.departmentId,
        photo: v.photoUrl,
      })),
    };
  }

  async uploadFile(file: File, bucket = "volunteer-photos"): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);

    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "File upload failed");
    }
    return data.url;
  }

  async uploadBase64(base64: string, prefix = "image", bucket = "volunteer-photos"): Promise<string> {
    const res = await this.request<{ url: string }>("/upload", {
      method: "POST",
      body: JSON.stringify({ base64, prefix, bucket }),
    });
    return res.url;
  }

  // ADMIN USERS (Requirement 6)
  async getAdminUsers(): Promise<AdminUser[]> {
    return this.request<AdminUser[]>("/admin/users", {}, "admin");
  }

  async createAdminUser(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
  }): Promise<AdminUser> {
    return this.request<AdminUser>(
      "/admin/users",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      "admin"
    );
  }

  async updateAdminUser(
    id: string,
    updates: Partial<AdminUser> & { password?: string }
  ): Promise<AdminUser> {
    return this.request<AdminUser>(
      `/admin/users/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
      "admin"
    );
  }

  async deleteAdminUser(id: string, permanent = false): Promise<void> {
    await this.request(
      `/admin/users/${id}?permanent=${permanent}`,
      {
        method: "DELETE",
      },
      "admin"
    );
  }

  // HOD USERS (Requirement 8)
  async getHodUsers(): Promise<HodUser[]> {
    return this.request<HodUser[]>("/admin/hod-users", {}, "admin");
  }

  async createHodUser(data: {
    name: string;
    phone: string;
    email?: string;
    departmentId?: string;
  }): Promise<HodUser> {
    return this.request<HodUser>(
      "/admin/hod-users",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      "admin"
    );
  }

  async updateHodUser(id: string, updates: Partial<HodUser>): Promise<HodUser> {
    return this.request<HodUser>(
      `/admin/hod-users/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
      "admin"
    );
  }

  async deleteHodUser(id: string): Promise<void> {
    await this.request(
      `/admin/hod-users/${id}`,
      {
        method: "DELETE",
      },
      "admin"
    );
  }
}

export const api = new ApiClient();
