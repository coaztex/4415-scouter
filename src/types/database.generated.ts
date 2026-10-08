export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
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
      admin_account_audit: {
        Row: {
          actor_id: string;
          after_values: Json;
          before_values: Json;
          created_at: string;
          id: number;
          target_id: string;
        };
        Insert: {
          actor_id: string;
          after_values: Json;
          before_values: Json;
          created_at?: string;
          id?: never;
          target_id: string;
        };
        Update: {
          actor_id?: string;
          after_values?: Json;
          before_values?: Json;
          created_at?: string;
          id?: never;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_account_audit_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_account_audit_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_nexus_inspections: {
        Row: {
          event_id: string;
          fetched_at: string | null;
          last_attempt_at: string;
          last_attempt_key: string;
          last_error: string | null;
          snapshot: Json | null;
          source_event_key: string;
          status: string;
        };
        Insert: {
          event_id: string;
          fetched_at?: string | null;
          last_attempt_at: string;
          last_attempt_key: string;
          last_error?: string | null;
          snapshot?: Json | null;
          source_event_key: string;
          status: string;
        };
        Update: {
          event_id?: string;
          fetched_at?: string | null;
          last_attempt_at?: string;
          last_attempt_key?: string;
          last_error?: string | null;
          snapshot?: Json | null;
          source_event_key?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_nexus_inspections_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_picklists: {
        Row: {
          created_at: string;
          event_id: string;
          revision: number;
          state: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          revision?: number;
          state?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          revision?: number;
          state?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_picklists_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_picklists_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_pit_maps: {
        Row: {
          created_at: string;
          event_id: string;
          fetched_at: string | null;
          last_attempt_at: string;
          last_attempt_key: string | null;
          last_error: string | null;
          layout: Json | null;
          raw_source: Json | null;
          source: string;
          source_event_key: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          fetched_at?: string | null;
          last_attempt_at: string;
          last_attempt_key?: string | null;
          last_error?: string | null;
          layout?: Json | null;
          raw_source?: Json | null;
          source?: string;
          source_event_key?: string | null;
          status: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          fetched_at?: string | null;
          last_attempt_at?: string;
          last_attempt_key?: string | null;
          last_error?: string | null;
          layout?: Json | null;
          raw_source?: Json | null;
          source?: string;
          source_event_key?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_pit_maps_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_rankings: {
        Row: {
          event_id: string;
          fetched_at: string;
          losses: number | null;
          payload: Json;
          rank: number;
          ranking_score: number | null;
          source_updated_at: string | null;
          team_number: number;
          ties: number | null;
          wins: number | null;
        };
        Insert: {
          event_id: string;
          fetched_at?: string;
          losses?: number | null;
          payload?: Json;
          rank: number;
          ranking_score?: number | null;
          source_updated_at?: string | null;
          team_number: number;
          ties?: number | null;
          wins?: number | null;
        };
        Update: {
          event_id?: string;
          fetched_at?: string;
          losses?: number | null;
          payload?: Json;
          rank?: number;
          ranking_score?: number | null;
          source_updated_at?: string | null;
          team_number?: number;
          ties?: number | null;
          wins?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_rankings_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: true;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
        ];
      };
      event_sync_state: {
        Row: {
          event_id: string;
          last_attempt_at: string | null;
          last_error: string | null;
          last_success_at: string | null;
          source: Database["public"]["Enums"]["external_source"];
          status: Database["public"]["Enums"]["sync_status"];
        };
        Insert: {
          event_id: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          source: Database["public"]["Enums"]["external_source"];
          status?: Database["public"]["Enums"]["sync_status"];
        };
        Update: {
          event_id?: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          source?: Database["public"]["Enums"]["external_source"];
          status?: Database["public"]["Enums"]["sync_status"];
        };
        Relationships: [
          {
            foreignKeyName: "event_sync_state_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_teams: {
        Row: {
          created_at: string;
          event_id: string;
          pit_claimed_at: string | null;
          pit_claimed_by: string | null;
          pit_status: Database["public"]["Enums"]["pit_status"];
          team_number: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          pit_claimed_at?: string | null;
          pit_claimed_by?: string | null;
          pit_status?: Database["public"]["Enums"]["pit_status"];
          team_number: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          pit_claimed_at?: string | null;
          pit_claimed_by?: string | null;
          pit_status?: Database["public"]["Enums"]["pit_status"];
          team_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_teams_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_teams_pit_claimed_by_fkey";
            columns: ["pit_claimed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_teams_team_number_fkey";
            columns: ["team_number"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["team_number"];
          },
        ];
      };
      events: {
        Row: {
          city: string | null;
          country: string | null;
          created_at: string;
          created_by: string;
          end_date: string | null;
          event_type: number | null;
          game_slug: string;
          id: string;
          last_statbotics_sync_at: string | null;
          last_tba_sync_at: string | null;
          name: string;
          nexus_event_key: string | null;
          our_team_number: number | null;
          short_name: string | null;
          source_metadata: Json;
          start_date: string | null;
          state: string | null;
          status: Database["public"]["Enums"]["event_status"];
          tba_key: string;
          timezone: string;
          timezone_source: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          created_by: string;
          end_date?: string | null;
          event_type?: number | null;
          game_slug: string;
          id?: string;
          last_statbotics_sync_at?: string | null;
          last_tba_sync_at?: string | null;
          name: string;
          nexus_event_key?: string | null;
          our_team_number?: number | null;
          short_name?: string | null;
          source_metadata?: Json;
          start_date?: string | null;
          state?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
          tba_key: string;
          timezone?: string;
          timezone_source?: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string;
          end_date?: string | null;
          event_type?: number | null;
          game_slug?: string;
          id?: string;
          last_statbotics_sync_at?: string | null;
          last_tba_sync_at?: string | null;
          name?: string;
          nexus_event_key?: string | null;
          our_team_number?: number | null;
          short_name?: string | null;
          source_metadata?: Json;
          start_date?: string | null;
          state?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
          tba_key?: string;
          timezone?: string;
          timezone_source?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      external_team_metrics: {
        Row: {
          ccwm: number | null;
          dpr: number | null;
          epa_auto: number | null;
          epa_endgame: number | null;
          epa_teleop: number | null;
          epa_total: number | null;
          event_id: string;
          fetched_at: string;
          metric_version: string;
          opr: number | null;
          payload: Json;
          source: Database["public"]["Enums"]["external_source"];
          source_updated_at: string | null;
          team_number: number;
        };
        Insert: {
          ccwm?: number | null;
          dpr?: number | null;
          epa_auto?: number | null;
          epa_endgame?: number | null;
          epa_teleop?: number | null;
          epa_total?: number | null;
          event_id: string;
          fetched_at?: string;
          metric_version: string;
          opr?: number | null;
          payload?: Json;
          source: Database["public"]["Enums"]["external_source"];
          source_updated_at?: string | null;
          team_number: number;
        };
        Update: {
          ccwm?: number | null;
          dpr?: number | null;
          epa_auto?: number | null;
          epa_endgame?: number | null;
          epa_teleop?: number | null;
          epa_total?: number | null;
          event_id?: string;
          fetched_at?: string;
          metric_version?: string;
          opr?: number | null;
          payload?: Json;
          source?: Database["public"]["Enums"]["external_source"];
          source_updated_at?: string | null;
          team_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "external_team_metrics_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
        ];
      };
      match_prep_notes: {
        Row: {
          created_at: string;
          event_id: string;
          match_id: string;
          note: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          match_id: string;
          note: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          match_id?: string;
          note?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_prep_notes_match_id_event_id_fkey";
            columns: ["match_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id", "event_id"];
          },
          {
            foreignKeyName: "match_prep_notes_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      match_scouting_submissions: {
        Row: {
          assignment_id: string | null;
          client_submission_id: string;
          completed_at: string | null;
          corrected_by: string | null;
          correction_provenance: Database["public"]["Enums"]["correction_provenance"];
          correction_reason: string | null;
          created_at: string;
          event_id: string;
          game_data: Json;
          game_slug: string;
          id: string;
          issues: Json;
          match_id: string;
          note: string | null;
          revision: number;
          schema_version: number;
          scout_user_id: string;
          started_at: string;
          status: Database["public"]["Enums"]["submission_status"];
          submitted_by_user_id: string | null;
          team_number: number;
          updated_at: string;
        };
        Insert: {
          assignment_id?: string | null;
          client_submission_id: string;
          completed_at?: string | null;
          corrected_by?: string | null;
          correction_provenance?: Database["public"]["Enums"]["correction_provenance"];
          correction_reason?: string | null;
          created_at?: string;
          event_id: string;
          game_data: Json;
          game_slug: string;
          id?: string;
          issues?: Json;
          match_id: string;
          note?: string | null;
          revision?: number;
          schema_version: number;
          scout_user_id: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["submission_status"];
          submitted_by_user_id?: string | null;
          team_number: number;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string | null;
          client_submission_id?: string;
          completed_at?: string | null;
          corrected_by?: string | null;
          correction_provenance?: Database["public"]["Enums"]["correction_provenance"];
          correction_reason?: string | null;
          created_at?: string;
          event_id?: string;
          game_data?: Json;
          game_slug?: string;
          id?: string;
          issues?: Json;
          match_id?: string;
          note?: string | null;
          revision?: number;
          schema_version?: number;
          scout_user_id?: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["submission_status"];
          submitted_by_user_id?: string | null;
          team_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_scouting_submissions_assignment_id_event_id_match_id_fkey";
            columns: [
              "assignment_id",
              "event_id",
              "match_id",
              "team_number",
              "scout_user_id",
            ];
            isOneToOne: false;
            referencedRelation: "scouting_assignments";
            referencedColumns: [
              "id",
              "event_id",
              "match_id",
              "team_number",
              "scout_user_id",
            ];
          },
          {
            foreignKeyName: "match_scouting_submissions_corrected_by_fkey";
            columns: ["corrected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_scouting_submissions_event_id_game_slug_fkey";
            columns: ["event_id", "game_slug"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id", "game_slug"];
          },
          {
            foreignKeyName: "match_scouting_submissions_match_id_event_id_team_number_fkey";
            columns: ["match_id", "event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "match_teams";
            referencedColumns: ["match_id", "event_id", "team_number"];
          },
          {
            foreignKeyName: "match_scouting_submissions_scout_user_id_fkey";
            columns: ["scout_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_scouting_submissions_submitted_by_user_id_fkey";
            columns: ["submitted_by_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      match_teams: {
        Row: {
          alliance: Database["public"]["Enums"]["alliance_color"];
          dq: boolean | null;
          event_id: string;
          match_id: string;
          station: number;
          surrogate: boolean | null;
          team_number: number;
        };
        Insert: {
          alliance: Database["public"]["Enums"]["alliance_color"];
          dq?: boolean | null;
          event_id: string;
          match_id: string;
          station: number;
          surrogate?: boolean | null;
          team_number: number;
        };
        Update: {
          alliance?: Database["public"]["Enums"]["alliance_color"];
          dq?: boolean | null;
          event_id?: string;
          match_id?: string;
          station?: number;
          surrogate?: boolean | null;
          team_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "match_teams_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
          {
            foreignKeyName: "match_teams_match_id_event_id_fkey";
            columns: ["match_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id", "event_id"];
          },
        ];
      };
      matches: {
        Row: {
          actual_time: string | null;
          comp_level: string;
          created_at: string;
          event_id: string;
          id: string;
          match_number: number;
          predicted_time: string | null;
          raw_tba_payload: Json | null;
          result_metadata: Json | null;
          scheduled_time: string | null;
          set_number: number;
          tba_match_key: string;
          updated_at: string;
          winning_alliance:
            Database["public"]["Enums"]["alliance_color"] | null;
        };
        Insert: {
          actual_time?: string | null;
          comp_level: string;
          created_at?: string;
          event_id: string;
          id?: string;
          match_number: number;
          predicted_time?: string | null;
          raw_tba_payload?: Json | null;
          result_metadata?: Json | null;
          scheduled_time?: string | null;
          set_number: number;
          tba_match_key: string;
          updated_at?: string;
          winning_alliance?:
            Database["public"]["Enums"]["alliance_color"] | null;
        };
        Update: {
          actual_time?: string | null;
          comp_level?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          match_number?: number;
          predicted_time?: string | null;
          raw_tba_payload?: Json | null;
          result_metadata?: Json | null;
          scheduled_time?: string | null;
          set_number?: number;
          tba_match_key?: string;
          updated_at?: string;
          winning_alliance?:
            Database["public"]["Enums"]["alliance_color"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      password_reset_requests: {
        Row: {
          id: string;
          requested_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "password_reset_requests_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "password_reset_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      picklist_snapshots: {
        Row: {
          created_at: string;
          created_by: string;
          event_id: string;
          evidence: Json;
          id: string;
          name: string;
          revision: number;
          state: Json;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          event_id: string;
          evidence: Json;
          id?: string;
          name: string;
          revision: number;
          state: Json;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          event_id?: string;
          evidence?: Json;
          id?: string;
          name?: string;
          revision?: number;
          state?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "picklist_snapshots_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "picklist_snapshots_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      pit_scouting_submissions: {
        Row: {
          client_submission_id: string;
          completed_at: string | null;
          corrected_by: string | null;
          correction_provenance: Database["public"]["Enums"]["correction_provenance"];
          correction_reason: string | null;
          created_at: string;
          event_id: string;
          game_data: Json;
          game_slug: string;
          id: string;
          note: string | null;
          revision: number;
          schema_version: number;
          scout_user_id: string;
          started_at: string;
          status: Database["public"]["Enums"]["submission_status"];
          team_number: number;
          updated_at: string;
        };
        Insert: {
          client_submission_id: string;
          completed_at?: string | null;
          corrected_by?: string | null;
          correction_provenance?: Database["public"]["Enums"]["correction_provenance"];
          correction_reason?: string | null;
          created_at?: string;
          event_id: string;
          game_data: Json;
          game_slug: string;
          id?: string;
          note?: string | null;
          revision?: number;
          schema_version: number;
          scout_user_id: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["submission_status"];
          team_number: number;
          updated_at?: string;
        };
        Update: {
          client_submission_id?: string;
          completed_at?: string | null;
          corrected_by?: string | null;
          correction_provenance?: Database["public"]["Enums"]["correction_provenance"];
          correction_reason?: string | null;
          created_at?: string;
          event_id?: string;
          game_data?: Json;
          game_slug?: string;
          id?: string;
          note?: string | null;
          revision?: number;
          schema_version?: number;
          scout_user_id?: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["submission_status"];
          team_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pit_scouting_submissions_corrected_by_fkey";
            columns: ["corrected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pit_scouting_submissions_event_id_game_slug_fkey";
            columns: ["event_id", "game_slug"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id", "game_slug"];
          },
          {
            foreignKeyName: "pit_scouting_submissions_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
          {
            foreignKeyName: "pit_scouting_submissions_scout_user_id_fkey";
            columns: ["scout_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          approval_pending: boolean;
          created_at: string;
          display_name: string;
          id: string;
          must_change_password: boolean;
          role: Database["public"]["Enums"]["profile_role"];
          updated_at: string;
          username: string;
        };
        Insert: {
          active?: boolean;
          approval_pending?: boolean;
          created_at?: string;
          display_name?: string;
          id: string;
          must_change_password?: boolean;
          role?: Database["public"]["Enums"]["profile_role"];
          updated_at?: string;
          username: string;
        };
        Update: {
          active?: boolean;
          approval_pending?: boolean;
          created_at?: string;
          display_name?: string;
          id?: string;
          must_change_password?: boolean;
          role?: Database["public"]["Enums"]["profile_role"];
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      robot_media: {
        Row: {
          created_at: string;
          event_id: string;
          external_url: string | null;
          id: string;
          is_primary: boolean;
          media_type: string;
          source: string;
          storage_path: string | null;
          team_number: number;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          external_url?: string | null;
          id?: string;
          is_primary?: boolean;
          media_type?: string;
          source: string;
          storage_path?: string | null;
          team_number: number;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          external_url?: string | null;
          id?: string;
          is_primary?: boolean;
          media_type?: string;
          source?: string;
          storage_path?: string | null;
          team_number?: number;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "robot_media_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
          {
            foreignKeyName: "robot_media_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scouting_assignments: {
        Row: {
          assignment_type: Database["public"]["Enums"]["assignment_type"];
          break_match_id: string | null;
          created_at: string;
          event_id: string;
          id: string;
          match_id: string | null;
          scout_user_id: string;
          sequence: number;
          status: Database["public"]["Enums"]["assignment_status"];
          team_number: number | null;
          updated_at: string;
        };
        Insert: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"];
          break_match_id?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          match_id?: string | null;
          scout_user_id: string;
          sequence: number;
          status?: Database["public"]["Enums"]["assignment_status"];
          team_number?: number | null;
          updated_at?: string;
        };
        Update: {
          assignment_type?: Database["public"]["Enums"]["assignment_type"];
          break_match_id?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          match_id?: string | null;
          scout_user_id?: string;
          sequence?: number;
          status?: Database["public"]["Enums"]["assignment_status"];
          team_number?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignment_break_match_fk";
            columns: ["break_match_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id", "event_id"];
          },
          {
            foreignKeyName: "scouting_assignments_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_assignments_match_id_event_id_team_number_fkey";
            columns: ["match_id", "event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "match_teams";
            referencedColumns: ["match_id", "event_id", "team_number"];
          },
          {
            foreignKeyName: "scouting_assignments_scout_user_id_fkey";
            columns: ["scout_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scouting_coverage_signal: {
        Row: {
          event_id: string;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scouting_coverage_signal_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      scouting_submission_reviews: {
        Row: {
          event_id: string;
          flag_reason: string;
          id: string;
          match_submission_id: string | null;
          opened_at: string;
          opened_by: string;
          pit_submission_id: string | null;
          resolution: Database["public"]["Enums"]["review_resolution"];
          resolved_at: string | null;
          resolved_by: string | null;
          submission_kind: string;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          flag_reason: string;
          id?: string;
          match_submission_id?: string | null;
          opened_at?: string;
          opened_by: string;
          pit_submission_id?: string | null;
          resolution?: Database["public"]["Enums"]["review_resolution"];
          resolved_at?: string | null;
          resolved_by?: string | null;
          submission_kind: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          flag_reason?: string;
          id?: string;
          match_submission_id?: string | null;
          opened_at?: string;
          opened_by?: string;
          pit_submission_id?: string | null;
          resolution?: Database["public"]["Enums"]["review_resolution"];
          resolved_at?: string | null;
          resolved_by?: string | null;
          submission_kind?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scouting_submission_reviews_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_reviews_match_submission_id_fkey";
            columns: ["match_submission_id"];
            isOneToOne: true;
            referencedRelation: "match_scouting_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_reviews_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_reviews_pit_submission_id_fkey";
            columns: ["pit_submission_id"];
            isOneToOne: true;
            referencedRelation: "pit_scouting_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_reviews_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scouting_submission_revisions: {
        Row: {
          correction_reason: string | null;
          editor_user_id: string;
          event_id: string;
          id: number;
          match_submission_id: string | null;
          pit_submission_id: string | null;
          provenance: Database["public"]["Enums"]["correction_provenance"];
          recorded_at: string;
          revision: number;
          snapshot: Json;
          submission_kind: string;
        };
        Insert: {
          correction_reason?: string | null;
          editor_user_id: string;
          event_id: string;
          id?: never;
          match_submission_id?: string | null;
          pit_submission_id?: string | null;
          provenance: Database["public"]["Enums"]["correction_provenance"];
          recorded_at?: string;
          revision: number;
          snapshot: Json;
          submission_kind: string;
        };
        Update: {
          correction_reason?: string | null;
          editor_user_id?: string;
          event_id?: string;
          id?: never;
          match_submission_id?: string | null;
          pit_submission_id?: string | null;
          provenance?: Database["public"]["Enums"]["correction_provenance"];
          recorded_at?: string;
          revision?: number;
          snapshot?: Json;
          submission_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scouting_submission_revisions_editor_user_id_fkey";
            columns: ["editor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_revisions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_revisions_match_submission_id_fkey";
            columns: ["match_submission_id"];
            isOneToOne: false;
            referencedRelation: "match_scouting_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_submission_revisions_pit_submission_id_fkey";
            columns: ["pit_submission_id"];
            isOneToOne: false;
            referencedRelation: "pit_scouting_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      scouting_sync_conflicts: {
        Row: {
          actor_user_id: string;
          assignment_id: string | null;
          attempted_payload: Json;
          client_submission_id: string;
          created_at: string;
          event_id: string;
          id: string;
          kind: Database["public"]["Enums"]["sync_conflict_kind"];
          match_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["review_resolution"];
          submission_kind: string;
          team_number: number;
        };
        Insert: {
          actor_user_id: string;
          assignment_id?: string | null;
          attempted_payload: Json;
          client_submission_id: string;
          created_at?: string;
          event_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["sync_conflict_kind"];
          match_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["review_resolution"];
          submission_kind: string;
          team_number: number;
        };
        Update: {
          actor_user_id?: string;
          assignment_id?: string | null;
          attempted_payload?: Json;
          client_submission_id?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["sync_conflict_kind"];
          match_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["review_resolution"];
          submission_kind?: string;
          team_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "scouting_sync_conflicts_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_sync_conflicts_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "scouting_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_sync_conflicts_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_sync_conflicts_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scouting_sync_conflicts_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      statbotics_sync_gate: {
        Row: {
          event_id: string | null;
          expires_at: string | null;
          next_allowed_at: string;
          singleton: boolean;
          token: string | null;
        };
        Insert: {
          event_id?: string | null;
          expires_at?: string | null;
          next_allowed_at?: string;
          singleton?: boolean;
          token?: string | null;
        };
        Update: {
          event_id?: string | null;
          expires_at?: string | null;
          next_allowed_at?: string;
          singleton?: boolean;
          token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "statbotics_sync_gate_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      strategy_boards: {
        Row: {
          board_data: Json;
          created_at: string;
          created_by: string;
          event_id: string;
          id: string;
          match_id: string;
          revision: number;
          schema_version: number;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          board_data: Json;
          created_at?: string;
          created_by: string;
          event_id: string;
          id?: string;
          match_id: string;
          revision?: number;
          schema_version?: number;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          board_data?: Json;
          created_at?: string;
          created_by?: string;
          event_id?: string;
          id?: string;
          match_id?: string;
          revision?: number;
          schema_version?: number;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "strategy_boards_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "strategy_boards_match_id_event_id_fkey";
            columns: ["match_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id", "event_id"];
          },
          {
            foreignKeyName: "strategy_boards_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tba_refresh_leases: {
        Row: {
          event_id: string;
          expires_at: string | null;
          last_attempt_at: string | null;
          token: string | null;
        };
        Insert: {
          event_id: string;
          expires_at?: string | null;
          last_attempt_at?: string | null;
          token?: string | null;
        };
        Update: {
          event_id?: string;
          expires_at?: string | null;
          last_attempt_at?: string | null;
          token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tba_refresh_leases_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      tba_webhook_verification: {
        Row: {
          id: boolean;
          received_at: string;
          verification_key: string;
        };
        Insert: {
          id?: boolean;
          received_at?: string;
          verification_key: string;
        };
        Update: {
          id?: boolean;
          received_at?: string;
          verification_key?: string;
        };
        Relationships: [];
      };
      team_avatars: {
        Row: {
          event_id: string;
          provider_key: string | null;
          source: string;
          storage_path: string;
          team_number: number;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          provider_key?: string | null;
          source?: string;
          storage_path: string;
          team_number: number;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          provider_key?: string | null;
          source?: string;
          storage_path?: string;
          team_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_avatars_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: true;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
        ];
      };
      team_incidents: {
        Row: {
          cause_evidence: string | null;
          cause_source: Database["public"]["Enums"]["incident_cause_source"];
          confirmed_cause: string | null;
          created_at: string;
          created_from_submission_id: string;
          event_id: string;
          id: string;
          match_id: string;
          observation_key: string;
          observed_at_seconds: number | null;
          observed_issue: Database["public"]["Enums"]["incident_issue"] | null;
          observed_note: string | null;
          observed_phase: string | null;
          observed_status: Database["public"]["Enums"]["incident_status"];
          recovered: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_issue_id: string | null;
          team_number: number;
          updated_at: string;
        };
        Insert: {
          cause_evidence?: string | null;
          cause_source?: Database["public"]["Enums"]["incident_cause_source"];
          confirmed_cause?: string | null;
          created_at?: string;
          created_from_submission_id: string;
          event_id: string;
          id?: string;
          match_id: string;
          observation_key: string;
          observed_at_seconds?: number | null;
          observed_issue?: Database["public"]["Enums"]["incident_issue"] | null;
          observed_note?: string | null;
          observed_phase?: string | null;
          observed_status: Database["public"]["Enums"]["incident_status"];
          recovered?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_issue_id?: string | null;
          team_number: number;
          updated_at?: string;
        };
        Update: {
          cause_evidence?: string | null;
          cause_source?: Database["public"]["Enums"]["incident_cause_source"];
          confirmed_cause?: string | null;
          created_at?: string;
          created_from_submission_id?: string;
          event_id?: string;
          id?: string;
          match_id?: string;
          observation_key?: string;
          observed_at_seconds?: number | null;
          observed_issue?: Database["public"]["Enums"]["incident_issue"] | null;
          observed_note?: string | null;
          observed_phase?: string | null;
          observed_status?: Database["public"]["Enums"]["incident_status"];
          recovered?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_issue_id?: string | null;
          team_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_incidents_created_from_submission_id_fkey";
            columns: ["created_from_submission_id"];
            isOneToOne: false;
            referencedRelation: "match_scouting_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_incidents_match_id_event_id_team_number_fkey";
            columns: ["match_id", "event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "match_teams";
            referencedColumns: ["match_id", "event_id", "team_number"];
          },
          {
            foreignKeyName: "team_incidents_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      team_notes: {
        Row: {
          author_user_id: string;
          created_at: string;
          event_id: string;
          id: string;
          note: string;
          team_number: number;
          updated_at: string;
        };
        Insert: {
          author_user_id: string;
          created_at?: string;
          event_id: string;
          id?: string;
          note: string;
          team_number: number;
          updated_at?: string;
        };
        Update: {
          author_user_id?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          note?: string;
          team_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_notes_author_user_id_fkey";
            columns: ["author_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_notes_event_id_team_number_fkey";
            columns: ["event_id", "team_number"];
            isOneToOne: false;
            referencedRelation: "event_teams";
            referencedColumns: ["event_id", "team_number"];
          },
        ];
      };
      teams: {
        Row: {
          city: string | null;
          country: string | null;
          created_at: string;
          name: string | null;
          nickname: string | null;
          rookie_year: number | null;
          source_metadata: Json;
          state: string | null;
          tba_team_key: string;
          team_number: number;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          name?: string | null;
          nickname?: string | null;
          rookie_year?: number | null;
          source_metadata?: Json;
          state?: string | null;
          tba_team_key: string;
          team_number: number;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          name?: string | null;
          nickname?: string | null;
          rookie_year?: number | null;
          source_metadata?: Json;
          state?: string | null;
          tba_team_key?: string;
          team_number?: number;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_save_profile: {
        Args: {
          actor_id: string;
          changes: Json;
          expected: Json;
          target_id: string;
        };
        Returns: undefined;
      };
      apply_statbotics_snapshot: {
        Args: { payload: Json };
        Returns: undefined;
      };
      apply_tba_snapshot: { Args: { payload: Json }; Returns: string };
      begin_admin_password_reset: {
        Args: { actor_id: string; request_id: string };
        Returns: string;
      };
      claim_pit_team: {
        Args: {
          actor: string;
          takeover?: boolean;
          target_event: string;
          target_team: number;
        };
        Returns: undefined;
      };
      claim_statbotics_sync: { Args: { target_event: string }; Returns: Json };
      claim_tba_refresh: {
        Args: {
          forced: boolean;
          minimum_age_seconds: number;
          target_key: string;
        };
        Returns: string;
      };
      complete_required_password_change: {
        Args: { actor_id: string };
        Returns: undefined;
      };
      confirm_team_incident: {
        Args: {
          actor: string;
          cause: string;
          evidence: string;
          source: Database["public"]["Enums"]["incident_cause_source"];
          target: string;
        };
        Returns: undefined;
      };
      correct_scouting_submission: {
        Args: {
          actor: string;
          expected_revision: number;
          payload: Json;
          provenance: Database["public"]["Enums"]["correction_provenance"];
          reason: string;
          target_kind: string;
          target_schema_version: number;
          target_submission: string;
        };
        Returns: number;
      };
      create_picklist_snapshot: {
        Args: {
          expected_revision: number;
          payload: Json;
          snapshot_name: string;
          target: string;
        };
        Returns: string;
      };
      dismiss_admin_password_reset: {
        Args: { actor_id: string; request_id: string };
        Returns: undefined;
      };
      finish_admin_password_reset: {
        Args: { actor_id: string; request_id: string };
        Returns: undefined;
      };
      finish_scout_break: { Args: { assignment: string }; Returns: undefined };
      get_event_match_coverage: { Args: { target: string }; Returns: Json };
      get_event_pit_completion: { Args: { target: string }; Returns: Json };
      get_match_coverage: {
        Args: { target_event: string; target_match: string };
        Returns: Json;
      };
      get_schedule_snapshot: { Args: { target: string }; Returns: Json };
      read_strategy_board_map: {
        Args: { target_event: string; target_match: string };
        Returns: {
          board_data: Json;
          revision: number;
          schema_version: number;
          updated_at: string;
        }[];
      };
      release_statbotics_sync: {
        Args: { claimed: string; retry_not_before: string };
        Returns: undefined;
      };
      release_tba_refresh: {
        Args: { claimed: string; target_key: string };
        Returns: undefined;
      };
      resolve_sync_conflict: {
        Args: {
          actor: string;
          next_resolution: Database["public"]["Enums"]["review_resolution"];
          target: string;
        };
        Returns: undefined;
      };
      review_scouting_submission: {
        Args: {
          actor: string;
          next_resolution: Database["public"]["Enums"]["review_resolution"];
          reason: string;
          target_kind: string;
          target_submission: string;
        };
        Returns: undefined;
      };
      save_event_picklist: {
        Args: { expected_revision: number; payload: Json; target: string };
        Returns: number;
      };
      save_pit_capture: {
        Args: {
          actor: string;
          client_id: string;
          expected_revision: number;
          finalize: boolean;
          payload: Json;
          takeover?: boolean;
          target_event: string;
          target_team: number;
        };
        Returns: Json;
      };
      save_scouting_schedule: {
        Args: { expected_version: string; operations: Json; target: string };
        Returns: number;
      };
      save_strategy_board: {
        Args: {
          document: Json;
          expected_revision: number;
          target_event: string;
          target_match: string;
        };
        Returns: number;
      };
      start_match_capture: {
        Args: {
          actor: string;
          allow_override?: boolean;
          expected_match: string;
          expected_scout: string;
          expected_team: number;
          target: string;
        };
        Returns: undefined;
      };
      store_nexus_inspection: {
        Args: {
          attempted_at: string;
          fetched_snapshot: Json;
          message: string;
          source_key: string;
          sync_result: string;
          target: string;
        };
        Returns: boolean;
      };
      store_nexus_pit_map: {
        Args: {
          attempted_at: string;
          fetched_layout: Json;
          message: string;
          raw_payload: Json;
          replace_manual?: boolean;
          source_key: string;
          sync_result: string;
          target: string;
        };
        Returns: boolean;
      };
      store_statbotics_sync: {
        Args: { claimed: string; payload: Json };
        Returns: undefined;
      };
      submit_match_capture: {
        Args: {
          actor: string;
          allow_override?: boolean;
          client_id: string;
          completed: string;
          expected_match: string;
          expected_scout: string;
          expected_team: number;
          payload: Json;
          started: string;
          target: string;
        };
        Returns: string;
      };
      submit_password_reset_request: {
        Args: { identifier: string };
        Returns: undefined;
      };
    };
    Enums: {
      alliance_color: "red" | "blue";
      assignment_status: "assigned" | "in_progress" | "submitted" | "missed";
      assignment_type: "match" | "break";
      correction_provenance: "live" | "manual_correction" | "video_rescout";
      event_status: "active" | "archived";
      external_source: "tba" | "statbotics";
      incident_cause_source:
        "unconfirmed" | "team_confirmed" | "strategy_confirmed" | "other";
      incident_issue:
        | "disabled"
        | "communications"
        | "drivetrain"
        | "intake"
        | "shooter_scorer"
        | "tipped"
        | "other";
      incident_status: "normal" | "minor_issue" | "major_issue" | "DNF" | "DNS";
      pit_status: "not_scouted" | "in_progress" | "completed" | "needs_review";
      profile_role: "scout" | "strategy" | "admin";
      review_resolution:
        "open" | "reviewed_no_change" | "video_review_requested" | "corrected";
      submission_status: "draft" | "final";
      sync_conflict_kind:
        "sync_conflict" | "duplicate_candidate" | "client_id_collision";
      sync_status: "idle" | "running" | "succeeded" | "failed";
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
    Enums: {
      alliance_color: ["red", "blue"],
      assignment_status: ["assigned", "in_progress", "submitted", "missed"],
      assignment_type: ["match", "break"],
      correction_provenance: ["live", "manual_correction", "video_rescout"],
      event_status: ["active", "archived"],
      external_source: ["tba", "statbotics"],
      incident_cause_source: [
        "unconfirmed",
        "team_confirmed",
        "strategy_confirmed",
        "other",
      ],
      incident_issue: [
        "disabled",
        "communications",
        "drivetrain",
        "intake",
        "shooter_scorer",
        "tipped",
        "other",
      ],
      incident_status: ["normal", "minor_issue", "major_issue", "DNF", "DNS"],
      pit_status: ["not_scouted", "in_progress", "completed", "needs_review"],
      profile_role: ["scout", "strategy", "admin"],
      review_resolution: [
        "open",
        "reviewed_no_change",
        "video_review_requested",
        "corrected",
      ],
      submission_status: ["draft", "final"],
      sync_conflict_kind: [
        "sync_conflict",
        "duplicate_candidate",
        "client_id_collision",
      ],
      sync_status: ["idle", "running", "succeeded", "failed"],
    },
  },
} as const;
