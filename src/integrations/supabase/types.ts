export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_tasks: {
        Row: {
          conversation_id: string
          created_at: string
          data: Json
          finished_at: string | null
          id: string
          kind: string
          label: string
          message_id: string | null
          started_at: string
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          data?: Json
          finished_at?: string | null
          id?: string
          kind: string
          label?: string
          message_id?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          data?: Json
          finished_at?: string | null
          id?: string
          kind?: string
          label?: string
          message_id?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          answers: Json
          candidate_id: string | null
          created_at: string
          email: string
          id: string
          job_id: string
          linkedin: string | null
          location: string | null
          name: string
          phone: string | null
          recruiter_user_id: string
          resume_filename: string | null
          resume_url: string | null
          screening: Json
          status: string
        }
        Insert: {
          answers?: Json
          candidate_id?: string | null
          created_at?: string
          email: string
          id?: string
          job_id: string
          linkedin?: string | null
          location?: string | null
          name: string
          phone?: string | null
          recruiter_user_id: string
          resume_filename?: string | null
          resume_url?: string | null
          screening?: Json
          status?: string
        }
        Update: {
          answers?: Json
          candidate_id?: string | null
          created_at?: string
          email?: string
          id?: string
          job_id?: string
          linkedin?: string | null
          location?: string | null
          name?: string
          phone?: string | null
          recruiter_user_id?: string
          resume_filename?: string | null
          resume_url?: string | null
          screening?: Json
          status?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          activity: Json
          apollo_id: string | null
          application_id: string | null
          avatar: string
          company: string
          contact_channel: string | null
          contacted_at: string | null
          conversation_id: string
          created_at: string
          education: Json
          email: string | null
          experience: Json
          has_direct_phone: boolean
          id: string
          is_locked: boolean
          linkedin: string | null
          linkedin_slug: string | null
          location: string | null
          match: number
          match_breakdown: Json
          name: string
          pdl_id: string | null
          phone: string | null
          role: string
          source: string
          stage: string
          stage_changed_at: string
          starred: boolean
          summary: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          activity?: Json
          apollo_id?: string | null
          application_id?: string | null
          avatar?: string
          company?: string
          contact_channel?: string | null
          contacted_at?: string | null
          conversation_id: string
          created_at?: string
          education?: Json
          email?: string | null
          experience?: Json
          has_direct_phone?: boolean
          id?: string
          is_locked?: boolean
          linkedin?: string | null
          linkedin_slug?: string | null
          location?: string | null
          match?: number
          match_breakdown?: Json
          name: string
          pdl_id?: string | null
          phone?: string | null
          role?: string
          source?: string
          stage?: string
          stage_changed_at?: string
          starred?: boolean
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          activity?: Json
          apollo_id?: string | null
          application_id?: string | null
          avatar?: string
          company?: string
          contact_channel?: string | null
          contacted_at?: string | null
          conversation_id?: string
          created_at?: string
          education?: Json
          email?: string | null
          experience?: Json
          has_direct_phone?: boolean
          id?: string
          is_locked?: boolean
          linkedin?: string | null
          linkedin_slug?: string | null
          location?: string | null
          match?: number
          match_breakdown?: Json
          name?: string
          pdl_id?: string | null
          phone?: string | null
          role?: string
          source?: string
          stage?: string
          stage_changed_at?: string
          starred?: boolean
          summary?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          pinned_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pinned_at?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pinned_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          reason: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_posts: {
        Row: {
          channels: Json
          conversation_id: string
          created_at: string
          est_reach: number
          id: string
          schedule: Json
          status: string
          updated_at: string
          user_id: string
          variants: Json
        }
        Insert: {
          channels?: Json
          conversation_id: string
          created_at?: string
          est_reach?: number
          id?: string
          schedule?: Json
          status?: string
          updated_at?: string
          user_id: string
          variants?: Json
        }
        Update: {
          channels?: Json
          conversation_id?: string
          created_at?: string
          est_reach?: number
          id?: string
          schedule?: Json
          status?: string
          updated_at?: string
          user_id?: string
          variants?: Json
        }
        Relationships: []
      }
      jobs: {
        Row: {
          company: string
          conversation_id: string
          created_at: string
          currency: string
          description: string
          employment_type: string
          id: string
          location: string
          must_have: string[]
          nice_to_have: string[]
          published: boolean
          published_at: string | null
          requirements: string[]
          responsibilities: string[]
          salary_max: number | null
          salary_min: number | null
          screening: Json
          slug: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string
          conversation_id: string
          created_at?: string
          currency?: string
          description?: string
          employment_type?: string
          id?: string
          location?: string
          must_have?: string[]
          nice_to_have?: string[]
          published?: boolean
          published_at?: string | null
          requirements?: string[]
          responsibilities?: string[]
          salary_max?: number | null
          salary_min?: number | null
          screening?: Json
          slug?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string
          conversation_id?: string
          created_at?: string
          currency?: string
          description?: string
          employment_type?: string
          id?: string
          location?: string
          must_have?: string[]
          nice_to_have?: string[]
          published?: boolean
          published_at?: string | null
          requirements?: string[]
          responsibilities?: string[]
          salary_max?: number | null
          salary_min?: number | null
          screening?: Json
          slug?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_drafts: {
        Row: {
          channel: string
          conversation_id: string
          created_at: string
          email_body: string
          email_subject: string
          followups: Json
          id: string
          linkedin_template: string
          local_time_send: boolean
          pause_if_reply: boolean
          personalize_ai: boolean
          skip_if_recent: boolean
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          conversation_id: string
          created_at?: string
          email_body?: string
          email_subject?: string
          followups?: Json
          id?: string
          linkedin_template?: string
          local_time_send?: boolean
          pause_if_reply?: boolean
          personalize_ai?: boolean
          skip_if_recent?: boolean
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          conversation_id?: string
          created_at?: string
          email_body?: string
          email_subject?: string
          followups?: Json
          id?: string
          linkedin_template?: string
          local_time_send?: boolean
          pause_if_reply?: boolean
          personalize_ai?: boolean
          skip_if_recent?: boolean
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          credits_remaining: number
          id: string
          plan: string
          sourcing_projects_used: number
        }
        Insert: {
          created_at?: string
          credits_remaining?: number
          id: string
          plan?: string
          sourcing_projects_used?: number
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          id?: string
          plan?: string
          sourcing_projects_used?: number
        }
        Relationships: []
      }
      prompt_partials: {
        Row: {
          body: string
          created_at: string
          description: string
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          description?: string
          id?: string
          slug: string
          title?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          description?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_revisions: {
        Row: {
          body: string
          created_at: string
          description: string
          edited_by: string | null
          id: string
          prompt_id: string
          title: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          description?: string
          edited_by?: string | null
          id?: string
          prompt_id: string
          title?: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          description?: string
          edited_by?: string | null
          id?: string
          prompt_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_revisions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          body: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          slug: string
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      sourcing_credits_usage: {
        Row: {
          collect_credits_used: number
          created_at: string
          id: string
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          collect_credits_used?: number
          created_at?: string
          id?: string
          period: string
          updated_at?: string
          user_id: string
        }
        Update: {
          collect_credits_used?: number
          created_at?: string
          id?: string
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sourcing_preview_candidates: {
        Row: {
          collected_at: string | null
          created_at: string
          display_source: string
          external_id: string
          id: string
          keyword_score: number
          linkedin_slug: string | null
          preview: Json
          project_id: string
          source: string
          user_id: string
        }
        Insert: {
          collected_at?: string | null
          created_at?: string
          display_source?: string
          external_id: string
          id?: string
          keyword_score?: number
          linkedin_slug?: string | null
          preview?: Json
          project_id: string
          source: string
          user_id: string
        }
        Update: {
          collected_at?: string | null
          created_at?: string
          display_source?: string
          external_id?: string
          id?: string
          keyword_score?: number
          linkedin_slug?: string | null
          preview?: Json
          project_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_preview_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "sourcing_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_projects: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          last_searched_at: string | null
          normalized: Json
          raw_prompt: string
          research: Json
          search_criteria: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          last_searched_at?: string | null
          normalized?: Json
          raw_prompt?: string
          research?: Json
          search_criteria?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          last_searched_at?: string | null
          normalized?: Json
          raw_prompt?: string
          research?: Json
          search_criteria?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_sourcing_usage: {
        Args: { _count: number; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
