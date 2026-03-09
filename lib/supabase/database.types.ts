export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nickname: string;
          username: string | null;
          avatar_url: string | null;
          steam_id: string | null;
          created_at: string;
          is_admin: boolean;
          behavior_score: number;
          mmr_status: string;
        };
        Insert: {
          id: string;
          nickname: string;
          username?: string | null;
          avatar_url?: string | null;
          steam_id?: string | null;
          created_at?: string;
          is_admin?: boolean;
          behavior_score?: number;
          mmr_status?: string;
        };
        Update: {
          id?: string;
          nickname?: string;
          username?: string | null;
          avatar_url?: string | null;
          steam_id?: string | null;
          created_at?: string;
          is_admin?: boolean;
          behavior_score?: number;
          mmr_status?: string;
        };
        Relationships: [];
      };
      behavior_logs: {
        Row: {
          id: string;
          user_id: string;
          match_id: string | null;
          score_change: number;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          match_id?: string | null;
          score_change: number;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          match_id?: string | null;
          score_change?: number;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          subscription: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          subscription: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          subscription?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          tagline: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          logo_url?: string | null;
          tagline?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          logo_url?: string | null;
          tagline?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          team_id: string;
          user_id: string;
          is_captain: boolean;
          created_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          is_captain?: boolean;
          created_at?: string;
        };
        Update: {
          team_id?: string;
          user_id?: string;
          is_captain?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      tournaments: {
        Row: {
          id: string;
          name: string;
          banner_url: string | null;
          is_active: boolean;
          number_of_groups: number;
          teams_eliminated_per_group: number;
          playoff_format: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          banner_url?: string | null;
          is_active?: boolean;
          number_of_groups?: number;
          teams_eliminated_per_group?: number;
          playoff_format?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          banner_url?: string | null;
          is_active?: boolean;
          number_of_groups?: number;
          teams_eliminated_per_group?: number;
          playoff_format?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tournament_confirmations: {
        Row: {
          tournament_id: string;
          user_id: string;
          confirmed_at: string;
        };
        Insert: {
          tournament_id: string;
          user_id: string;
          confirmed_at?: string;
        };
        Update: {
          tournament_id?: string;
          user_id?: string;
          confirmed_at?: string;
        };
        Relationships: [];
      };
      tournament_team_entries: {
        Row: {
          id: string;
          tournament_id: string;
          team_id: string;
          entered_by: string;
          is_suspended: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          team_id: string;
          entered_by: string;
          is_suspended?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          team_id?: string;
          entered_by?: string;
          is_suspended?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      tournament_matches: {
        Row: {
          id: string;
          tournament_id: string;
          team_a_id: string;
          team_b_id: string;
          round_label: string;
          scheduled_at: string | null;
          status: string;
          team_a_score: number | null;
          team_b_score: number | null;
          display_order: number;
          format: string;
          created_at: string;
          lobby_name: string | null;
          lobby_password: string | null;
          result_screenshot_urls: string[] | null;
          winner_team_id: string | null;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          team_a_id: string;
          team_b_id: string;
          round_label: string;
          scheduled_at?: string | null;
          status?: string;
          team_a_score?: number | null;
          team_b_score?: number | null;
          display_order?: number;
          format?: string;
          created_at?: string;
          lobby_name?: string | null;
          lobby_password?: string | null;
          result_screenshot_urls?: string[] | null;
          winner_team_id?: string | null;
        };
        Update: {
          id?: string;
          tournament_id?: string;
          team_a_id?: string;
          team_b_id?: string;
          round_label?: string;
          scheduled_at?: string | null;
          status?: string;
          team_a_score?: number | null;
          team_b_score?: number | null;
          display_order?: number;
          format?: string;
          created_at?: string;
          lobby_name?: string | null;
          lobby_password?: string | null;
          result_screenshot_urls?: string[] | null;
          winner_team_id?: string | null;
        };
        Relationships: [];
      };
      match_check_ins: {
        Row: {
          match_id: string;
          player_id: string;
          created_at: string;
          biometric_verified: boolean;
          is_checked_in: boolean;
          lobby_screenshot_url: string | null;
        };
        Insert: {
          match_id: string;
          player_id: string;
          created_at?: string;
          biometric_verified?: boolean;
          is_checked_in?: boolean;
          lobby_screenshot_url?: string | null;
        };
        Update: {
          match_id?: string;
          player_id?: string;
          created_at?: string;
          biometric_verified?: boolean;
          is_checked_in?: boolean;
          lobby_screenshot_url?: string | null;
        };
        Relationships: [];
      };
      user_passkeys: {
        Row: {
          id: string;
          credential_id: string;
          user_id: string;
          public_key: string;
          counter: number;
          device_type: string;
          backed_up: boolean;
          transports: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          credential_id: string;
          user_id: string;
          public_key: string;
          counter?: number;
          device_type: string;
          backed_up?: boolean;
          transports?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          credential_id?: string;
          user_id?: string;
          public_key?: string;
          counter?: number;
          device_type?: string;
          backed_up?: boolean;
          transports?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      leave_current_team: {
        Args: {
          p_user_id: string;
        };
        Returns: string;
      };
      delete_team_if_last_captain: {
        Args: {
          p_user_id: string;
        };
        Returns: string;
      };
      team_is_locked_for_active_tournament: {
        Args: {
          p_team_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
