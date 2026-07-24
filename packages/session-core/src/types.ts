export type CapabilityProfile = "read" | "write-project" | "process" | "git" | "full-local";

export interface SessionRecord {
  sessionId: string;
  client: string;
  projectRoot: string;
  profile: CapabilityProfile;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  processIds: number[];
  worktreePaths: string[];
  approvalState: Record<string, boolean>;
  checkpointId?: string;
  agencyHarness?: {
    autoInjected: boolean;
    skillsCount: number;
    availableRoles: string[];
    codingToolsCount: number;
  };
  status: "active" | "idle" | "expired" | "revoked";
}

export interface SessionTokenPayload {
  sessionId: string;
  client: string;
  projectRoot: string;
  profile: CapabilityProfile;
  exp: number;
}
