import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const local = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (local.API_URL !== "http://127.0.0.1:54321")
  throw new Error("Synthetic seeding requires the local backend.");
const client = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const password = "Velocity-local-test-2026!";
const users = [
  ["staff", "coach@velocity-swimming.com"],
  ["family-a", "family-a@example.test"],
  ["family-b", "family-b@example.test"],
  ["unverified", "unverified@velocity-swimming.com"],
];
for (const [label, email] of users) {
  const {
    data: { users: existing },
    error: listError,
  } = await client.auth.admin.listUsers();
  if (listError) throw listError;
  if (!existing.some((u) => u.email === email)) {
    const { error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: label !== "unverified",
    });
    if (error) throw error;
  }
}
// Local staff permissions are explicit; a team email domain alone grants no access.
const staffUsers = await client.auth.admin.listUsers();
if (staffUsers.error) throw staffUsers.error;
const staffId = staffUsers.data.users.find(
  (user) => user.email === "coach@velocity-swimming.com",
)?.id;
const grant = await client.from("administrators").upsert({ user_id: staffId });
if (grant.error) throw grant.error;
const athlete = (id, first, last, gender) => ({
  id,
  name: { first, last },
  aliases: [first + " " + last],
  gender,
  dob: "2012-02-15",
  teamId: "velocity-swimming",
  status: "active",
  currentGroup: {
    id: "juniors",
    name: "Juniors",
    assignedAt: "2026-10-01T00:00:00Z",
  },
  metadata: {
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
});
const at = new Date();
at.setDate(at.getDate() + 5);
at.setUTCHours(18, 0, 0, 0);
const end = new Date(at.getTime() + 3600000);
const records = [
  [
    "teams/velocity-swimming",
    { id: "velocity-swimming", name: "Velocity Swimming", clubCode: "IEVS" },
  ],
  [
    "athletes/test-swimmer-a",
    athlete("test-swimmer-a", "Avery", "Example", "F"),
  ],
  [
    "athletes/test-swimmer-b",
    athlete("test-swimmer-b", "Blake", "Example", "M"),
  ],
  [
    "families/family-a",
    {
      accountName: "Example Family A",
      authorizedEmails: ["family-a@example.test"],
      category: "Competitive",
      children: [
        { id: "test-swimmer-a", name: "Avery Example", group: "Juniors" },
      ],
      requirements: { generalPoolHours: 10, eventSpecificHours: 5 },
    },
  ],
  [
    "families/family-b",
    {
      accountName: "Example Family B",
      authorizedEmails: ["family-b@example.test"],
      category: "Competitive",
      children: [
        { id: "test-swimmer-b", name: "Blake Example", group: "Juniors" },
      ],
      requirements: { generalPoolHours: 10, eventSpecificHours: 5 },
    },
  ],
  [
    "venues/test-pool",
    {
      id: "test-pool",
      teamId: "velocity-swimming",
      name: "Synthetic pool",
      city: "Wenatchee",
      state: "WA",
    },
  ],
  [
    "meets/test-meet",
    {
      id: "test-meet",
      name: "Synthetic Fall Meet",
      teamId: "velocity-swimming",
      venueId: "test-pool",
      dates: { startDate: "2026-10-01", endDate: "2026-10-02" },
      venue: { course: "SCY", city: "Wenatchee" },
    },
  ],
  [
    "practice_sessions/test-practice",
    {
      id: "test-practice",
      date: "2026-10-01",
      trainingGroup: "Juniors",
      location: "Synthetic pool",
      startTime: "17:00",
      endTime: "18:00",
      course: "SCY",
    },
  ],
  [
    "attendance/test-attendance",
    {
      id: "test-attendance",
      sessionId: "test-practice",
      athleteId: "test-swimmer-a",
      date: "2026-10-01",
      status: "present",
    },
  ],
  [
    "postings/test-shift",
    {
      id: "test-shift",
      title: "Synthetic meet setup",
      type: "General",
      date: at.toISOString(),
      startTime: at.toISOString(),
      endTime: end.toISOString(),
      status: "Open",
      positions: { min: 1, desired: 2, max: 3 },
      meetId: "test-meet",
    },
  ],
  ["work_descriptions/test-description", { text: "Synthetic setup hours" }],
];
for (const [path, after] of records) {
  const { error } = await client.rpc("collect_records", {
    reads: [],
    writes: [{ path, after }],
  });
  if (error) throw new Error(path + ": " + error.message);
}
for (let i = 0; i < 2; i++) {
  const id = "test-race-" + i;
  const { error } = await client.rpc("collect_records", {
    reads: [],
    writes: [
      {
        path: "swims/" + id,
        after: {
          id,
          athleteId: "test-swimmer-a",
          athleteName: { first: "Avery", last: "Example" },
          teamId: "velocity-swimming",
          gender: "F",
          ageAtSwim: 14,
          ageGroup: "13-14",
          eventCode: "100_FR_SCY",
          distance: 100,
          stroke: "FR",
          course: "SCY",
          isRelay: false,
          timeMs: 65000 - i * 1000,
          timeDisplay: i ? "1:04.00" : "1:05.00",
          status: "OK",
          meet: {
            id: "test-meet",
            name: "Synthetic Fall Meet",
            date: "2026-10-01",
          },
          round: i ? "F" : "P",
          metadata: { source: "manual", createdAt: "2026-10-01T00:00:00Z" },
        },
      },
    ],
  });
  if (error) throw error;
}
const { error: standardError } = await client.rpc("collect_records", {
  reads: [],
  writes: [
    {
      path: "standards/test-standard",
      after: {
        id: "test-standard",
        category: "motivational",
        name: "Synthetic test standards",
        governingBody: "Team",
        seasonYears: "2026",
        effectiveDate: "2026-01-01",
        expirationDate: "2026-12-31",
        cuts: {
          SCY: {
            F: {
              "13-14": {
                "100_FR_SCY": {
                  cutsByTier: [
                    { tierName: "A", timeMs: 65000, timeDisplay: "1:05.00" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  ],
});
if (standardError) throw standardError;
// Development wrapper reads this ignored file; credentials never enter tracked state.
writeFileSync(
  "supabase/.env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${local.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${local.PUBLISHABLE_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${local.SERVICE_ROLE_KEY}\nSUPABASE_TEST_EMAILS=true\n`,
  { mode: 0o600 },
);
console.log(
  "Local synthetic accounts and linked team data are ready. Test password: " +
    password,
);
