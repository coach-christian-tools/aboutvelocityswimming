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
          data: Json;
          event_code: string;
        };
        Insert: {
          athlete_id: string;
          data: Json;
          event_code: string;
        };
        Update: {
          athlete_id?: string;
          data?: Json;
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
          data: Json;
          group_id: string | null;
          id: string;
          person_id: string;
          team_id: string | null;
        };
        Insert: {
          data: Json;
          group_id?: string | null;
          id: string;
          person_id: string;
          team_id?: string | null;
        };
        Update: {
          data?: Json;
          group_id?: string | null;
          id?: string;
          person_id?: string;
          team_id?: string | null;
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
          data: Json;
          id: string;
          session_id: string | null;
        };
        Insert: {
          athlete_id?: string | null;
          data: Json;
          id: string;
          session_id?: string | null;
        };
        Update: {
          athlete_id?: string | null;
          data?: Json;
          id?: string;
          session_id?: string | null;
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
      documents: {
        Row: {
          athlete_id: string | null;
          data: Json;
          id: string;
          meet_id: string | null;
          person_id: string | null;
          team_id: string | null;
          venue_id: string | null;
        };
        Insert: {
          athlete_id?: string | null;
          data: Json;
          id: string;
          meet_id?: string | null;
          person_id?: string | null;
          team_id?: string | null;
          venue_id?: string | null;
        };
        Update: {
          athlete_id?: string | null;
          data?: Json;
          id?: string;
          meet_id?: string | null;
          person_id?: string | null;
          team_id?: string | null;
          venue_id?: string | null;
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
          data: Json;
          path: string;
          root: string | null;
        };
        Insert: {
          data: Json;
          path: string;
          root?: string | null;
        };
        Update: {
          data?: Json;
          path?: string;
          root?: string | null;
        };
        Relationships: [];
      };
      families: {
        Row: {
          data: Json;
          id: string;
        };
        Insert: {
          data: Json;
          id: string;
        };
        Update: {
          data?: Json;
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
      manual_hours: {
        Row: {
          data: Json;
          family_id: string | null;
          id: string;
        };
        Insert: {
          data: Json;
          family_id?: string | null;
          id: string;
        };
        Update: {
          data?: Json;
          family_id?: string | null;
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
      meets: {
        Row: {
          data: Json;
          host_team_id: string | null;
          id: string;
          team_id: string | null;
          venue_id: string | null;
        };
        Insert: {
          data: Json;
          host_team_id?: string | null;
          id: string;
          team_id?: string | null;
          venue_id?: string | null;
        };
        Update: {
          data?: Json;
          host_team_id?: string | null;
          id?: string;
          team_id?: string | null;
          venue_id?: string | null;
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
          data: Json;
          id: string;
          name: string | null;
          team_id: string | null;
        };
        Insert: {
          data: Json;
          id: string;
          name?: string | null;
          team_id?: string | null;
        };
        Update: {
          data?: Json;
          id?: string;
          name?: string | null;
          team_id?: string | null;
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
          data: Json;
          id: string;
          meet_id: string | null;
        };
        Insert: {
          data: Json;
          id: string;
          meet_id?: string | null;
        };
        Update: {
          data?: Json;
          id?: string;
          meet_id?: string | null;
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
          data: Json;
          id: string;
        };
        Insert: {
          data: Json;
          id: string;
        };
        Update: {
          data?: Json;
          id?: string;
        };
        Relationships: [];
      };
      public_athletes: {
        Row: {
          data: Json;
          id: string;
        };
        Insert: {
          data: Json;
          id: string;
        };
        Update: {
          data?: Json;
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
      registrations: {
        Row: {
          assignee_key: string | null;
          data: Json;
          family_id: string | null;
          id: string;
          posting_id: string | null;
        };
        Insert: {
          assignee_key?: string | null;
          data: Json;
          family_id?: string | null;
          id: string;
          posting_id?: string | null;
        };
        Update: {
          assignee_key?: string | null;
          data?: Json;
          family_id?: string | null;
          id?: string;
          posting_id?: string | null;
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
          data: Json;
          id: string;
        };
        Insert: {
          data: Json;
          id: string;
        };
        Update: {
          data?: Json;
          id?: string;
        };
        Relationships: [];
      };
      swims: {
        Row: {
          athlete_id: string | null;
          course: string | null;
          data: Json;
          event_code: string | null;
          id: string;
          meet_id: string | null;
          status: string | null;
          time_ms: number | null;
        };
        Insert: {
          athlete_id?: string | null;
          course?: string | null;
          data: Json;
          event_code?: string | null;
          id: string;
          meet_id?: string | null;
          status?: string | null;
          time_ms?: number | null;
        };
        Update: {
          athlete_id?: string | null;
          course?: string | null;
          data?: Json;
          event_code?: string | null;
          id?: string;
          meet_id?: string | null;
          status?: string | null;
          time_ms?: number | null;
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
        ];
      };
      teams: {
        Row: {
          data: Json;
          id: string;
          name: string | null;
        };
        Insert: {
          data: Json;
          id: string;
          name?: string | null;
        };
        Update: {
          data?: Json;
          id?: string;
          name?: string | null;
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
          data: Json;
          id: string;
          team_id: string | null;
        };
        Insert: {
          data: Json;
          id: string;
          team_id?: string | null;
        };
        Update: {
          data?: Json;
          id?: string;
          team_id?: string | null;
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
          data: Json;
          id: string;
        };
        Insert: {
          data: Json;
          id: string;
        };
        Update: {
          data?: Json;
          id?: string;
        };
        Relationships: [];
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
      finish_shift_reminder: {
        Args: {
          delivery_id?: string;
          failure?: string;
          registration_id: string;
          reminder_date: string;
        };
        Returns: undefined;
      };
      is_staff: { Args: never; Returns: boolean };
      projection_counts: { Args: never; Returns: Json };
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
