import type { FamilyMember, MediaKind, MemoryStatus } from './types';

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function memberName(members: FamilyMember[], id: string): string {
  return members.find((member) => member.id === id)?.name ?? 'A family member';
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

export function mediaLabel(media: MediaKind[]): string {
  const labels: Record<MediaKind, string> = {
    photo: 'Photo',
    story: 'Story',
    voice: 'Voice',
  };
  return media.map((kind) => labels[kind]).join(' + ');
}

export function statusLabel(status: MemoryStatus): string {
  const labels: Record<MemoryStatus, string> = {
    active: 'Active',
    sensitive: 'Sensitive',
    paused: 'Paused',
    archived: 'Archived',
  };
  return labels[status];
}

export function roleLabel(role: FamilyMember['role']): string {
  return role === 'admin' ? 'Family Admin' : 'Family Member';
}
