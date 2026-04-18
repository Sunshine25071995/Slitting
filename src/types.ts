export type UserRole = 'admin' | 'operator';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface JobCard {
  id?: string;
  jobNumber: string;
  date: string;
  customerName: string;
  micron: number;
  totalQuantity: number;
  totalLength: number;
  coilPlan: { size: number; rolls: number }[];
  status: 'pending' | 'in-progress' | 'completed';
  createdBy: string;
  createdAt: string;
  // Legacy fields for compatibility
  sizes: number[];
  eachCoilRolls: number;
  oneRollMeter: number;
  eachCoilQuantity: number;
}

export interface SlittingEntry {
  id?: string;
  jobId: string;
  coilSize: number;
  grossWeight: number;
  coreWeight: number;
  netWeight: number;
  meter: number;
  operatorUid: string;
  timestamp: string;
}
