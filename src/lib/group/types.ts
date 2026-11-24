import type { DesignSelection } from "@/lib/pricing/types";

/** "open" takes new people · "locked" stops joins and member edits · "closed" is final (sent to checkout). */
export type GroupStatus = "open" | "locked" | "closed";

export interface GroupSettings {
  /** Sizes members can pick. */
  allowedSizes: string[];
  /** Let one person order more than one piece. */
  allowQuantity: boolean;
  /** Optional cap on the total number of pieces. */
  maxPieces?: number;
  /** Optional class list: only these names can join. */
  allowedNames?: string[];
}

/** What anyone with the group link can see. Never includes members' details. */
export interface PublicGroup {
  code: string;
  name: string;
  organizerFirstName: string;
  design: DesignSelection;
  deliverySpeedId: string;
  /** Last day to join, "YYYY-MM-DD" (Cairo time). */
  deadline: string;
  status: GroupStatus;
  settings: Omit<GroupSettings, "allowedNames"> & { hasNameList: boolean };
  memberCount: number;
  pieceCount: number;
  isOpen: boolean;
}

export interface GroupMember {
  id: string;
  name: string;
  phone: string;
  number: string;
  sizeId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

/** What the organizer sees with their private key. */
export interface AdminGroup extends Omit<PublicGroup, "settings"> {
  settings: GroupSettings;
  organizer: { name: string; phone: string; email: string };
  members: GroupMember[];
  createdAt: string;
}

export interface MemberInput {
  name: string;
  phone: string;
  number?: string;
  sizeId: string;
  quantity?: number;
}

export type GroupErrorCode =
  | "notFound"
  | "unauthorized"
  | "closed"
  | "pastDeadline"
  | "invalid"
  | "duplicateName"
  | "duplicatePhone"
  | "notOnList"
  | "full"
  | "missingAssets"
  | "designProblem"
  | "tooManyRequests";
