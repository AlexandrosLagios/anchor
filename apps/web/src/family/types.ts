export type FamilyRole = 'admin' | 'member';

export type AccessStatus = 'active' | 'removed';

export type MemoryStatus = 'active' | 'sensitive' | 'paused' | 'archived';

export type MediaKind = 'photo' | 'story' | 'voice';

export type Contribution = {
  id: string;
  memberId: string;
  kind: 'story' | 'voice';
  text: string;
};

export type FamilyMember = {
  id: string;
  name: string;
  relationship: string;
  role: FamilyRole;
  memorySupport: boolean;
  access: AccessStatus;
  joined: string;
};

export type Memory = {
  id: string;
  title: string;
  sharedById: string;
  date: string;
  media: MediaKind[];
  contributorIds: string[];
  status: MemoryStatus;
  originalMessage: string;
  contributions: Contribution[];
  returnToFamily: boolean;
  memorySupport: boolean;
  scene: string;
};

export type AuditEntry = {
  id: string;
  date: string;
  text: string;
};

export type ConnectionStatus = 'active' | 'disconnected';

export type FamilySettings = {
  suggestMoments: boolean;
  memorySupportEnabled: boolean;
  consentStatus: 'active' | 'paused';
  lastReviewed: string;
  attribution: boolean;
  resurfacing: 'Occasional' | 'Paused';
  connection: ConnectionStatus;
  connectedById: string;
};

export type FamilyState = {
  members: FamilyMember[];
  memories: Memory[];
  audit: AuditEntry[];
  settings: FamilySettings;
  sessionNote: string;
};
