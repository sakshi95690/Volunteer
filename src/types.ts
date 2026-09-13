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
  departments: Department[];
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
  createdAt?: number;
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
  capacity?: number | string | null;
  instructions?: string;
  currentCount?: number;
  isFull?: boolean;
  archivedAt?: number | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: number;
}

export interface HodUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  departmentId?: string;
  festivalId?: string;
  active: boolean;
  createdAt: number;
}

export type HODUser = HodUser;

export type VolunteerStatus =
  | "Draft"
  | "Pending for Approval"
  | "Approved"
  | "Pending for Printing"
  | "Printed"
  | "Rejected";

export interface Volunteer {
  id: string;
  recordId?: string; // alias for compatibility
  festivalId: string;
  volunteerNumber: number;
  volunteerId?: number; // alias
  fullName: string;
  contact: string;
  email?: string;
  timeSlot: string;
  departmentId: string;
  department?: string; // alias
  age?: string | number;
  gender?: string;
  address?: string;
  photoUrl: string;
  photo?: string; // alias
  status: VolunteerStatus;
  customFields?: Record<string, string>;
  archivedAt?: number | null;
  createdAt: number;
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

export interface HODSession {
  festival: Festival;
  department: Department;
}
