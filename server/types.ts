export interface Festival {
  id: string;
  name: string;
  code: string;
  dateLabel: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  emoji: string;
  active: boolean;
  bannerImageUrl?: string;
  logoImageUrl?: string;
  description?: string;
  timeSlots: string[];
  formConfig: {
    email: { enabled: boolean; required: boolean };
    age: { enabled: boolean; required: boolean };
    gender: { enabled: boolean; required: boolean };
    address: { enabled: boolean; required: boolean };
  };
  customFields: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
  cardConfig: {
    primaryColor: string;
    accentColor: string;
    showDepartment: boolean;
    showContact: boolean;
    showHOD: boolean;
    showTimeSlot: boolean;
  };
  archivedAt?: number | null;
  createdAt: number;
  updatedAt?: number;
}

export interface Department {
  id: string;
  festivalId: string;
  name: string;
  emoji: string;
  active: boolean;
  groupLink?: string;
  hodName?: string;
  hodPhone?: string;
  hodUserId?: string;
  logoUrl?: string;
  accessCode: string;
  capacity?: number | null;
  instructions?: string;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt?: number;
}

export type VolunteerStatus = 
  | "Draft"
  | "Pending for Approval"
  | "Approved"
  | "Pending for Printing"
  | "Printed"
  | "Rejected";

export interface Volunteer {
  id: string;
  festivalId: string;
  volunteerNumber: number;
  fullName: string;
  contact: string;
  email?: string;
  timeSlot: string;
  departmentId: string;
  age?: string | number;
  gender?: string;
  address?: string;
  photoUrl: string;
  status: VolunteerStatus;
  customFields?: Record<string, string>;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt?: number;
}

export interface VolunteerStatusHistory {
  id: string;
  volunteerId: string;
  oldStatus?: string;
  newStatus: string;
  changedBy: string;
  changedAt: number;
  remarks?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin";
  active: boolean;
  createdAt: number;
}

export interface HODUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  departmentId?: string;
  festivalId?: string;
  active: boolean;
  createdAt: number;
}
