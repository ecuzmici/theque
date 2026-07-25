export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ItemCategory =
  | "books"
  | "movies_and_tv"
  | "restaurants"
  | "products"
  | "travel"
  | "recipes"
  | "articles";

export type ItemStatus =
  | "inbox"
  | "want"
  | "done"
  | "dismissed";

export type ItemSource =
  | "chrome_extension"
  | "ios_shortcut"
  | "manual"
  | "mobile_share_extension"
  // Bulk file import (POST /api/import). Requires the enum value added in
  // supabase/migrations/20260725160000_item_source_import.sql.
  | "import";

export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export type CategorySource =
  | "domain"
  | "schema_org"
  | "heuristic"
  | "manual"
  | "llm";

export type Database = {
  public: {
    Tables: {
      items: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          canonical_url: string;
          url_fingerprint: string;
          domain: string;
          title: string | null;
          subtitle: string | null;
          description: string | null;
          image_url: string | null;
          image_storage_path: string | null;
          category: ItemCategory | null;
          category_confidence: number | null;
          category_source: CategorySource | null;
          status: ItemStatus;
          source: ItemSource;
          note: string | null;
          processing_status: ProcessingStatus;
          enrichment_error: string | null;
          enrichment_attempts: number;
          enriched_at: string | null;
          structured: Json;
          raw_metadata: Json;
          display: Json;
          dominant_color: string | null;
          dominant_hue: number | null;
          rating_personal: number | null;
          verdict: string | null;
          done_at: string | null;
          search_vector: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          canonical_url: string;
          url_fingerprint: string;
          domain: string;
          title?: string | null;
          subtitle?: string | null;
          description?: string | null;
          image_url?: string | null;
          image_storage_path?: string | null;
          category?: ItemCategory | null;
          category_confidence?: number | null;
          category_source?: CategorySource | null;
          status?: ItemStatus;
          source: ItemSource;
          note?: string | null;
          processing_status?: ProcessingStatus;
          enrichment_error?: string | null;
          enrichment_attempts?: number;
          enriched_at?: string | null;
          structured?: Json;
          raw_metadata?: Json;
          display?: Json;
          dominant_color?: string | null;
          dominant_hue?: number | null;
          rating_personal?: number | null;
          verdict?: string | null;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          canonical_url?: string;
          url_fingerprint?: string;
          domain?: string;
          title?: string | null;
          subtitle?: string | null;
          description?: string | null;
          image_url?: string | null;
          image_storage_path?: string | null;
          category?: ItemCategory | null;
          category_confidence?: number | null;
          category_source?: CategorySource | null;
          status?: ItemStatus;
          source?: ItemSource;
          note?: string | null;
          processing_status?: ProcessingStatus;
          enrichment_error?: string | null;
          enrichment_attempts?: number;
          enriched_at?: string | null;
          structured?: Json;
          raw_metadata?: Json;
          display?: Json;
          dominant_color?: string | null;
          dominant_hue?: number | null;
          rating_personal?: number | null;
          verdict?: string | null;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recommendation_outcomes: {
        Row: {
          id: string;
          user_id: string;
          category: string;
          external_id: string | null;
          title_norm: string;
          outcome: string;
          dismiss_reason: string | null;
          shown_at: string;
          acted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          category: string;
          external_id?: string | null;
          title_norm: string;
          outcome: string;
          dismiss_reason?: string | null;
          shown_at?: string;
          acted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: string;
          external_id?: string | null;
          title_norm?: string;
          outcome?: string;
          dismiss_reason?: string | null;
          shown_at?: string;
          acted_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          email: string | null;
          digest_enabled: boolean;
          digest_day: number;
          ai_personalization_enabled: boolean;
          unsubscribe_token: string;
          last_digest_sent_at: string | null;
          // Server-owned deliverability state, written only by the Resend
          // webhook handler (service role). Readable by the owner so Settings
          // can explain why the letter stopped; never client-writable — see
          // supabase/migrations/20260725190000_profiles_digest_suppression.sql.
          digest_suppressed_at: string | null;
          digest_suppression_reason: string | null;
          digest_soft_bounce_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email?: string | null;
          digest_enabled?: boolean;
          digest_day?: number;
          ai_personalization_enabled?: boolean;
          unsubscribe_token?: string;
          last_digest_sent_at?: string | null;
          digest_suppressed_at?: string | null;
          digest_suppression_reason?: string | null;
          digest_soft_bounce_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string | null;
          digest_enabled?: boolean;
          digest_day?: number;
          ai_personalization_enabled?: boolean;
          unsubscribe_token?: string;
          last_digest_sent_at?: string | null;
          digest_suppressed_at?: string | null;
          digest_suppression_reason?: string | null;
          digest_soft_bounce_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_webhook_events: {
        Row: {
          svix_id: string;
          event_type: string;
          received_at: string;
        };
        Insert: {
          svix_id: string;
          event_type: string;
          received_at?: string;
        };
        Update: {
          svix_id?: string;
          event_type?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      capture_tokens: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          token_hash: string;
          token_prefix: string;
          last_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          token_hash: string;
          token_prefix: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          token_hash?: string;
          token_prefix?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // The 1- and 2-argument overloads were dropped in
      // 20260725180000_claim_enrichment_target_user.sql: `create or replace`
      // with a different argument count adds an overload rather than replacing,
      // which would make the cron's named-argument call ambiguous. One signature.
      claim_pending_enrichment_items: {
        Args: {
          batch_size?: number;
          per_user_cap?: number;
          /** null/absent = the globally fair cron claim; set = drain one user. */
          target_user?: string | null;
        };
        Returns: string[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
