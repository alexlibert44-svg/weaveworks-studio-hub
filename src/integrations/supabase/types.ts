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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      daily_progress: {
        Row: {
          day: string
          device_id: string
          goal_minutes: number
          id: string
          items_completed: number
          minutes_practiced: number
        }
        Insert: {
          day?: string
          device_id?: string
          goal_minutes?: number
          id?: string
          items_completed?: number
          minutes_practiced?: number
        }
        Update: {
          day?: string
          device_id?: string
          goal_minutes?: number
          id?: string
          items_completed?: number
          minutes_practiced?: number
        }
        Relationships: []
      }
      learners: {
        Row: {
          audio_autoplay: boolean
          created_at: string
          daily_goal_minutes: number
          device_id: string
          display_name: string
          learning_language: string
          longest_streak: number
          native_language: string
          notifications_enabled: boolean
          onboarding_completed: boolean
          streak: number
        }
        Insert: {
          audio_autoplay?: boolean
          created_at?: string
          daily_goal_minutes?: number
          device_id?: string
          display_name?: string
          learning_language?: string
          longest_streak?: number
          native_language?: string
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          streak?: number
        }
        Update: {
          audio_autoplay?: boolean
          created_at?: string
          daily_goal_minutes?: number
          device_id?: string
          display_name?: string
          learning_language?: string
          longest_streak?: number
          native_language?: string
          notifications_enabled?: boolean
          onboarding_completed?: boolean
          streak?: number
        }
        Relationships: []
      }
      learning_items: {
        Row: {
          attempts: number
          created_at: string
          device_id: string
          difficulty: number
          ease: number
          form: string
          form_id: string | null
          id: string
          interval_days: number
          last_reviewed_at: string | null
          mastery: number
          mistakes: number
          next_review_at: string
          sentence_id: string | null
          set_id: string
          skill: Database["public"]["Enums"]["skill_kind"]
          state: Database["public"]["Enums"]["mastery_state"]
          streak: number
          word_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          device_id?: string
          difficulty?: number
          ease?: number
          form?: string
          form_id?: string | null
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          mastery?: number
          mistakes?: number
          next_review_at?: string
          sentence_id?: string | null
          set_id: string
          skill: Database["public"]["Enums"]["skill_kind"]
          state?: Database["public"]["Enums"]["mastery_state"]
          streak?: number
          word_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          device_id?: string
          difficulty?: number
          ease?: number
          form?: string
          form_id?: string | null
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          mastery?: number
          mistakes?: number
          next_review_at?: string
          sentence_id?: string | null
          set_id?: string
          skill?: Database["public"]["Enums"]["skill_kind"]
          state?: Database["public"]["Enums"]["mastery_state"]
          streak?: number
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_items_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "word_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_items_sentence_id_fkey"
            columns: ["sentence_id"]
            isOneToOne: false
            referencedRelation: "sentences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "word_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_items_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempts: {
        Row: {
          created_at: string
          device_id: string
          id: string
          is_correct: boolean
          learning_item_id: string
          response: string | null
          score: number | null
          skill: Database["public"]["Enums"]["skill_kind"]
        }
        Insert: {
          created_at?: string
          device_id?: string
          id?: string
          is_correct: boolean
          learning_item_id: string
          response?: string | null
          score?: number | null
          skill: Database["public"]["Enums"]["skill_kind"]
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          is_correct?: boolean
          learning_item_id?: string
          response?: string | null
          score?: number | null
          skill?: Database["public"]["Enums"]["skill_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempts_learning_item_id_fkey"
            columns: ["learning_item_id"]
            isOneToOne: false
            referencedRelation: "learning_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pronunciation_attempts: {
        Row: {
          attempt_index: number
          created_at: string
          device_id: string
          id: string
          learning_item_id: string
          matched_words: string[]
          missed_words: string[]
          score: number
          target_text: string
          transcript: string
        }
        Insert: {
          attempt_index?: number
          created_at?: string
          device_id?: string
          id?: string
          learning_item_id: string
          matched_words?: string[]
          missed_words?: string[]
          score?: number
          target_text: string
          transcript?: string
        }
        Update: {
          attempt_index?: number
          created_at?: string
          device_id?: string
          id?: string
          learning_item_id?: string
          matched_words?: string[]
          missed_words?: string[]
          score?: number
          target_text?: string
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "pronunciation_attempts_learning_item_id_fkey"
            columns: ["learning_item_id"]
            isOneToOne: false
            referencedRelation: "learning_items"
            referencedColumns: ["id"]
          },
        ]
      }
      review_sessions: {
        Row: {
          completed_at: string | null
          device_id: string
          id: string
          kind: string
          phase: string
          position: number
          purpose: string
          scheduled_for: string | null
          set_id: string
          started_at: string
          state: Json
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          device_id?: string
          id?: string
          kind: string
          phase?: string
          position?: number
          purpose: string
          scheduled_for?: string | null
          set_id: string
          started_at?: string
          state?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          device_id?: string
          id?: string
          kind?: string
          phase?: string
          position?: number
          purpose?: string
          scheduled_for?: string | null
          set_id?: string
          started_at?: string
          state?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_sessions_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "word_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sentences: {
        Row: {
          created_at: string
          form: string
          id: string
          is_ai_generated: boolean
          text: string
          translation: string | null
          variation_index: number
          word_hints: Json
          word_id: string
        }
        Insert: {
          created_at?: string
          form?: string
          id?: string
          is_ai_generated?: boolean
          text: string
          translation?: string | null
          variation_index?: number
          word_hints?: Json
          word_id: string
        }
        Update: {
          created_at?: string
          form?: string
          id?: string
          is_ai_generated?: boolean
          text?: string
          translation?: string | null
          variation_index?: number
          word_hints?: Json
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentences_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      word_forms: {
        Row: {
          created_at: string
          device_id: string
          example: string | null
          example_translation: string | null
          explanation: string | null
          form_kind: string
          form_label: string
          id: string
          is_regular: boolean | null
          position: number
          pronunciation: string | null
          set_id: string
          text: string
          translation: string | null
          word_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string
          example?: string | null
          example_translation?: string | null
          explanation?: string | null
          form_kind?: string
          form_label: string
          id?: string
          is_regular?: boolean | null
          position?: number
          pronunciation?: string | null
          set_id: string
          text: string
          translation?: string | null
          word_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          example?: string | null
          example_translation?: string | null
          explanation?: string | null
          form_kind?: string
          form_label?: string
          id?: string
          is_regular?: boolean | null
          position?: number
          pronunciation?: string | null
          set_id?: string
          text?: string
          translation?: string | null
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "word_forms_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "word_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "word_forms_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      word_sets: {
        Row: {
          created_at: string
          device_id: string
          forms_generated_at: string | null
          forms_last_reviewed_at: string | null
          forms_next_review_at: string | null
          forms_review_stage: number
          id: string
          is_demo: boolean
          last_practiced_at: string | null
          last_reviewed_at: string | null
          name: string
          native_language: string
          next_review_at: string | null
          review_stage: number
          target_language: string
        }
        Insert: {
          created_at?: string
          device_id?: string
          forms_generated_at?: string | null
          forms_last_reviewed_at?: string | null
          forms_next_review_at?: string | null
          forms_review_stage?: number
          id?: string
          is_demo?: boolean
          last_practiced_at?: string | null
          last_reviewed_at?: string | null
          name: string
          native_language?: string
          next_review_at?: string | null
          review_stage?: number
          target_language?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          forms_generated_at?: string | null
          forms_last_reviewed_at?: string | null
          forms_next_review_at?: string | null
          forms_review_stage?: number
          id?: string
          is_demo?: boolean
          last_practiced_at?: string | null
          last_reviewed_at?: string | null
          name?: string
          native_language?: string
          next_review_at?: string | null
          review_stage?: number
          target_language?: string
        }
        Relationships: []
      }
      words: {
        Row: {
          alternative_parts_of_speech: string[]
          created_at: string
          difficulty: number | null
          forms_category: string | null
          id: string
          meaning: string | null
          part_of_speech: string | null
          position: number
          pronunciation: string | null
          set_id: string
          tags: string[]
          text: string
          translation: string | null
        }
        Insert: {
          alternative_parts_of_speech?: string[]
          created_at?: string
          difficulty?: number | null
          forms_category?: string | null
          id?: string
          meaning?: string | null
          part_of_speech?: string | null
          position?: number
          pronunciation?: string | null
          set_id: string
          tags?: string[]
          text: string
          translation?: string | null
        }
        Update: {
          alternative_parts_of_speech?: string[]
          created_at?: string
          difficulty?: number | null
          forms_category?: string | null
          id?: string
          meaning?: string | null
          part_of_speech?: string | null
          position?: number
          pronunciation?: string | null
          set_id?: string
          tags?: string[]
          text?: string
          translation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "words_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "word_sets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_review_session: { Args: { _session_id: string }; Returns: Json }
      owns_set: { Args: { _set_id: string }; Returns: boolean }
      owns_word: { Args: { _word_id: string }; Returns: boolean }
      review_interval_days: { Args: { _stage: number }; Returns: number }
    }
    Enums: {
      mastery_state: "new" | "learning" | "familiar" | "strong" | "mastered"
      skill_kind:
        | "recognition"
        | "listening"
        | "reading"
        | "writing"
        | "speaking"
        | "recall"
        | "sentence_usage"
        | "form"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      mastery_state: ["new", "learning", "familiar", "strong", "mastered"],
      skill_kind: [
        "recognition",
        "listening",
        "reading",
        "writing",
        "speaking",
        "recall",
        "sentence_usage",
        "form",
      ],
    },
  },
} as const
