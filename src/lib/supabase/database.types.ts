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
      anet_events: {
        Row: {
          event_type: string
          id: string
          received_at: string
        }
        Insert: {
          event_type: string
          id: string
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          received_at?: string
        }
        Relationships: []
      }
      auth_code_requests: {
        Row: {
          created_at: string
          email_hash: string
          id: number
          ip_hash: string | null
          kind: string
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: never
          ip_hash?: string | null
          kind: string
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: never
          ip_hash?: string | null
          kind?: string
        }
        Relationships: []
      }
      business_limit_overrides: {
        Row: {
          business_id: string
          campaigns_per_month: number | null
          created_at: string
          max_locations: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          campaigns_per_month?: number | null
          created_at?: string
          max_locations?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          campaigns_per_month?: number | null
          created_at?: string
          max_locations?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_limit_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_limit_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          owner_id: string | null
          pioneer_welcome_seen_at: string | null
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
          owner_id?: string | null
          pioneer_welcome_seen_at?: string | null
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
          owner_id?: string | null
          pioneer_welcome_seen_at?: string | null
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
          description: string | null
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
          description?: string | null
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
          description?: string | null
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
      checkouts: {
        Row: {
          amount_cents: number
          anet_trans_id: string | null
          billing_cycle: string
          business_id: string
          created_at: string
          created_by: string | null
          hold_expires_at: string | null
          holds_seat: boolean
          id: string
          invoice_number: string
          offer_code: string
          outcome: string | null
          resolved_at: string | null
          resolving_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          anet_trans_id?: string | null
          billing_cycle: string
          business_id: string
          created_at?: string
          created_by?: string | null
          hold_expires_at?: string | null
          holds_seat?: boolean
          id?: string
          invoice_number: string
          offer_code: string
          outcome?: string | null
          resolved_at?: string | null
          resolving_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          anet_trans_id?: string | null
          billing_cycle?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          hold_expires_at?: string | null
          holds_seat?: boolean
          id?: string
          invoice_number?: string
          offer_code?: string
          outcome?: string | null
          resolved_at?: string | null
          resolving_until?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkouts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkouts_offer_code_fkey"
            columns: ["offer_code"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
        ]
      }
      coupon_campaigns: {
        Row: {
          business_id: string
          counted_at: string
          coupon_id: string | null
          id: string
          month: string
        }
        Insert: {
          business_id: string
          counted_at?: string
          coupon_id?: string | null
          id?: string
          month: string
        }
        Update: {
          business_id?: string
          counted_at?: string
          coupon_id?: string | null
          id?: string
          month?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_campaigns_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: true
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_campaigns_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: true
            referencedRelation: "live_coupons"
            referencedColumns: ["id"]
          },
        ]
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
          admin_hold: boolean
          all_locations: boolean
          business_id: string
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number | null
          exclusions: string | null
          expires_at: string
          featured: boolean
          held_at: string | null
          held_by: string | null
          hold_reason: string | null
          id: string
          image_path: string | null
          included_products: string | null
          limits_text: string | null
          max_people: number | null
          min_qty: number | null
          min_spend: number | null
          per_user_limit: number | null
          redeem_frequency: string | null
          schedule_days: number[] | null
          schedule_end: string | null
          schedule_start: string | null
          starts_at: string
          status: Database["public"]["Enums"]["coupon_status"]
          title: string
          total_limit: number | null
          updated_at: string
        }
        Insert: {
          admin_hold?: boolean
          all_locations?: boolean
          business_id: string
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value?: number | null
          exclusions?: string | null
          expires_at: string
          featured?: boolean
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number | null
          redeem_frequency?: string | null
          schedule_days?: number[] | null
          schedule_end?: string | null
          schedule_start?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["coupon_status"]
          title: string
          total_limit?: number | null
          updated_at?: string
        }
        Update: {
          admin_hold?: boolean
          all_locations?: boolean
          business_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number | null
          exclusions?: string | null
          expires_at?: string
          featured?: boolean
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number | null
          redeem_frequency?: string | null
          schedule_days?: number[] | null
          schedule_end?: string | null
          schedule_start?: string | null
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
          {
            foreignKeyName: "coupons_held_by_fkey"
            columns: ["held_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notices: {
        Row: {
          kind: string
          ref: string
          sent_at: string
        }
        Insert: {
          kind: string
          ref: string
          sent_at?: string
        }
        Update: {
          kind?: string
          ref?: string
          sent_at?: string
        }
        Relationships: []
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
          country: string | null
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
          country?: string | null
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
          country?: string | null
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
      offer_seat_claims: {
        Row: {
          business_id: string
          claimed_at: string
          claimed_by: string | null
          coupon_id: string | null
          free: boolean
          id: string
          offer_code: string
          seat_number: number
        }
        Insert: {
          business_id: string
          claimed_at?: string
          claimed_by?: string | null
          coupon_id?: string | null
          free: boolean
          id?: string
          offer_code: string
          seat_number: number
        }
        Update: {
          business_id?: string
          claimed_at?: string
          claimed_by?: string | null
          coupon_id?: string | null
          free?: boolean
          id?: string
          offer_code?: string
          seat_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_seat_claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_seat_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_seat_claims_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_seat_claims_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "live_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_seat_claims_offer_code_fkey"
            columns: ["offer_code"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
        ]
      }
      offers: {
        Row: {
          active: boolean
          admin_only: boolean
          annual_price_cents: number
          campaigns_per_month: number | null
          code: string
          created_at: string
          free_seats: number
          max_live_coupons: number | null
          max_locations: number | null
          monthly_price_cents: number | null
          name: string
          renews_into: string | null
          seat_cap: number | null
          sort_order: number
          term_months: number | null
          updated_at: string
          window_ends_at: string | null
          window_starts_at: string | null
        }
        Insert: {
          active?: boolean
          admin_only?: boolean
          annual_price_cents: number
          campaigns_per_month?: number | null
          code: string
          created_at?: string
          free_seats?: number
          max_live_coupons?: number | null
          max_locations?: number | null
          monthly_price_cents?: number | null
          name: string
          renews_into?: string | null
          seat_cap?: number | null
          sort_order?: number
          term_months?: number | null
          updated_at?: string
          window_ends_at?: string | null
          window_starts_at?: string | null
        }
        Update: {
          active?: boolean
          admin_only?: boolean
          annual_price_cents?: number
          campaigns_per_month?: number | null
          code?: string
          created_at?: string
          free_seats?: number
          max_live_coupons?: number | null
          max_locations?: number | null
          monthly_price_cents?: number | null
          name?: string
          renews_into?: string | null
          seat_cap?: number | null
          sort_order?: number
          term_months?: number | null
          updated_at?: string
          window_ends_at?: string | null
          window_starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_renews_into_fkey"
            columns: ["renews_into"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          anet_trans_id: string | null
          billing_cycle: string | null
          business_id: string
          card_last4: string | null
          checkout_id: string | null
          created_at: string
          id: string
          kind: string
          offer_code: string | null
          period_end: string | null
          period_start: string | null
          renewal_attempt_id: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          anet_trans_id?: string | null
          billing_cycle?: string | null
          business_id: string
          card_last4?: string | null
          checkout_id?: string | null
          created_at?: string
          id?: string
          kind: string
          offer_code?: string | null
          period_end?: string | null
          period_start?: string | null
          renewal_attempt_id?: string | null
          status: string
        }
        Update: {
          amount_cents?: number
          anet_trans_id?: string | null
          billing_cycle?: string | null
          business_id?: string
          card_last4?: string | null
          checkout_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          offer_code?: string | null
          period_end?: string | null
          period_start?: string | null
          renewal_attempt_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offer_code_fkey"
            columns: ["offer_code"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_renewal_attempt_id_fkey"
            columns: ["renewal_attempt_id"]
            isOneToOne: false
            referencedRelation: "renewal_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          consumer_login: string
          contact_response_time: string
          coupon_moderation: string
          created_at: string
          enterprise_contact_email: string
          founders_full_early_access: boolean
          founders_rule: string
          id: string
          payments_open: boolean
          plans: string
          publishing_opens_at: string
          redemption_method: string
          region_restriction: string | null
          renewals_enabled: boolean
          singleton: boolean
          subscription_expiry: string
          updated_at: string
        }
        Insert: {
          consumer_login?: string
          contact_response_time?: string
          coupon_moderation?: string
          created_at?: string
          enterprise_contact_email?: string
          founders_full_early_access?: boolean
          founders_rule?: string
          id?: string
          payments_open?: boolean
          plans?: string
          publishing_opens_at?: string
          redemption_method?: string
          region_restriction?: string | null
          renewals_enabled?: boolean
          singleton?: boolean
          subscription_expiry?: string
          updated_at?: string
        }
        Update: {
          consumer_login?: string
          contact_response_time?: string
          coupon_moderation?: string
          created_at?: string
          enterprise_contact_email?: string
          founders_full_early_access?: boolean
          founders_rule?: string
          id?: string
          payments_open?: boolean
          plans?: string
          publishing_opens_at?: string
          redemption_method?: string
          region_restriction?: string | null
          renewals_enabled?: boolean
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
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
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
      renewal_attempts: {
        Row: {
          amount_cents: number
          anet_trans_id: string | null
          attempt_day: number
          billing_cycle: string
          business_id: string
          created_at: string
          id: string
          invoice_number: string
          offer_code: string
          period_end: string
          resolved_at: string | null
          response_text: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          anet_trans_id?: string | null
          attempt_day: number
          billing_cycle: string
          business_id: string
          created_at?: string
          id?: string
          invoice_number: string
          offer_code: string
          period_end: string
          resolved_at?: string | null
          response_text?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          anet_trans_id?: string | null
          attempt_day?: number
          billing_cycle?: string
          business_id?: string
          created_at?: string
          id?: string
          invoice_number?: string
          offer_code?: string
          period_end?: string
          resolved_at?: string | null
          response_text?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_attempts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_attempts_offer_code_fkey"
            columns: ["offer_code"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
        ]
      }
      renewal_consents: {
        Row: {
          agreed_at: string
          billing_cycle: string
          business_id: string
          checkout_id: string | null
          context: string
          created_at: string
          id: string
          offer_code: string
          user_id: string | null
          wording: string
        }
        Insert: {
          agreed_at?: string
          billing_cycle: string
          business_id: string
          checkout_id?: string | null
          context: string
          created_at?: string
          id?: string
          offer_code: string
          user_id?: string | null
          wording: string
        }
        Update: {
          agreed_at?: string
          billing_cycle?: string
          business_id?: string
          checkout_id?: string | null
          context?: string
          created_at?: string
          id?: string
          offer_code?: string
          user_id?: string | null
          wording?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_consents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_consents_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_consents_offer_code_fkey"
            columns: ["offer_code"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "renewal_consents_user_id_fkey"
            columns: ["user_id"]
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
          anet_customer_profile_id: string | null
          anet_payment_profile_id: string | null
          billing_cycle: string | null
          business_id: string
          cancel_at_period_end: boolean
          card_last4: string | null
          card_updated_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          offer_code: string | null
          past_due_since: string | null
          source: Database["public"]["Enums"]["subscription_source"]
          status: Database["public"]["Enums"]["subscription_status"]
          term_ends_at: string | null
          updated_at: string
        }
        Insert: {
          anet_customer_profile_id?: string | null
          anet_payment_profile_id?: string | null
          billing_cycle?: string | null
          business_id: string
          cancel_at_period_end?: boolean
          card_last4?: string | null
          card_updated_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          offer_code?: string | null
          past_due_since?: string | null
          source: Database["public"]["Enums"]["subscription_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          term_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          anet_customer_profile_id?: string | null
          anet_payment_profile_id?: string | null
          billing_cycle?: string | null
          business_id?: string
          cancel_at_period_end?: boolean
          card_last4?: string | null
          card_updated_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          offer_code?: string | null
          past_due_since?: string | null
          source?: Database["public"]["Enums"]["subscription_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          term_ends_at?: string | null
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
          {
            foreignKeyName: "subscriptions_offer_code_fkey"
            columns: ["offer_code"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      live_coupons: {
        Row: {
          admin_hold: boolean | null
          all_locations: boolean | null
          business_id: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number | null
          exclusions: string | null
          expires_at: string | null
          featured: boolean | null
          held_at: string | null
          held_by: string | null
          hold_reason: string | null
          id: string | null
          image_path: string | null
          included_products: string | null
          limits_text: string | null
          max_people: number | null
          min_qty: number | null
          min_spend: number | null
          per_user_limit: number | null
          redeem_frequency: string | null
          schedule_days: number[] | null
          schedule_end: string | null
          schedule_start: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["coupon_status"] | null
          title: string | null
          total_limit: number | null
          updated_at: string | null
        }
        Insert: {
          admin_hold?: boolean | null
          all_locations?: boolean | null
          business_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          exclusions?: string | null
          expires_at?: string | null
          featured?: boolean | null
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string | null
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number | null
          redeem_frequency?: string | null
          schedule_days?: number[] | null
          schedule_end?: string | null
          schedule_start?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"] | null
          title?: string | null
          total_limit?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_hold?: boolean | null
          all_locations?: boolean | null
          business_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          exclusions?: string | null
          expires_at?: string | null
          featured?: boolean | null
          held_at?: string | null
          held_by?: string | null
          hold_reason?: string | null
          id?: string | null
          image_path?: string | null
          included_products?: string | null
          limits_text?: string | null
          max_people?: number | null
          min_qty?: number | null
          min_spend?: number | null
          per_user_limit?: number | null
          redeem_frequency?: string | null
          schedule_days?: number[] | null
          schedule_end?: string | null
          schedule_start?: string | null
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
          {
            foreignKeyName: "coupons_held_by_fkey"
            columns: ["held_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_staff_invite: { Args: { p_token: string }; Returns: Json }
      account_role_for_email: {
        Args: { p_email: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
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
      apply_renewal: {
        Args: { p_attempt_id: string; p_last4?: string; p_trans_id: string }
        Returns: Json
      }
      begin_paid_checkout: {
        Args: {
          p_amount_cents: number
          p_business_id: string
          p_created_by: string
          p_cycle: string
          p_hold_minutes?: number
          p_invoice: string
          p_offer_code: string
        }
        Returns: Json
      }
      business_effective_limits: {
        Args: { p_business_id: string }
        Returns: Record<string, unknown>
      }
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
      business_usage: { Args: { p_business_id: string }; Returns: Json }
      campaign_month: {
        Args: { p_at?: string; p_timezone: string }
        Returns: string
      }
      can_manage_business: { Args: { p_business_id: string }; Returns: boolean }
      can_manage_business_path: { Args: { p_name: string }; Returns: boolean }
      checkout_finish: {
        Args: {
          p_checkout_id: string
          p_customer_profile?: string
          p_last4?: string
          p_note?: string
          p_outcome: string
          p_payment_profile?: string
        }
        Returns: Json
      }
      checkout_start_resolving: {
        Args: { p_checkout_id: string; p_trans_id: string }
        Returns: Json
      }
      claim_founding_seat: {
        Args: { p_business_id: string; p_coupon_id?: string }
        Returns: Json
      }
      coupon_is_live:
        | {
            Args: {
              p_business_id: string
              p_expires_at: string
              p_starts_at: string
              p_status: Database["public"]["Enums"]["coupon_status"]
            }
            Returns: boolean
          }
        | {
            Args: {
              p_admin_hold: boolean
              p_business_id: string
              p_expires_at: string
              p_starts_at: string
              p_status: Database["public"]["Enums"]["coupon_status"]
            }
            Returns: boolean
          }
      coupon_rule_problem: {
        Args: {
          p_coupon: Database["public"]["Tables"]["coupons"]["Row"]
          p_user_id: string
        }
        Returns: string
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
      my_token_offer: { Args: { p_token_id: string }; Returns: Json }
      offer_overview: {
        Args: never
        Returns: {
          active: boolean
          annual_price_cents: number
          campaigns_per_month: number
          code: string
          free_seats: number
          free_seats_used: number
          max_live_coupons: number
          max_locations: number
          monthly_price_cents: number
          name: string
          renews_into: string
          seat_cap: number
          seats_used: number
          sort_order: number
          term_months: number
          window_ends_at: string
          window_starts_at: string
        }[]
      }
      offer_seats_in_use: {
        Args: { p_except_checkout?: string; p_offer_code: string }
        Returns: number
      }
      plan_is_current: {
        Args: {
          p_past_due_since: string
          p_period_end: string
          p_source: Database["public"]["Enums"]["subscription_source"]
          p_status: Database["public"]["Enums"]["subscription_status"]
        }
        Returns: boolean
      }
      preview_redemption: {
        Args: { p_location_id: string; p_token_or_code: string }
        Returns: Json
      }
      purge_stale_codes: { Args: never; Returns: undefined }
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
      register_auth_code_request: {
        Args: { p_email_hash: string; p_ip_hash: string; p_kind: string }
        Returns: string
      }
      resolve_redemption_input: {
        Args: { p_business_id: string; p_input: string }
        Returns: Record<string, unknown>
      }
      search_live_coupons: {
        Args: {
          p_available_now?: boolean
          p_business?: string
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
      discount_type: "percent" | "amount" | "fixed_price" | "free"
      member_role: "owner" | "manager" | "staff"
      redemption_method: "qr" | "code"
      stock_tint: "mint" | "pink" | "sky" | "butter"
      subscription_source: "complimentary" | "authorize_net"
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
      discount_type: ["percent", "amount", "fixed_price", "free"],
      member_role: ["owner", "manager", "staff"],
      redemption_method: ["qr", "code"],
      stock_tint: ["mint", "pink", "sky", "butter"],
      subscription_source: ["complimentary", "authorize_net"],
      subscription_status: ["active", "past_due", "canceled", "expired"],
      user_role: ["consumer", "merchant", "admin"],
    },
  },
} as const
