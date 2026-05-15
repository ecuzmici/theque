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
  | "gifts"
  | "travel"
  | "recipes"
  | "articles";

export type ItemStatus =
  | "inbox"
  | "want"
  | "planned"
  | "done"
  | "dismissed";

export type ItemSource =
  | "chrome_extension"
  | "ios_shortcut"
  | "manual"
  | "mobile_share_extension";

export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export type CategorySource =
  | "domain"
  | "schema_org"
  | "heuristic"
  | "manual";

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
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_tags: {
        Row: {
          item_id: string;
          tag_id: string;
        };
        Insert: {
          item_id: string;
          tag_id: string;
        };
        Update: {
          item_id?: string;
          tag_id?: string;
        };
        Relationships: [];
      };
      collection_items: {
        Row: {
          collection_id: string;
          item_id: string;
          added_at: string;
        };
        Insert: {
          collection_id: string;
          item_id: string;
          added_at?: string;
        };
        Update: {
          collection_id?: string;
          item_id?: string;
          added_at?: string;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
