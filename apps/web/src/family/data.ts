import type { AuditEntry, FamilyMember, FamilySettings, FamilyState, Memory, MemoryStatus, MediaKind } from './types';

export const FAMILY_NAME = 'Papadopoulos Family';
export const CONNECTED_CHAT = 'Family WhatsApp';

export const members: FamilyMember[] = [
  {
    id: 'nikos',
    name: 'Nikos Papadopoulos',
    relationship: 'Grandfather',
    role: 'member',
    memorySupport: true,
    access: 'active',
    joined: '2026-03-02',
  },
  {
    id: 'eleni',
    name: 'Eleni Papadopoulou',
    relationship: 'Daughter',
    role: 'admin',
    memorySupport: false,
    access: 'active',
    joined: '2026-03-02',
  },
  {
    id: 'maria',
    name: 'Maria Papadopoulou',
    relationship: 'Granddaughter',
    role: 'member',
    memorySupport: false,
    access: 'active',
    joined: '2026-09-12',
  },
  {
    id: 'giorgos',
    name: 'Giorgos Papadopoulos',
    relationship: 'Son',
    role: 'member',
    memorySupport: false,
    access: 'active',
    joined: '2026-03-18',
  },
];

const featured: Memory[] = [
  {
    id: 'marias-first-day',
    title: "Maria's First Day of School",
    sharedById: 'eleni',
    date: '2026-09-25',
    media: ['photo', 'story', 'voice'],
    contributorIds: ['eleni', 'nikos', 'maria'],
    status: 'active',
    originalMessage: "She ran through the gate with her new backpack and didn't even look back!",
    contributions: [
      {
        id: 'c1',
        memberId: 'nikos',
        kind: 'voice',
        text: 'She came out holding a drawing for her grandpa.',
      },
      {
        id: 'c2',
        memberId: 'maria',
        kind: 'story',
        text: 'I still have that drawing!',
      },
    ],
    returnToFamily: true,
    memorySupport: true,
    scene: 'school',
  },
  {
    id: 'summer-aegina',
    title: 'Summer in Aegina',
    sharedById: 'nikos',
    date: '2026-08-14',
    media: ['photo', 'voice'],
    contributorIds: ['nikos', 'maria'],
    status: 'active',
    originalMessage: 'The pistachios were ready, and Maria wanted the first bowl.',
    contributions: [
      {
        id: 'c3',
        memberId: 'maria',
        kind: 'story',
        text: 'You let me steer the little boat around the harbour.',
      },
    ],
    returnToFamily: true,
    memorySupport: true,
    scene: 'island',
  },
  {
    id: 'anna-seaside',
    title: 'Anna at the Seaside',
    sharedById: 'nikos',
    date: '2014-07-03',
    media: ['photo', 'story'],
    contributorIds: ['nikos'],
    status: 'sensitive',
    originalMessage: 'Anna laughed the whole way down to the water, sunhat in one hand.',
    contributions: [],
    returnToFamily: false,
    memorySupport: false,
    scene: 'seaside',
  },
];

type Seed = {
  title: string;
  sharedById: string;
  date: string;
  media: MediaKind[];
  status: MemoryStatus;
  originalMessage: string;
  scene: string;
};

const more: Seed[] = [
  {
    title: 'Sunday lunch in Kypseli',
    sharedById: 'giorgos',
    date: '2026-09-07',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'The table was too small and nobody minded.',
    scene: 'table',
  },
  {
    title: 'Easter bread on the balcony',
    sharedById: 'eleni',
    date: '2026-04-12',
    media: ['photo', 'story', 'voice'],
    status: 'active',
    originalMessage: 'Nikos scored the tsoureki the way Yiayia taught him.',
    scene: 'bread',
  },
  {
    title: 'Name day candles',
    sharedById: 'maria',
    date: '2026-08-15',
    media: ['photo'],
    status: 'active',
    originalMessage: 'We sang before the cake was cut.',
    scene: 'candles',
  },
  {
    title: 'The olive harvest',
    sharedById: 'nikos',
    date: '2025-11-09',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'Giorgos filled two crates before lunch.',
    scene: 'grove',
  },
  {
    title: 'Rain on Ermou',
    sharedById: 'eleni',
    date: '2026-01-22',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'We shared one umbrella and still got soaked.',
    scene: 'rain',
  },
  {
    title: 'First bike without stabilisers',
    sharedById: 'giorgos',
    date: '2025-06-02',
    media: ['photo', 'voice'],
    status: 'active',
    originalMessage: 'Maria looked back only once.',
    scene: 'bike',
  },
  {
    title: 'Christmas Eve in the kitchen',
    sharedById: 'eleni',
    date: '2025-12-24',
    media: ['photo', 'story', 'voice'],
    status: 'active',
    originalMessage: 'The melomakarona were still warm when everyone arrived.',
    scene: 'kitchen',
  },
  {
    title: 'Ferry to Poros',
    sharedById: 'maria',
    date: '2026-07-19',
    media: ['photo'],
    status: 'active',
    originalMessage: 'Nikos kept the tickets in his shirt pocket.',
    scene: 'ferry',
  },
  {
    title: 'The yellow kitchen radio',
    sharedById: 'nikos',
    date: '2024-05-11',
    media: ['story', 'voice'],
    status: 'active',
    originalMessage: 'It only finds one station, and that is enough.',
    scene: 'radio',
  },
  {
    title: 'School play, second row',
    sharedById: 'eleni',
    date: '2026-03-28',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'Maria waved at us in the middle of her line.',
    scene: 'stage',
  },
  {
    title: 'New shoes for the village',
    sharedById: 'giorgos',
    date: '2026-02-14',
    media: ['photo'],
    status: 'active',
    originalMessage: 'Nikos insisted on walking home in them.',
    scene: 'street',
  },
  {
    title: 'Garden tomatoes',
    sharedById: 'nikos',
    date: '2026-06-21',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'The first ripe ones went straight into the salad.',
    scene: 'garden',
  },
  {
    title: 'Birthday on the roof',
    sharedById: 'maria',
    date: '2025-09-25',
    media: ['photo', 'voice'],
    status: 'active',
    originalMessage: 'We could see the Acropolis between the aerials.',
    scene: 'roof',
  },
  {
    title: 'Library card',
    sharedById: 'eleni',
    date: '2026-05-04',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'Nikos borrowed the same poet he read at twenty.',
    scene: 'books',
  },
  {
    title: 'Football in the square',
    sharedById: 'giorgos',
    date: '2026-04-26',
    media: ['photo'],
    status: 'active',
    originalMessage: 'The ball kept ending up under the cafe chairs.',
    scene: 'square',
  },
  {
    title: 'Handwritten recipe card',
    sharedById: 'nikos',
    date: '2023-10-01',
    media: ['photo', 'story'],
    status: 'sensitive',
    originalMessage: 'Anna wrote the measurements in the margin.',
    scene: 'recipe',
  },
  {
    title: 'The empty chair at Easter',
    sharedById: 'eleni',
    date: '2025-04-20',
    media: ['story'],
    status: 'sensitive',
    originalMessage: 'We set a place, and nobody rushed the silence.',
    scene: 'linen',
  },
  {
    title: 'Morning swim',
    sharedById: 'nikos',
    date: '2026-07-02',
    media: ['photo', 'voice'],
    status: 'paused',
    originalMessage: 'The water was cold enough to wake everyone up.',
    scene: 'swim',
  },
  {
    title: 'Train to Nafplio',
    sharedById: 'giorgos',
    date: '2026-05-30',
    media: ['photo', 'story'],
    status: 'paused',
    originalMessage: 'Maria counted the stations out loud.',
    scene: 'train',
  },
  {
    title: 'Old apartment keys',
    sharedById: 'eleni',
    date: '2019-08-09',
    media: ['photo', 'story'],
    status: 'archived',
    originalMessage: 'We locked the door for the last time and kept the keys.',
    scene: 'keys',
  },
  {
    title: 'Carnival costumes',
    sharedById: 'maria',
    date: '2024-03-03',
    media: ['story'],
    status: 'archived',
    originalMessage: 'Nikos wore the paper crown without being asked.',
    scene: 'carnival',
  },
  {
    title: 'Market flowers',
    sharedById: 'giorgos',
    date: '2026-03-08',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'Hyacinths for the hallway table.',
    scene: 'flowers',
  },
  {
    title: 'Board games after dinner',
    sharedById: 'maria',
    date: '2026-01-11',
    media: ['photo', 'voice'],
    status: 'active',
    originalMessage: 'Nikos won and pretended to be surprised.',
    scene: 'games',
  },
  {
    title: 'The blue door',
    sharedById: 'nikos',
    date: '2022-09-16',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'We painted it the Saturday the neighbours helped.',
    scene: 'door',
  },
  {
    title: 'Picnic at Philopappos',
    sharedById: 'eleni',
    date: '2026-04-05',
    media: ['photo', 'story', 'voice'],
    status: 'active',
    originalMessage: 'The wind took the napkins and nobody chased them.',
    scene: 'hill',
  },
  {
    title: 'First day with the kitten',
    sharedById: 'maria',
    date: '2025-10-18',
    media: ['story'],
    status: 'active',
    originalMessage: 'She hid in Nikos’s slipper for an hour.',
    scene: 'kitten',
  },
  {
    title: 'Choir practice',
    sharedById: 'nikos',
    date: '2026-02-28',
    media: ['voice', 'story'],
    status: 'active',
    originalMessage: 'We only got through the first verse, and it was enough.',
    scene: 'choir',
  },
  {
    title: 'Watermelon on the steps',
    sharedById: 'giorgos',
    date: '2026-08-02',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'Salt on one slice, because Nikos says that is how you do it.',
    scene: 'steps',
  },
  {
    title: 'Letters from the village',
    sharedById: 'eleni',
    date: '2021-12-12',
    media: ['photo', 'story'],
    status: 'archived',
    originalMessage: 'The paper still smells faintly of the drawer.',
    scene: 'letters',
  },
  {
    title: 'Evening walk to the kiosk',
    sharedById: 'nikos',
    date: '2026-09-01',
    media: ['story', 'voice'],
    status: 'active',
    originalMessage: 'Maria chose the ice cream before we reached the corner.',
    scene: 'walk',
  },
  {
    title: 'Repairing the fishing net',
    sharedById: 'giorgos',
    date: '2025-08-23',
    media: ['photo', 'story'],
    status: 'active',
    originalMessage: 'Nikos still knows every knot.',
    scene: 'net',
  },
];

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const generated: Memory[] = more.map((item) => ({
  id: slug(item.title),
  title: item.title,
  sharedById: item.sharedById,
  date: item.date,
  media: item.media,
  contributorIds: [item.sharedById],
  status: item.status,
  originalMessage: item.originalMessage,
  contributions: [],
  returnToFamily: item.status === 'active',
  memorySupport: item.status === 'active',
  scene: item.scene,
}));

export const initialMemories: Memory[] = [...featured, ...generated];

export const initialAudit: AuditEntry[] = [
  { id: 'a1', date: '2026-09-25', text: 'Eleni added Maria to the Family Space' },
  { id: 'a2', date: '2026-09-24', text: 'Nikos paused “Anna at the Seaside”' },
  { id: 'a3', date: '2026-09-23', text: 'Family permissions were reviewed' },
  { id: 'a4', date: '2026-09-18', text: 'Eleni connected Family WhatsApp' },
];

export const initialSettings: FamilySettings = {
  suggestMoments: true,
  memorySupportEnabled: true,
  consentStatus: 'active',
  lastReviewed: '2026-09-25',
  attribution: true,
  resurfacing: 'Occasional',
  connection: 'active',
  connectedById: 'eleni',
};

export function createInitialState(): FamilyState {
  return {
    members: members.map((member) => ({ ...member })),
    memories: initialMemories.map((memory) => ({
      ...memory,
      media: [...memory.media],
      contributorIds: [...memory.contributorIds],
      contributions: memory.contributions.map((item) => ({ ...item })),
    })),
    audit: initialAudit.map((entry) => ({ ...entry })),
    settings: { ...initialSettings },
    sessionNote: 'Last sign-in today from this browser.',
  };
}

export const MEMORY_IDS = initialMemories.map((memory) => memory.id);
export const MEMBER_IDS = members.map((member) => member.id);
