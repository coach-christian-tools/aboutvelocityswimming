export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      administrators: {
        Row: {
          user_id: string;
        };
        Insert: {
          user_id: string;
        };
        Update: {
          user_id?: string;
        };
        Relationships: [];
      };
      athlete_bests: {
        Row: {
          athlete_id: string;
          data: NonNullable<Json>;
          event_code: string;
        };
        Insert: {
          athlete_id: string;
          data: NonNullable<Json>;
          event_code: string;
        };
        Update: {
          athlete_id?: string;
          data?: NonNullable<Json>;
          event_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_bests_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id"];
          },
        ];
      };
      athletes: {
        Row: {
          data: NonNullable<Json>;
          group_id: string | null;
          id: string;
          person_id: string;
          team_id: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          group_id?: string | null;
          id: string;
          person_id: string;
          team_id?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          group_id?: string | null;
          id?: string;
          person_id?: string;
          team_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "athletes_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "training_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "athletes_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: true;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "athletes_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          athlete_id: string | null;
          data: NonNullable<Json>;
          id: string;
          session_id: string | null;
        };
        Insert: {
          athlete_id?: never;
          data: NonNullable<Json>;
          id: string;
          session_id?: never;
        };
        Update: {
          athlete_id?: never;
          data?: NonNullable<Json>;
          id?: string;
          session_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      collection_batches: {
        Row: {
          captured_at: string;
          coverage: string;
          division: string;
          evidence: NonNullable<Json>;
          fingerprint: string;
          id: string;
          reads: NonNullable<Json>;
          received_at: string;
          review_note: string | null;
          review_priority: number | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          scope: string;
          source_url: string;
          status: string;
          worker_id: string;
          writes: NonNullable<Json>;
        };
        Insert: {
          captured_at: string;
          coverage: string;
          division: string;
          evidence: NonNullable<Json>;
          fingerprint: string;
          id?: string;
          reads: NonNullable<Json>;
          received_at?: string;
          review_note?: string | null;
          review_priority?: never;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          scope: string;
          source_url: string;
          status?: string;
          worker_id: string;
          writes: NonNullable<Json>;
        };
        Update: {
          captured_at?: string;
          coverage?: string;
          division?: string;
          evidence?: NonNullable<Json>;
          fingerprint?: string;
          id?: string;
          reads?: NonNullable<Json>;
          received_at?: string;
          review_note?: string | null;
          review_priority?: never;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          scope?: string;
          source_url?: string;
          status?: string;
          worker_id?: string;
          writes?: NonNullable<Json>;
        };
        Relationships: [];
      };
      collection_coverage: {
        Row: {
          category: string;
          checked_at: string;
          gaps: string[];
          id: string;
          meet_count: number;
          scope: string;
          source_url: string;
          status: string;
          year: number;
        };
        Insert: {
          category: string;
          checked_at?: string;
          gaps?: string[];
          id: string;
          meet_count?: number;
          scope: string;
          source_url: string;
          status?: string;
          year: number;
        };
        Update: {
          category?: string;
          checked_at?: string;
          gaps?: string[];
          id?: string;
          meet_count?: number;
          scope?: string;
          source_url?: string;
          status?: string;
          year?: number;
        };
        Relationships: [];
      };
      collection_reviews: {
        Row: {
          batch_id: string;
          decision: string;
          id: number;
          note: string | null;
          reviewed_at: string;
          reviewer_id: string;
        };
        Insert: {
          batch_id: string;
          decision: string;
          id?: never;
          note?: string | null;
          reviewed_at?: string;
          reviewer_id: string;
        };
        Update: {
          batch_id?: string;
          decision?: string;
          id?: never;
          note?: string | null;
          reviewed_at?: string;
          reviewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_reviews_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "collection_batch_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_reviews_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "collection_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          athlete_id: string | null;
          data: NonNullable<Json>;
          id: string;
          meet_id: string | null;
          person_id: string | null;
          team_id: string | null;
          venue_id: string | null;
        };
        Insert: {
          athlete_id?: never;
          data: NonNullable<Json>;
          id: string;
          meet_id?: never;
          person_id?: never;
          team_id?: never;
          venue_id?: never;
        };
        Update: {
          athlete_id?: never;
          data?: NonNullable<Json>;
          id?: string;
          meet_id?: never;
          person_id?: never;
          team_id?: never;
          venue_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "documents_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_meet_id_fkey";
            columns: ["meet_id"];
            isOneToOne: false;
            referencedRelation: "meets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence_records: {
        Row: {
          data: NonNullable<Json>;
          path: string;
          root: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          path: string;
          root?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          path?: string;
          root?: never;
        };
        Relationships: [];
      };
      families: {
        Row: {
          data: NonNullable<Json>;
          id: string;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
        };
        Relationships: [];
      };
      family_emails: {
        Row: {
          email: string;
          family_id: string;
        };
        Insert: {
          email: string;
          family_id: string;
        };
        Update: {
          email?: string;
          family_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_emails_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      family_people: {
        Row: {
          family_id: string;
          person_id: string;
          relationship: string;
        };
        Insert: {
          family_id: string;
          person_id: string;
          relationship: string;
        };
        Update: {
          family_id?: string;
          person_id?: string;
          relationship?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_people_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_people_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_entries: {
        Row: {
          data: NonNullable<Json>;
          effective_from: string | null;
          effective_until: string | null;
          ends_on: string | null;
          id: string;
          kind: string;
          parent_id: string | null;
          source_url: string;
          starts_on: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          data: NonNullable<Json>;
          effective_from?: string | null;
          effective_until?: string | null;
          ends_on?: string | null;
          id: string;
          kind?: never;
          parent_id?: never;
          source_url?: never;
          starts_on?: string | null;
          title?: never;
          updated_at?: string;
        };
        Update: {
          data?: NonNullable<Json>;
          effective_from?: string | null;
          effective_until?: string | null;
          ends_on?: string | null;
          id?: string;
          kind?: never;
          parent_id?: never;
          source_url?: never;
          starts_on?: string | null;
          title?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_hours: {
        Row: {
          data: NonNullable<Json>;
          family_id: string | null;
          id: string;
        };
        Insert: {
          data: NonNullable<Json>;
          family_id?: never;
          id: string;
        };
        Update: {
          data?: NonNullable<Json>;
          family_id?: never;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manual_hours_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      meet_collection_work: {
        Row: {
          acquisition_state: string;
          blockers: string[];
          import_state: string;
          meet_id: string;
          notes: string;
          priority: number;
          reconciliation_note: string;
          selected: boolean;
          updated_at: string;
        };
        Insert: {
          acquisition_state?: string;
          blockers?: string[];
          import_state?: string;
          meet_id: string;
          notes?: string;
          priority?: number;
          reconciliation_note?: string;
          selected?: boolean;
          updated_at?: string;
        };
        Update: {
          acquisition_state?: string;
          blockers?: string[];
          import_state?: string;
          meet_id?: string;
          notes?: string;
          priority?: number;
          reconciliation_note?: string;
          selected?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meet_collection_work_meet_id_fkey";
            columns: ["meet_id"];
            isOneToOne: true;
            referencedRelation: "knowledge_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      meets: {
        Row: {
          data: NonNullable<Json>;
          host_team_id: string | null;
          id: string;
          team_id: string | null;
          venue_id: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          host_team_id?: never;
          id: string;
          team_id?: never;
          venue_id?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          host_team_id?: never;
          id?: string;
          team_id?: never;
          venue_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "meets_host_team_id_fkey";
            columns: ["host_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meets_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meets_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      people: {
        Row: {
          data: NonNullable<Json>;
          id: string;
          name: string | null;
          team_id: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
          name?: never;
          team_id?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
          name?: never;
          team_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "people_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      postings: {
        Row: {
          data: NonNullable<Json>;
          id: string;
          meet_id: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
          meet_id?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
          meet_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "postings_meet_id_fkey";
            columns: ["meet_id"];
            isOneToOne: false;
            referencedRelation: "meets";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_sessions: {
        Row: {
          data: NonNullable<Json>;
          group_id: string | null;
          group_name: string | null;
          id: string;
          practice_date: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          group_id?: never;
          group_name?: never;
          id: string;
          practice_date?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          group_id?: never;
          group_name?: never;
          id?: string;
          practice_date?: never;
        };
        Relationships: [
          {
            foreignKeyName: "practice_sessions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "training_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      public_athletes: {
        Row: {
          data: NonNullable<Json>;
          id: string;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "public_athletes_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "athletes";
            referencedColumns: ["id"];
          },
        ];
      };
      public_relay_results: {
        Row: {
          data: NonNullable<Json>;
          id: string;
          swim_date: string | null;
          team_id: string;
          times_course: string | null;
          times_event: string | null;
          times_meet: string | null;
          times_time: number | null;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
          swim_date?: string | null;
          team_id: string;
          times_course?: never;
          times_event?: never;
          times_meet?: never;
          times_time?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
          swim_date?: string | null;
          team_id?: string;
          times_course?: never;
          times_event?: never;
          times_meet?: never;
          times_time?: never;
        };
        Relationships: [
          {
            foreignKeyName: "public_relay_results_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "relay_results";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_relay_results_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      public_swims: {
        Row: {
          athlete_id: string;
          data: NonNullable<Json>;
          id: string;
          swim_date: string;
          times_age: number | null;
          times_course: string | null;
          times_event: string | null;
          times_gender: string | null;
          times_leg: number | null;
          times_meet: string | null;
          times_meet_name: string;
          times_official: boolean | null;
          times_relay: boolean | null;
          times_split: boolean | null;
          times_status: string | null;
          times_team: string | null;
          times_time: number | null;
        };
        Insert: {
          athlete_id: string;
          data: NonNullable<Json>;
          id: string;
          swim_date: string;
          times_age?: never;
          times_course?: never;
          times_event?: never;
          times_gender?: never;
          times_leg?: never;
          times_meet?: never;
          times_meet_name?: never;
          times_official?: never;
          times_relay?: never;
          times_split?: never;
          times_status?: never;
          times_team?: never;
          times_time?: never;
        };
        Update: {
          athlete_id?: string;
          data?: NonNullable<Json>;
          id?: string;
          swim_date?: string;
          times_age?: never;
          times_course?: never;
          times_event?: never;
          times_gender?: never;
          times_leg?: never;
          times_meet?: never;
          times_meet_name?: never;
          times_official?: never;
          times_relay?: never;
          times_split?: never;
          times_status?: never;
          times_team?: never;
          times_time?: never;
        };
        Relationships: [
          {
            foreignKeyName: "public_swims_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "public_athletes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_swims_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "swims";
            referencedColumns: ["id"];
          },
        ];
      };
      public_times_teams: {
        Row: {
          club_code: string | null;
          id: string;
          lsc_code: string;
          name: string;
        };
        Insert: {
          club_code?: string | null;
          id: string;
          lsc_code: string;
          name: string;
        };
        Update: {
          club_code?: string | null;
          id?: string;
          lsc_code?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "public_times_teams_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      registrations: {
        Row: {
          assignee_key: string | null;
          data: NonNullable<Json>;
          family_id: string | null;
          id: string;
          posting_id: string | null;
        };
        Insert: {
          assignee_key?: never;
          data: NonNullable<Json>;
          family_id?: never;
          id: string;
          posting_id?: never;
        };
        Update: {
          assignee_key?: never;
          data?: NonNullable<Json>;
          family_id?: never;
          id?: string;
          posting_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "registrations_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_posting_id_fkey";
            columns: ["posting_id"];
            isOneToOne: false;
            referencedRelation: "postings";
            referencedColumns: ["id"];
          },
        ];
      };
      relay_results: {
        Row: {
          course: string;
          data: NonNullable<Json>;
          event_code: string;
          id: string;
          meet_id: string | null;
          status: string | null;
          team_id: string;
          time_ms: number | null;
        };
        Insert: {
          course?: never;
          data: NonNullable<Json>;
          event_code?: never;
          id: string;
          meet_id?: never;
          status?: never;
          team_id?: never;
          time_ms?: never;
        };
        Update: {
          course?: never;
          data?: NonNullable<Json>;
          event_code?: never;
          id?: string;
          meet_id?: never;
          status?: never;
          team_id?: never;
          time_ms?: never;
        };
        Relationships: [
          {
            foreignKeyName: "relay_results_meet_id_fkey";
            columns: ["meet_id"];
            isOneToOne: false;
            referencedRelation: "meets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "relay_results_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      result_moderation: {
        Row: {
          flagged: boolean;
          result_id: string;
          result_type: string;
          version: number;
        };
        Insert: {
          flagged: boolean;
          result_id: string;
          result_type: string;
          version: number;
        };
        Update: {
          flagged?: boolean;
          result_id?: string;
          result_type?: string;
          version?: number;
        };
        Relationships: [];
      };
      standard_cuts: {
        Row: {
          age_group: string;
          course: string;
          event_code: string;
          gender: string;
          standard_id: string;
          tier: string;
          time_ms: number;
        };
        Insert: {
          age_group: string;
          course: string;
          event_code: string;
          gender: string;
          standard_id: string;
          tier: string;
          time_ms: number;
        };
        Update: {
          age_group?: string;
          course?: string;
          event_code?: string;
          gender?: string;
          standard_id?: string;
          tier?: string;
          time_ms?: number;
        };
        Relationships: [
          {
            foreignKeyName: "standard_cuts_standard_id_fkey";
            columns: ["standard_id"];
            isOneToOne: false;
            referencedRelation: "standards";
            referencedColumns: ["id"];
          },
        ];
      };
      standards: {
        Row: {
          data: NonNullable<Json>;
          id: string;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
        };
        Relationships: [];
      };
      swims: {
        Row: {
          athlete_id: string;
          course: string;
          data: NonNullable<Json>;
          event_code: string;
          id: string;
          is_official: boolean;
          is_relay: boolean;
          meet_id: string;
          parent_relay_result_id: string | null;
          round: string;
          status: string;
          time_ms: number | null;
        };
        Insert: {
          athlete_id?: never;
          course?: never;
          data: NonNullable<Json>;
          event_code?: never;
          id: string;
          is_official?: never;
          is_relay?: never;
          meet_id?: never;
          parent_relay_result_id?: never;
          round?: never;
          status?: never;
          time_ms?: never;
        };
        Update: {
          athlete_id?: never;
          course?: never;
          data?: NonNullable<Json>;
          event_code?: never;
          id?: string;
          is_official?: never;
          is_relay?: never;
          meet_id?: never;
          parent_relay_result_id?: never;
          round?: never;
          status?: never;
          time_ms?: never;
        };
        Relationships: [
          {
            foreignKeyName: "swims_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swims_meet_id_fkey";
            columns: ["meet_id"];
            isOneToOne: false;
            referencedRelation: "meets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swims_parent_relay_result_id_fkey";
            columns: ["parent_relay_result_id"];
            isOneToOne: false;
            referencedRelation: "relay_results";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          data: NonNullable<Json>;
          id: string;
          name: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
          name?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
          name?: never;
        };
        Relationships: [];
      };
      training_groups: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          data: NonNullable<Json>;
          id: string;
          team_id: string | null;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
          team_id?: never;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
          team_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "venues_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      work_descriptions: {
        Row: {
          data: NonNullable<Json>;
          id: string;
        };
        Insert: {
          data: NonNullable<Json>;
          id: string;
        };
        Update: {
          data?: NonNullable<Json>;
          id?: string;
        };
        Relationships: [];
      };
      workshare_members: {
        Row: {
          family_id: string;
          group_name: string;
          id: string;
          name: string;
          source_ids: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          family_id: string;
          group_name?: string;
          id: string;
          name: string;
          source_ids?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          family_id?: string;
          group_name?: string;
          id?: string;
          name?: string;
          source_ids?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workshare_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      app_records: {
        Row: {
          data: Json | null;
          path: string | null;
        };
        Relationships: [];
      };
      // This view selects required columns from collection_batches directly.
      collection_batch_queue: {
        Row: {
          id: string;
          division: string;
          scope: string;
          source_url: string;
          captured_at: string;
          received_at: string;
          coverage: string;
          status: string;
          review_note: string | null;
          reviewed_at: string | null;
          writes: Json;
          reads: Json;
        };
        Relationships: [];
      };
      ies_times_races: {
        Row: {
          age: number | null;
          athlete_id: string | null;
          athlete_name: string | null;
          course: string | null;
          date: string | null;
          event: string | null;
          gender: string | null;
          id: string | null;
          meet: string | null;
          meet_id: string | null;
          official: boolean | null;
          relay: boolean | null;
          relay_age: string | null;
          relay_leg: number | null;
          relay_name: string | null;
          round: string | null;
          split: boolean | null;
          status: string | null;
          team: string | null;
          team_name: string | null;
          time: number | null;
          ies_times_json: Json | null;
          race_moderation: Json | null;
        };
        Relationships: [];
      };
      unflagged_times_relays: {
        Row: {
          data: Json | null;
          id: string | null;
          swim_date: string | null;
          team_id: string | null;
          times_course: string | null;
          times_event: string | null;
          times_meet: string | null;
          times_time: number | null;
        };
        Insert: {
          data?: Json | null;
          id?: string | null;
          swim_date?: string | null;
          team_id?: string | null;
          times_course?: string | null;
          times_event?: string | null;
          times_meet?: string | null;
          times_time?: number | null;
        };
        Update: {
          data?: Json | null;
          id?: string | null;
          swim_date?: string | null;
          team_id?: string | null;
          times_course?: string | null;
          times_event?: string | null;
          times_meet?: string | null;
          times_time?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "public_relay_results_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "relay_results";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_relay_results_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      unflagged_times_swims: {
        Row: {
          athlete_id: string | null;
          data: Json | null;
          id: string | null;
          swim_date: string | null;
          times_age: number | null;
          times_course: string | null;
          times_event: string | null;
          times_gender: string | null;
          times_leg: number | null;
          times_meet: string | null;
          times_meet_name: string | null;
          times_official: boolean | null;
          times_relay: boolean | null;
          times_split: boolean | null;
          times_status: string | null;
          times_team: string | null;
          times_time: number | null;
        };
        Insert: {
          athlete_id?: string | null;
          data?: Json | null;
          id?: string | null;
          swim_date?: string | null;
          times_age?: number | null;
          times_course?: string | null;
          times_event?: string | null;
          times_gender?: string | null;
          times_leg?: number | null;
          times_meet?: string | null;
          times_meet_name?: string | null;
          times_official?: boolean | null;
          times_relay?: boolean | null;
          times_split?: boolean | null;
          times_status?: string | null;
          times_team?: string | null;
          times_time?: number | null;
        };
        Update: {
          athlete_id?: string | null;
          data?: Json | null;
          id?: string | null;
          swim_date?: string | null;
          times_age?: number | null;
          times_course?: string | null;
          times_event?: string | null;
          times_gender?: string | null;
          times_leg?: number | null;
          times_meet?: string | null;
          times_meet_name?: string | null;
          times_official?: boolean | null;
          times_relay?: boolean | null;
          times_split?: boolean | null;
          times_status?: string | null;
          times_team?: string | null;
          times_time?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "public_swims_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "public_athletes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_swims_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "swims";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      claim_shift_reminders: { Args: { dry_run?: boolean }; Returns: Json };
      collect_records: {
        Args: { reads: Json; writes: Json };
        Returns: undefined;
      };
      commit_records: {
        Args: { reads: Json; writes: Json };
        Returns: undefined;
      };
      export_records: {
        Args: { after_path?: string };
        Returns: {
          data: Json;
          path: string;
        }[];
      };
      finish_shift_reminder: {
        Args: {
          delivery_id?: string;
          failure?: string;
          registration_id: string;
          reminder_date: string;
        };
        Returns: undefined;
      };
      ies_meet_event_rows: {
        Args: { meet_id: string };
        Returns: {
          age_group: string;
          course: string;
          event: string;
          event_key: string;
          event_number: number;
          gender: string;
          id: string;
          relay: boolean;
          round: string;
          status: string;
          team: string;
          time: number;
        }[];
      };
      ies_meet_navigation_query: {
        Args: { input: Json; query_kind: string };
        Returns: Json;
      };
      ies_times_age: {
        Args: { age: number; relay: boolean; relay_age: string };
        Returns: string;
      };
      ies_times_age_matches: {
        Args: { age: number; groups: Json; relay: boolean; relay_age: string };
        Returns: boolean;
      };
      ies_times_age_range: { Args: { age_group: string }; Returns: unknown };
      ies_times_candidates: {
        Args: { input: Json };
        Returns: {
          athlete_id: string;
          course: string;
          date: string;
          event: string;
          id: string;
          relay: boolean;
          search_name: string;
          time: number;
        }[];
      };
      ies_times_filtered: {
        Args: { input: Json };
        Returns: {
          age: number | null;
          athlete_id: string | null;
          athlete_name: string | null;
          course: string | null;
          date: string | null;
          event: string | null;
          gender: string | null;
          id: string | null;
          meet: string | null;
          meet_id: string | null;
          official: boolean | null;
          relay: boolean | null;
          relay_age: string | null;
          relay_leg: number | null;
          relay_name: string | null;
          round: string | null;
          split: boolean | null;
          status: string | null;
          team: string | null;
          team_name: string | null;
          time: number | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "ies_times_races";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      ies_times_json: {
        Args: { r: Database["public"]["Views"]["ies_times_races"]["Row"] };
        Returns: Json;
      };
      ies_times_json_id: { Args: { race_id: string }; Returns: Json };
      ies_times_query: {
        Args: { input?: Json; query_kind: string };
        Returns: Json;
      };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      list_result_moderation: {
        Args: {
          include_restored?: boolean;
          page_from?: number;
          page_size?: number;
        };
        Returns: Json;
      };
      meet_collection_queue: { Args: { input?: Json }; Returns: Json };
      moderate_result: {
        Args: {
          action: string;
          expected_version: number;
          note: string;
          reason: string;
          result_id: string;
          result_type: string;
        };
        Returns: Json;
      };
      projection_counts: { Args: Record<PropertyKey, never>; Returns: Json };
      query_records: {
        Args: {
          after_id?: string;
          collection_path: string;
          filters?: Json;
          page_size?: number;
          record_id?: string;
        };
        Returns: {
          data: Json;
          path: string;
        }[];
      };
      race_moderation: {
        Args: { r: Database["public"]["Views"]["ies_times_races"]["Row"] };
        Returns: Json;
      };
      read_result_moderation: {
        Args: { result_id: string; result_type: string };
        Returns: Json;
      };
      result_is_excluded: {
        Args: { kind: string; parent_id?: string; rid: string };
        Returns: boolean;
      };
      review_collection: {
        Args: { batch_id: string; decision: string; note?: string };
        Returns: undefined;
      };
      stage_collection: {
        Args: { batch: Json; worker_token: string };
        Returns: string;
      };
      times_page: {
        Args: {
          course_filter?: string;
          event_filter?: string;
          mode?: string;
          page_from?: number;
          page_size?: number;
        };
        Returns: Json;
      };
      update_meet_collection_work: { Args: { input: Json }; Returns: Json };
      workshare_action: {
        Args: { input: Json; operation: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
