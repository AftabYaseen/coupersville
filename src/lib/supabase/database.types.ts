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
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          cover_path: string | null
          created_at: string
          description: string | null
          id: string
          logo_path: string | null
          name: string
          owner_id: string
          primary_category_id: string | null
          status: Database["public"]["Enums"]["business_status"]
          timezone: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name: string
          owner_id: string
          primary_category_id?: string | null
          status?: Database["public"]["Enums"]["business_status"]
          timezone?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          owner_id?: string
          primary_category_id?: string | null
          status?: Database["public"]["Enums"]["business_status"]
          timezone?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_primary_category_id_fkey"
            columns: ["primary_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          shop_label: string
          slug: string
          sort_order: number
          stock_tint: Database["public"]["Enums"]["stock_tint"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          shop_label: string
          slug: string
          sort_order?: number
          stock_tint: Database["public"]["Enums"]["stock_tint"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          shop_label?: string
          slug?: string
          sort_order?: number
          stock_tint?: Database["public"]["Enums"]["stock_tint"]
          updated_at?: string
        }
        Relationships: []
      }
      coupon_locations: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          location_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          location_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_locations_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_locations_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "live_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          all_locations: boolean
          business_id: string
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          expires_at: string
          featured: boolean
          id: string
          image_path: string | null
          included_products: string | null
          limits_text: string | null
          max_people: number | null
          min_qty: number | null
          min_spend: number | null
          per_user_limit: number
          starts_at: string
          status: Database["public"]["Enums"]["coupon_status"]
          title: string
          total_limit: number | null
          updated_at: string
        }
        Insert: {
          all_locations?: boolean
          business_id: string
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          expires_at: string
          featured?: boolean
          id?: string
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["coupon_status"]
          title: string
          total_limit?: number | null
          updated_at?: string
        }
        Update: {
          all_locations?: boolean
          business_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          expires_at?: string
          featured?: boolean
          id?: string
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["coupon_status"]
          title?: string
          total_limit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupons_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "live_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address_line1: string
          address_line2: string | null
          business_id: string
          city: string
          created_at: string
          geo: unknown
          id: string
          phone: string | null
          postal_code: string | null
          state: string | null
          store_name: string
          store_number: string | null
          updated_at: string
          lat: number | null
          lng: number | null
        }
        Insert: {
          active?: boolean
          address_line1: string
          address_line2?: string | null
          business_id: string
          city: string
          created_at?: string
          geo?: unknown
          id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          store_name: string
          store_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address_line1?: string
          address_line2?: string | null
          business_id?: string
          city?: string
          created_at?: string
          geo?: unknown
          id?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          store_name?: string
          store_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          consumer_login: string
          coupon_moderation: string
          created_at: string
          id: string
          plans: string
          redemption_method: string
          region_restriction: string | null
          singleton: boolean
          subscription_expiry: string
          updated_at: string
        }
        Insert: {
          consumer_login?: string
          coupon_moderation?: string
          created_at?: string
          id?: string
          plans?: string
          redemption_method?: string
          region_restriction?: string | null
          singleton?: boolean
          subscription_expiry?: string
          updated_at?: string
        }
        Update: {
          consumer_login?: string
          coupon_moderation?: string
          created_at?: string
          id?: string
          plans?: string
          redemption_method?: string
          region_restriction?: string | null
          singleton?: boolean
          subscription_expiry?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: []
      }
      redemption_tokens: {
        Row: {
          coupon_id: string
          created_at: string
          expires_at: string
          id: string
          short_code: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          expires_at: string
          id?: string
          short_code: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          short_code?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemption_tokens_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_tokens_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "live_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          business_id: string
          coupon_id: string
          created_at: string
          id: string
          location_id: string | null
          method: Database["public"]["Enums"]["redemption_method"]
          redeemed_at: string
          token_id: string | null
          user_id: string | null
          verified_by: string | null
        }
        Insert: {
          business_id: string
          coupon_id: string
          created_at?: string
          id?: string
          location_id?: string | null
          method: Database["public"]["Enums"]["redemption_method"]
          redeemed_at?: string
          token_id?: string | null
          user_id?: string | null
          verified_by?: string | null
        }
        Update: {
          business_id?: string
          coupon_id?: string
          created_at?: string
          id?: string
          location_id?: string | null
          method?: Database["public"]["Enums"]["redemption_method"]
          redeemed_at?: string
          token_id?: string | null
          user_id?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "live_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: true
            referencedRelation: "redemption_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          source: Database["public"]["Enums"]["subscription_source"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          source: Database["public"]["Enums"]["subscription_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          source?: Database["public"]["Enums"]["subscription_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      live_coupons: {
        Row: {
          all_locations: boolean | null
          business_id: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number | null
          expires_at: string | null
          featured: boolean | null
          id: string | null
          image_path: string | null
          included_products: string | null
          limits_text: string | null
          max_people: number | null
          min_qty: number | null
          min_spend: number | null
          per_user_limit: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["coupon_status"] | null
          title: string | null
          total_limit: number | null
          updated_at: string | null
        }
        Insert: {
          all_locations?: boolean | null
          business_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          expires_at?: string | null
          featured?: boolean | null
          id?: string | null
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"] | null
          title?: string | null
          total_limit?: number | null
          updated_at?: string | null
        }
        Update: {
          all_locations?: boolean | null
          business_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          expires_at?: string | null
          featured?: boolean | null
          id?: string | null
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"] | null
          title?: string | null
          total_limit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_staff_invite: { Args: { p_token: string }; Returns: Json }
      admin_list_businesses: {
        Args: {
          p_query?: string
          p_status?: Database["public"]["Enums"]["business_status"]
        }
        Returns: {
          category_name: string
          coupon_count: number
          created_at: string
          id: string
          live_coupon_count: number
          name: string
          owner_email: string
          owner_name: string
          plan_active: boolean
          plan_ends_at: string
          plan_source: Database["public"]["Enums"]["subscription_source"]
          plan_status: Database["public"]["Enums"]["subscription_status"]
          redemptions_30d: number
          status: Database["public"]["Enums"]["business_status"]
          store_count: number
          timezone: string
        }[]
      }
      admin_platform_stats: { Args: never; Returns: Json }
      business_is_publishable: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      business_redemption_stats: {
        Args: { p_business_id: string }
        Returns: Json
      }
      business_team: {
        Args: { p_business_id: string }
        Returns: {
          email: string
          full_name: string
          joined_at: string
          member_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }[]
      }
      can_manage_business: { Args: { p_business_id: string }; Returns: boolean }
      can_manage_business_path: { Args: { p_name: string }; Returns: boolean }
      coupon_is_live: {
        Args: {
          p_business_id: string
          p_expires_at: string
          p_starts_at: string
          p_status: Database["public"]["Enums"]["coupon_status"]
        }
        Returns: boolean
      }
      create_redemption_token: { Args: { p_coupon_id: string }; Returns: Json }
      has_business_role: {
        Args: {
          p_business_id: string
          p_roles?: Database["public"]["Enums"]["member_role"][]
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_privileged: { Args: never; Returns: boolean }
      lat: {
        Args: { "": Database["public"]["Tables"]["locations"]["Row"] }
        Returns: {
          error: true
        } & "the function public.lat with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      lng: {
        Args: { "": Database["public"]["Tables"]["locations"]["Row"] }
        Returns: {
          error: true
        } & "the function public.lng with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      my_redemption_token: {
        Args: { p_token_id: string }
        Returns: {
          business_name: string
          business_timezone: string
          coupon_expires_at: string
          coupon_id: string
          description: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          expires_at: string
          included_products: string
          limits_text: string
          max_people: number
          min_qty: number
          min_spend: number
          only_store: string
          per_user_limit: number
          redeemed_at: string
          redeemed_store: string
          short_code: string
          stock_tint: Database["public"]["Enums"]["stock_tint"]
          store_count: number
          title: string
          token: string
          token_id: string
          used_at: string
        }[]
      }
      my_redemptions: {
        Args: never
        Returns: {
          business_name: string
          business_timezone: string
          coupon_id: string
          coupon_is_live: boolean
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          method: Database["public"]["Enums"]["redemption_method"]
          redeemed_at: string
          redemption_id: string
          stock_tint: Database["public"]["Enums"]["stock_tint"]
          store_city: string
          store_name: string
          store_number: string
          title: string
        }[]
      }
      my_saved_coupons: {
        Args: never
        Returns: {
          business_name: string
          business_timezone: string
          coupon_id: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          expires_at: string
          is_live: boolean
          saved_at: string
          stock_tint: Database["public"]["Enums"]["stock_tint"]
          title: string
        }[]
      }
      preview_redemption: {
        Args: { p_location_id: string; p_token_or_code: string }
        Returns: Json
      }
      redemption_offer: {
        Args: { p_coupon: Database["public"]["Tables"]["coupons"]["Row"] }
        Returns: Json
      }
      redemption_problem: {
        Args: {
          p_coupon: Database["public"]["Tables"]["coupons"]["Row"]
          p_location: Database["public"]["Tables"]["locations"]["Row"]
          p_token: Database["public"]["Tables"]["redemption_tokens"]["Row"]
        }
        Returns: string
      }
      resolve_redemption_input: {
        Args: { p_business_id: string; p_input: string }
        Returns: Record<string, unknown>
      }
      search_live_coupons: {
        Args: {
          p_category?: string
          p_discount_type?: Database["public"]["Enums"]["discount_type"]
          p_ending_within_days?: number
          p_featured_only?: boolean
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_offset?: number
          p_place?: string
          p_query?: string
          p_radius_m?: number
          p_sort?: string
        }
        Returns: {
          business_id: string
          business_name: string
          business_timezone: string
          category_name: string
          category_slug: string
          created_at: string
          description: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          distance_m: number
          expires_at: string
          featured: boolean
          id: string
          included_products: string
          limits_text: string
          max_people: number
          min_qty: number
          min_spend: number
          nearest_store: string
          per_user_limit: number
          shop_label: string
          starts_at: string
          stock_tint: Database["public"]["Enums"]["stock_tint"]
          store_count: number
          title: string
          total_count: number
        }[]
      }
      staff_invite_details: {
        Args: { p_token: string }
        Returns: {
          accepted: boolean
          business_name: string
          expired: boolean
          masked_email: string
        }[]
      }
      verify_redemption: {
        Args: { p_location_id: string; p_token_or_code: string }
        Returns: Json
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      business_status: "draft" | "active" | "suspended"
      coupon_status: "draft" | "published" | "paused"
      discount_type: "percent" | "amount"
      member_role: "owner" | "manager" | "staff"
      redemption_method: "qr" | "code"
      stock_tint: "mint" | "pink" | "sky" | "butter"
      subscription_source: "stripe" | "complimentary"
      subscription_status: "active" | "past_due" | "canceled" | "expired"
      user_role: "consumer" | "merchant" | "admin"
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
      account_status: ["active", "suspended"],
      business_status: ["draft", "active", "suspended"],
      coupon_status: ["draft", "published", "paused"],
      discount_type: ["percent", "amount"],
      member_role: ["owner", "manager", "staff"],
      redemption_method: ["qr", "code"],
      stock_tint: ["mint", "pink", "sky", "butter"],
      subscription_source: ["stripe", "complimentary"],
      subscription_status: ["active", "past_due", "canceled", "expired"],
      user_role: ["consumer", "merchant", "admin"],
    },
  },
} as const
