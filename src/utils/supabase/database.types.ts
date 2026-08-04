export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      babies: {
        Row: {
          baby_surname: string
          created_at: string
          id: string
        }
        Insert: {
          baby_surname: string
          created_at?: string
          id?: string
        }
        Update: {
          baby_surname?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      baby_access: {
        Row: {
          access_level: Database["public"]["Enums"]["role"]
          baby_id: string
          created_at: string
          id: string
          nickname: string | null
          relation_to_baby: string
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["role"]
          baby_id: string
          created_at?: string
          id?: string
          nickname?: string | null
          relation_to_baby?: string
          user_id?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["role"]
          baby_id?: string
          created_at?: string
          id?: string
          nickname?: string | null
          relation_to_baby?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baby_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_access_project_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          page_url: string | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["bug_report_status"]
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          description: string
          id?: string
          page_url?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["bug_report_status"]
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          page_url?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["bug_report_status"]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          baby_id: string | null
          created_at: string
          id: string
          name: string | null
          parent_circle: string | null
        }
        Insert: {
          baby_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          parent_circle?: string | null
        }
        Update: {
          baby_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          parent_circle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circles_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circles_parent_circle_fkey"
            columns: ["parent_circle"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles_access: {
        Row: {
          baby_id: string | null
          circle_id: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          baby_id?: string | null
          circle_id: string
          created_at?: string
          id?: number
          user_id?: string
        }
        Update: {
          baby_id?: string | null
          circle_id?: string
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circles_access_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circles_access_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          baby_id: string
          created_at: string
          created_by: string
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          milestone_type: Database["public"]["Enums"]["milestone_type"] | null
          title: string
        }
        Insert: {
          baby_id: string
          created_at?: string
          created_by?: string
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          milestone_type?: Database["public"]["Enums"]["milestone_type"] | null
          title: string
        }
        Update: {
          baby_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          milestone_type?: Database["public"]["Enums"]["milestone_type"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events_circles: {
        Row: {
          circle_id: string
          event_id: string
        }
        Insert: {
          circle_id: string
          event_id: string
        }
        Update: {
          circle_id?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_circles_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_circles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      guess_questions: {
        Row: {
          baby_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          options: Json | null
          position: number
          status: string
          title: string | null
          type: string
        }
        Insert: {
          baby_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active: boolean
          options?: Json | null
          position?: number
          status?: string
          title?: string | null
          type: string
        }
        Update: {
          baby_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          options?: Json | null
          position?: number
          status?: string
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "guess_questions_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guess_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guesses: {
        Row: {
          answer: Json | null
          baby_id: string
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          answer?: Json | null
          baby_id: string
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Update: {
          answer?: Json | null
          baby_id?: string
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guesses_question_id_project_id_fkey"
            columns: ["question_id", "baby_id"]
            isOneToOne: false
            referencedRelation: "guess_questions"
            referencedColumns: ["id", "baby_id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          baby_id: string
          category: string
          condition: Database["public"]["Enums"]["item_condition"] | null
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          name: string
          position: number
          price_paid: number | null
          purchased_from: string | null
          quantity_owned: number
          quantity_target: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          baby_id: string
          category: string
          condition?: Database["public"]["Enums"]["item_condition"] | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          name: string
          position: number
          price_paid?: number | null
          purchased_from?: string | null
          quantity_owned?: number
          quantity_target?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          baby_id?: string
          category?: string
          condition?: Database["public"]["Enums"]["item_condition"] | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          name?: string
          position?: number
          price_paid?: number | null
          purchased_from?: string | null
          quantity_owned?: number
          quantity_target?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          baby_id: string
          created_at: string
          expires_at: string
          id: string
        }
        Insert: {
          baby_id: string
          created_at?: string
          expires_at: string
          id?: string
        }
        Update: {
          baby_id?: string
          created_at?: string
          expires_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          baby_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          baby_id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          baby_id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          user_id: string
        }
        Insert: {
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          user_id: string
        }
        Update: {
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          baby_id: string
          body: string
          created_at: string
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          baby_id: string
          body: string
          created_at?: string
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          baby_id?: string
          body?: string
          created_at?: string
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      page_settings: {
        Row: {
          baby_id: string
          enabled: boolean
          id: string
          page_id: string
          required_role: Database["public"]["Enums"]["role"]
          updated_at: string
        }
        Insert: {
          baby_id: string
          enabled?: boolean
          id?: string
          page_id: string
          required_role?: Database["public"]["Enums"]["role"]
          updated_at?: string
        }
        Update: {
          baby_id?: string
          enabled?: boolean
          id?: string
          page_id?: string
          required_role?: Database["public"]["Enums"]["role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_settings_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          position: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          position?: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: number
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          option_id: string
          poll_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: number
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          created_at: string
          created_by: string
          id: string
          post_id: string
          question: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          post_id: string
          question: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          post_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          body: string
          circle_ids: string[]
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body: string
          circle_ids?: string[]
          created_at?: string
          id?: string
          post_id: string
          user_id?: string
        }
        Update: {
          body?: string
          circle_ids?: string[]
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_photos: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          position: number
          post_id: string
          storage_path: string
          thumbnail_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          position?: number
          post_id: string
          storage_path: string
          thumbnail_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          position?: number
          post_id?: string
          storage_path?: string
          thumbnail_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_photos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: number
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: number
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: number
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          id: number
          post_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: number
          post_id: string
          user_id?: string
          viewed_at?: string
        }
        Update: {
          id?: number
          post_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          baby_id: string
          caption: string | null
          created_at: string
          created_by: string
          id: string
          taken_at: string
        }
        Insert: {
          baby_id: string
          caption?: string | null
          created_at?: string
          created_by?: string
          id?: string
          taken_at?: string
        }
        Update: {
          baby_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string
          id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_baby_id_fkey"
            columns: ["baby_id"]
            isOneToOne: false
            referencedRelation: "babies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      posts_circles: {
        Row: {
          circle_id: string
          post_id: string
        }
        Insert: {
          circle_id: string
          post_id: string
        }
        Update: {
          circle_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_circles_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_circles_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          device_label: string | null
          endpoint: string
          id: number
          last_seen_at: string
          subscription: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: number
          last_seen_at?: string
          subscription: Json
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: number
          last_seen_at?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_inventory_owned: {
        Args: {
          actor_id: string
          delta: number
          item_id: string
          target_baby_id: string
        }
        Returns: {
          baby_id: string
          category: string
          condition: Database["public"]["Enums"]["item_condition"] | null
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          name: string
          position: number
          price_paid: number | null
          purchased_from: string | null
          quantity_owned: number
          quantity_target: number | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_baby_admin: { Args: { target_baby_id: string }; Returns: boolean }
      is_baby_member: { Args: { target_baby_id: string }; Returns: boolean }
      is_circle_visible: {
        Args: { target_baby_id: string; target_circle_ids: string[] }
        Returns: boolean
      }
      shares_baby_with: { Args: { target_user_id: string }; Returns: boolean }
    }
    Enums: {
      bug_report_status: "new" | "reviewed" | "fixed"
      event_kind: "occasion" | "life_stage" | "medical"
      item_condition: "new" | "secondhand"
      milestone_type:
        | "first_steps"
        | "first_tooth"
        | "first_word"
        | "first_smile"
        | "first_laugh"
        | "birthday"
        | "other"
      notification_type:
        | "new_post"
        | "new_comment"
        | "new_pronostic"
        | "new_member"
        | "new_reaction"
        | "new_life_stage"
        | "circle_access_granted"
      role: "admin" | "viewer"
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
      bug_report_status: ["new", "reviewed", "fixed"],
      event_kind: ["occasion", "life_stage", "medical"],
      item_condition: ["new", "secondhand"],
      milestone_type: [
        "first_steps",
        "first_tooth",
        "first_word",
        "first_smile",
        "first_laugh",
        "birthday",
        "other",
      ],
      notification_type: [
        "new_post",
        "new_comment",
        "new_pronostic",
        "new_member",
        "new_reaction",
        "new_life_stage",
        "circle_access_granted",
      ],
      role: ["admin", "viewer"],
    },
  },
} as const

