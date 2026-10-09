export interface Team { id: string; name: string; lscCode?: string; clubCode?: string; location?: string; website?: string; email?: string; phone?: string; mailingAddress?: string; contactPersonIds?: string[]; venueIds?: string[]; documentIds?: string[] }
export interface Person { id: string; name: string; teamId: string; athleteId?: string; role?: string; email?: string; phone?: string; documentIds?: string[] }
export interface Venue { id: string; name: string; teamId?: string; address?: string; city?: string; state?: string; postalCode?: string; latitude?: number; longitude?: number; courses?: ('SCY' | 'SCM' | 'LCM')[]; website?: string; contactPersonIds?: string[]; documentIds?: string[] }
export interface SourceDocument { id: string; name: string; teamId: string; url: string; type?: string; meetId?: string; venueId?: string; personId?: string; athleteId?: string; publishedAt?: string; sourceId: string; currentRevisionId: string }

export interface Athlete {
  personId?: string;
  documentIds?: string[];
  teamId?: string; // Missing legacy ownership resolves to Velocity Swimming.
  id: string;                         // Canonical UUID or slug (e.g. "ath_cutter_christian_a1b2")
  swimsId?: string;                   // Official USA Swimming SWIMS ID (e.g. "012345CHRCUTTE")
  swimcloudId?: string;               // Swimcloud ID for external links
  teamUnifyId?: string;               // External roster sync ID for TeamUnify / Active

  // Personal Demographics
  name: {
    first: string;
    last: string;
    preferred?: string;               // e.g. "Chris"
    middle?: string;
  };
  gender: 'M' | 'F' | 'X';
  dob: string;                        // ISO-8601 "YYYY-MM-DD"
  graduatingYear?: number;            // High school graduation year (e.g. 2028)

  // Club Status & Training Hierarchy
  status: 'active' | 'taking_break' | 'alumni' | 'inactive';
  currentGroup: {
    id: string;                       // e.g. "seniors", "age_groupers", "littles"
    name: string;                     // Display name
    rosterTier?: string;              // Tier for color coding / badge styling
    assignedAt: string;               // ISO-8601 timestamp
  };

  // Aliases for Ingestion Matching (Solves Name Discrepancies)
  aliases: string[];                  // ["Christian Cutter", "Chris Cutter", "C. Cutter"]

  // Contact & Emergency (Coaches' Quick-Access)
  contact?: {
    email?: string;
    phone?: string;
    parents?: {
      name: string;
      email: string;
      phone: string;
      relationship: 'Mother' | 'Father' | 'Guardian';
    }[];
  };

  // Performance Highlights & Styling (Replaces separated highlights collection)
  styling?: {
    badgeColor?: string;              // Custom tag color in coach views
    notes?: string;                   // Private coach notes
    tags?: string[];                  // ["State Qualifier", "Captain", "College Prospect"]
  };

  metadata: {
    createdAt: string;                // ISO-8601
    updatedAt: string;
    syncedAt?: string;                // Last sync with external roster/TeamUnify
  };
}

export interface Swim {
  teamId?: string; // Missing legacy ownership resolves to Velocity Swimming.
  id: string;                         // Deterministic: `${athleteId}_${eventCode}_${meetId}_${round}`
  athleteId: string;                  // Foreign key to `athletes`
  isOfficial?: boolean; // False for exhibition or unofficial times.
  externalResult?: { namespace: string; id: string }; // Stable source race identity, including repeated swim-offs.
  athleteName: {
    first: string;
    last: string;
  };
  gender: 'M' | 'F' | 'X';
  ageAtSwim: number;                  // Integer age on day of meet
  ageGroup: '8&U' | '9-10' | '11-12' | '13-14' | '15-16' | '17-18' | 'Open' | 'Masters';

  // Discrete Event Specification
  eventCode: string;                  // Normalized key: `${distance}_${stroke}_${course}` (e.g. "100_FR_SCY")
  distance: 25 | 50 | 100 | 200 | 400 | 500 | 800 | 1000 | 1500 | 1650;
  stroke: 'FR' | 'BK' | 'BR' | 'FL' | 'IM';
  course: 'SCY' | 'SCM' | 'LCM';

  // Relay Context
  isRelay: boolean;
  relay?: {
    teamName: string;                 // "Velocity A"
    leg: 1 | 2 | 3 | 4;
    isLeadOffFlatStart: boolean;      // Leg 1 is official flat-start time eligible for records
    teamResultId?: string;            // ID of the parent 4-person relay result
  };

  // Time & Conversions
  timeMs: number;                     // Integer milliseconds (e.g. 54210 = 54.21s). Enables B-tree range queries.
  timeDisplay: string;                // "54.21" or "1:02.15" (human-readable cache)
  convertedTimes?: {
    scyMs?: number;                   // NCAA/USAS standardized course conversion
    lcmMs?: number;
    scmMs?: number;
  };

  // Race Splits & Telemetry
  splits?: {
    distance: number;                 // 50, 100, 150...
    cumulativeMs: number;             // Clock time at the wall
    lapMs: number;                    // Split time for that segment
    strokeCount?: number;             // Number of strokes in the lap
    tempoSeconds?: number;            // Average seconds per stroke cycle
  }[];
  reactionTimeMs?: number;            // Block reaction time (+0.65s = 650)

  // Disqualification & Official Status
  status: 'OK' | 'DQ' | 'DFS' | 'NS'; // OK, Disqualified, Declared False Start, No Show
  dqDetails?: {
    code: string;                     // e.g. "3J"
    description: string;              // "Non-simultaneous touch at turn 2"
  };

  // Meet & Environment
  meet: {
    id: string;                       // Reference to `meets`
    name: string;
    date: string;                     // ISO-8601 "YYYY-MM-DD"
    location?: string;
    altitudeFeet?: number;            // Altitude for USA Swimming adjustment calculations
  };
  round: 'F' | 'P' | 'S' | 'TT';      // Finals, Prelims, Swim-off, Time Trial

  // Motivational Standards Achieved
  standardsTag?: {
    usasMotivational?: 'B' | 'BB' | 'A' | 'AA' | 'AAA' | 'AAAA';
    champCut?: 'State' | 'Sectionals' | 'Futures' | 'JuniorNationals' | 'Nationals' | 'OlympicTrials';
    finaPoints?: number;
  };

  metadata: {
    source: 'swims_export' | 'hytek_hy3' | 'console_cts' | 'manual';
    createdAt: string;
  };
}

export interface AthleteBest {
  eventCode: string;                  // "100_FR_SCY"
  distance: number;
  stroke: 'FR' | 'BK' | 'BR' | 'FL' | 'IM';
  course: 'SCY' | 'SCM' | 'LCM';
  bestTimeMs: number;
  bestTimeDisplay: string;
  swimDate: string;                   // Date achieved
  meetName: string;
  swimId: string;                     // Direct link to the `swims` document
  standard: string;                   // Highest standard achieved ("AAAA")
  ageWhenSwum: number;
  clubRankAllTime: number;            // Precalculated all-time rank in club history
  clubRankActiveRoster: number;       // Current rank among active swimmers
}

export interface PracticeSession {
  teamId?: string; // Missing legacy ownership resolves to Velocity Swimming.
  id: string;                         // e.g. "ps_2026-09-12_seniors_am"
  date: string;                       // "YYYY-MM-DD"
  startTime: string;                  // "06:00"
  endTime: string;                    // "07:30"
  trainingGroup: string;              // "Seniors", "Age Groupers", "Littles"
  location: string;                   // "Main Pool - 50m LC", "Aux Pool - 25y"
  course: 'SCY' | 'LCM' | 'SCM';
  leadCoach: string;                  // Coach identifier
  plannedYardage?: number;            // e.g. 5500
  focusTheme?: string;                // "Aerobic Capacity", "Sprint / Starts", "IM Pacing"
  summaryStats?: {
    totalExpected: number;
    totalPresent: number;
    totalAbsent: number;
    attendanceRate: number;           // e.g. 0.88
  };
}

export interface AttendanceEntry {
  teamId?: string; // Missing legacy ownership resolves to Velocity Swimming.
  id: string;                         // `${sessionId}_${athleteId}`
  sessionId: string;                  // Foreign key to `practice_sessions`
  athleteId: string;                  // Foreign key to `athletes`
  athleteName: string;
  trainingGroup: string;
  date: string;                       // "YYYY-MM-DD"
  status: 'present' | 'absent' | 'excused' | 'late' | 'guest';
  checkInTime?: string;               // ISO-8601 timestamp
  notes?: string;                     // e.g. "Left early for physical therapy"
}

export type StandardTierName =
  | 'AAAA'
  | 'AAA'
  | 'AA'
  | 'A'
  | 'BB'
  | 'B'
  | 'Qualifying'
  | 'Bonus'
  | (string & {});

export type StandardAgeGroup =
  | '10&U'
  | '11-12'
  | '13-14'
  | '15-16'
  | '17-18'
  | '18&U'
  | '19&O'
  | 'Open'
  | (string & {});

export interface StandardTierCut {
  tierName: StandardTierName;
  timeMs: number;         // Millisecond benchmark
  timeDisplay: string;    // "1:01.29"
}

export interface StandardSet {
  category?: 'motivational' | 'championship'; // Required by fresh reviewed imports.
  id: string;                         // e.g. "usas_motivational_2024_2028", "pnw_age_group_champs_2026"
  name: string;                       // "2024-2028 USA Swimming Motivational Standards"
  governingBody: 'USA_Swimming' | 'LSC' | 'High_School' | 'YMCA' | 'Team' | (string & {});
  seasonYears: string;                // "2024-2028"
  effectiveDate: string;              // "2024-09-01"
  expirationDate: string;             // "2028-08-31"

  // Hierarchical Standard Cut Matrix
  cuts: {
    [course in 'SCY' | 'LCM' | 'SCM' | (string & {})]?: {
      [gender in 'F' | 'M' | (string & {})]?: {
        [ageGroup in StandardAgeGroup]?: {
          [eventCode: string]: {
            // Cut tiers sorted from fastest to slowest
            cutsByTier: StandardTierCut[];
          };
        };
      };
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface MeetAttachment {
  id: string;
  name: string;
  url: string;
  type: 'pdf' | 'image' | 'other';
  sizeBytes?: number;
  uploadedAt: string;
}

export interface MeetEvent {
  id: string;                         // Unique ID within the meet (e.g. "ev_1")
  eventNumber: number;                // 1, 2, 3...
  session?: string;                   // Optional session/day tag (e.g. "Session 1 - Friday PM")
  eventCode: string;                  // Normalized key: `${distance}_${stroke}_${course}` (e.g. "100_FR_SCY")
  distance: number;                   // 25, 50, 100, 200, 400, 500, 800, 1000, 1500, 1650
  stroke: 'FR' | 'BK' | 'BR' | 'FL' | 'IM';
  course: 'SCY' | 'LCM' | 'SCM';
  gender: 'F' | 'M' | 'Mixed';        // Female / Girls, Male / Boys, Mixed
  ageGroup: string;                   // '10&U' | '11-12' | '13-14' | '15&O' | 'Open' | 'Senior' etc.
  name?: string;                      // Display name e.g. "Girls 11-12 100 Yard Freestyle"
  isRelay?: boolean;
  girlsQualifyingTimeMs?: number;
  girlsQualifyingTimeDisplay?: string;
  girlsBonusTimeMs?: number;
  girlsBonusTimeDisplay?: string;
  boysQualifyingTimeMs?: number;
  boysQualifyingTimeDisplay?: string;
  boysBonusTimeMs?: number;
  boysBonusTimeDisplay?: string;
}

export interface Meet {
  hostTeamId?: string;
  venueId?: string;
  contactPersonIds?: string[];
  documentIds?: string[];
  teamId?: string; // Missing legacy ownership resolves to Velocity Swimming.
  id: string;                         // e.g. "meet_2026_fall_invitational"
  name: string;                       // "2026 Velocity Fall Invitational"
  sanctionNumber?: string;            // "PN-26-104"
  host?: string;                      // Host team or organization string
  hostClub?: string;                  // Backwards-compatible alias for host
  location?: string;                  // Location string (facility / city / state)

  // Date & Timeline
  dates: {
    startDate: string;                // "2026-10-15"
    endDate?: string;                 // "2026-10-17" (optional)
    entryDeadline?: string;           // ISO-8601
    scratchDeadline?: string;
  };

  type?: 'Club' | 'LSC' | 'Zone' | 'Combination' | 'National';

  // Venue & Course Details
  venue: {
    facilityName?: string;
    city?: string;
    state?: string;
    location?: string;
    course: 'SCY' | 'LCM' | 'SCM';
    poolLengthMeters?: number;
    altitudeFeet?: number;             // For USAS altitude conversion flags
  };

  // Meet Documents & Entry Files
  files?: {
    meetInfoPdf?: string;
    psychSheetPdf?: string;
    timelinePdf?: string;
    hytekMeetEventsZip?: string;      // Entry events file (.ev3)
    resultsFile?: string;             // Results import source (.hy3, .json)
  };

  // Attachments
  documents?: MeetAttachment[];       // Attached PDFs and documents
  images?: MeetAttachment[];          // Attached images

  // Events & Event Order
  events?: MeetEvent[];               // Ordered list of meet events

  // Team Participation Status
  entryStatus?: 'upcoming' | 'entries_open' | 'entries_closed' | 'in_progress' | 'completed';
  attendingGroups?: string[];          // ["Seniors", "Age Groupers"]
  totalEntries?: number;

  createdAt?: string;
  updatedAt?: string;
}

export interface AthleteAnalyticsSnapshot {
  teamId?: string; // Missing legacy ownership resolves to Velocity Swimming.
  id: string;                         // `${athleteId}_${season}`
  athleteId: string;
  athleteName: string;
  season: string;                     // "2025-2026"
  calculatedAt: string;

  // Training Volume & Consistency
  attendance: {
    totalSessionsExpected: number;
    totalAttended: number;
    attendanceRate: number;           // 0.92 (92%)
    currentStreakDays: number;
  };

  // Competitive Velocity & Distribution
  profile: {
    strongestStroke: 'FR' | 'BK' | 'BR' | 'FL' | 'IM';
    imBalanceScore: number;           // Stroke parity metric
    topEventsByPercentile: {
      eventCode: string;
      bestTimeDisplay: string;
      percentileInClub: number;
      usasPowerPoints: number;
    }[];
  };

  // Pacing Tendency (From Split Data)
  pacingSummary: {
    typicalStrategy: 'even_split' | 'negative_split' | 'front_loaded';
    averageFatigueIndex: number;      // Split deterioration on final lap
  };
}
