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
  sizes: number[];
  micron: number;
  oneRollMeter: number;
  eachCoilQuantity: number;
  eachCoilRolls: number;
  status: 'pending' | 'in-progress' | 'completed';
  createdBy: string;
  createdAt: string;
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
