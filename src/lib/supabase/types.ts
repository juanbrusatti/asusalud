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
      agenda_blocks: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          reason: string | null
          staff_id: string | null
          starts_at: string
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          reason?: string | null
          staff_id?: string | null
          starts_at: string
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          reason?: string | null
          staff_id?: string | null
          starts_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_blocks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_blocks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_services: {
        Row: {
          appointment_id: string
          buffer_minutes: number
          duration_minutes: number
          id: string
          position: number
          price_cents: number | null
          service_id: string
          tenant_id: string
        }
        Insert: {
          appointment_id: string
          buffer_minutes?: number
          duration_minutes: number
          id?: string
          position?: number
          price_cents?: number | null
          service_id: string
          tenant_id: string
        }
        Update: {
          appointment_id?: string
          buffer_minutes?: number
          duration_minutes?: number
          id?: string
          position?: number
          price_cents?: number | null
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_status_history: {
        Row: {
          appointment_id: string
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["appointment_status"] | null
          id: string
          reason: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          appointment_id: string
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["appointment_status"] | null
          id?: string
          reason?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          appointment_id?: string
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["appointment_status"] | null
          id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_status_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          blocks_until: string
          branch_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          price_cents: number
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          blocks_until: string
          branch_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          price_cents?: number
          source?: Database["public"]["Enums"]["appointment_source"]
          staff_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          blocks_until?: string
          branch_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          price_cents?: number
          source?: Database["public"]["Enums"]["appointment_source"]
          staff_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          phone: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          phone?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          phone?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_id: string | null
          body: string
          client_id: string
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          client_id: string
          created_at?: string
          id?: string
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tag_assignments: {
        Row: {
          client_id: string
          created_at: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tag_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "client_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tag_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          alert: string | null
          birthdate: string | null
          channel_decided_at: string | null
          channel_decided_by: string | null
          channel_mode: Database["public"]["Enums"]["channel_mode"]
          created_at: string
          document_id: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string | null
          legacy_last_visit_on: string | null
          legacy_source: string | null
          legacy_total_cents: number | null
          legacy_visits_count: number | null
          phone_e164: string | null
          phone_raw: string | null
          search_text: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alert?: string | null
          birthdate?: string | null
          channel_decided_at?: string | null
          channel_decided_by?: string | null
          channel_mode?: Database["public"]["Enums"]["channel_mode"]
          created_at?: string
          document_id?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          legacy_last_visit_on?: string | null
          legacy_source?: string | null
          legacy_total_cents?: number | null
          legacy_visits_count?: number | null
          phone_e164?: string | null
          phone_raw?: string | null
          search_text?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alert?: string | null
          birthdate?: string | null
          channel_decided_at?: string | null
          channel_decided_by?: string | null
          channel_mode?: Database["public"]["Enums"]["channel_mode"]
          created_at?: string
          document_id?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          legacy_last_visit_on?: string | null
          legacy_source?: string | null
          legacy_total_cents?: number | null
          legacy_visits_count?: number | null
          phone_e164?: string | null
          phone_raw?: string | null
          search_text?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_jobs: {
        Row: {
          appointment_id: string | null
          attempts: number
          channel: Database["public"]["Enums"]["message_channel"] | null
          client_id: string
          cost_cents: number
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          id: string
          last_error: string | null
          provider_message_id: string | null
          read_at: string | null
          rendered_body: string | null
          rendered_subject: string | null
          rule_id: string | null
          scheduled_for: string
          sent_at: string | null
          skip_reason: string | null
          status: Database["public"]["Enums"]["job_status"]
          template_id: string | null
          tenant_id: string
          updated_at: string
          was_test: boolean
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          channel?: Database["public"]["Enums"]["message_channel"] | null
          client_id: string
          cost_cents?: number
          created_at?: string
          dedupe_key: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          rendered_body?: string | null
          rendered_subject?: string | null
          rule_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          skip_reason?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template_id?: string | null
          tenant_id: string
          updated_at?: string
          was_test?: boolean
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          channel?: Database["public"]["Enums"]["message_channel"] | null
          client_id?: string
          cost_cents?: number
          created_at?: string
          dedupe_key?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          rendered_body?: string | null
          rendered_subject?: string | null
          rule_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          skip_reason?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          template_id?: string | null
          tenant_id?: string
          updated_at?: string
          was_test?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "message_jobs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reminder_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          category: Database["public"]["Enums"]["message_category"]
          channel: Database["public"]["Enums"]["message_channel"]
          created_at: string
          id: string
          is_active: boolean
          name: string
          provider_language: string | null
          provider_name: string | null
          provider_status: string
          quick_replies: string[]
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: Database["public"]["Enums"]["message_category"]
          channel: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          provider_language?: string | null
          provider_name?: string | null
          provider_status?: string
          quick_replies?: string[]
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: Database["public"]["Enums"]["message_category"]
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          provider_language?: string | null
          provider_name?: string | null
          provider_status?: string
          quick_replies?: string[]
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_settings: {
        Row: {
          created_at: string
          max_per_client_per_day: number
          max_per_client_per_week: number
          monthly_budget_cents: number | null
          paused_reason: string | null
          quiet_end: string
          quiet_start: string
          sending_enabled: boolean
          tenant_id: string
          test_mode: boolean
          updated_at: string
          whatsapp_marketing_cents: number
          whatsapp_utility_cents: number
        }
        Insert: {
          created_at?: string
          max_per_client_per_day?: number
          max_per_client_per_week?: number
          monthly_budget_cents?: number | null
          paused_reason?: string | null
          quiet_end?: string
          quiet_start?: string
          sending_enabled?: boolean
          tenant_id: string
          test_mode?: boolean
          updated_at?: string
          whatsapp_marketing_cents?: number
          whatsapp_utility_cents?: number
        }
        Update: {
          created_at?: string
          max_per_client_per_day?: number
          max_per_client_per_week?: number
          monthly_budget_cents?: number | null
          paused_reason?: string | null
          quiet_end?: string
          quiet_start?: string
          sending_enabled?: boolean
          tenant_id?: string
          test_mode?: boolean
          updated_at?: string
          whatsapp_marketing_cents?: number
          whatsapp_utility_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "messaging_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opt_outs: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"] | null
          client_id: string
          created_at: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["message_channel"] | null
          client_id: string
          created_at?: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"] | null
          client_id?: string
          created_at?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opt_outs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opt_outs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          client_id: string | null
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          auth: string
          client_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          auth?: string
          client_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_rules: {
        Row: {
          channel_order: Database["public"]["Enums"]["message_channel"][]
          created_at: string
          enabled: boolean
          id: string
          name: string
          offset_minutes: number
          only_if_missed: boolean
          send_window_end: string | null
          send_window_start: string | null
          service_ids: string[]
          statuses: Database["public"]["Enums"]["appointment_status"][]
          tenant_id: string
          trigger: Database["public"]["Enums"]["reminder_trigger"]
          updated_at: string
        }
        Insert: {
          channel_order?: Database["public"]["Enums"]["message_channel"][]
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          offset_minutes: number
          only_if_missed?: boolean
          send_window_end?: string | null
          send_window_start?: string | null
          service_ids?: string[]
          statuses?: Database["public"]["Enums"]["appointment_status"][]
          tenant_id: string
          trigger: Database["public"]["Enums"]["reminder_trigger"]
          updated_at?: string
        }
        Update: {
          channel_order?: Database["public"]["Enums"]["message_channel"][]
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          offset_minutes?: number
          only_if_missed?: boolean
          send_window_end?: string | null
          send_window_start?: string | null
          service_ids?: string[]
          statuses?: Database["public"]["Enums"]["appointment_status"][]
          tenant_id?: string
          trigger?: Database["public"]["Enums"]["reminder_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_templates: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"]
          rule_id: string
          template_id: string
          tenant_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["message_channel"]
          rule_id: string
          template_id: string
          tenant_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"]
          rule_id?: string
          template_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_templates_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reminder_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_price_history: {
        Row: {
          changed_by: string | null
          id: string
          price_cents: number | null
          price_mode: Database["public"]["Enums"]["price_mode"]
          service_id: string
          tenant_id: string
          valid_from: string
        }
        Insert: {
          changed_by?: string | null
          id?: string
          price_cents?: number | null
          price_mode: Database["public"]["Enums"]["price_mode"]
          service_id: string
          tenant_id: string
          valid_from?: string
        }
        Update: {
          changed_by?: string | null
          id?: string
          price_cents?: number | null
          price_mode?: Database["public"]["Enums"]["price_mode"]
          service_id?: string
          tenant_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_price_history_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_minutes: number
          capacity: number
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_bookable_online: boolean
          name: string
          price_cents: number | null
          price_mode: Database["public"]["Enums"]["price_mode"]
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          capacity?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_bookable_online?: boolean
          name: string
          price_cents?: number | null
          price_mode?: Database["public"]["Enums"]["price_mode"]
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          capacity?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_bookable_online?: boolean
          name?: string
          price_cents?: number | null
          price_mode?: Database["public"]["Enums"]["price_mode"]
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          currency: string
          id: string
          locale: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          locale?: string
          name: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          locale?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_accounts: {
        Row: {
          access_token: string
          app_secret: string | null
          created_at: string
          display_phone: string | null
          last_checked_at: string | null
          messaging_limit: string | null
          phone_number_id: string
          quality_rating: string | null
          status: string
          tenant_id: string
          updated_at: string
          verify_token: string | null
          waba_id: string | null
        }
        Insert: {
          access_token: string
          app_secret?: string | null
          created_at?: string
          display_phone?: string | null
          last_checked_at?: string | null
          messaging_limit?: string | null
          phone_number_id: string
          quality_rating?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
        }
        Update: {
          access_token?: string
          app_secret?: string | null
          created_at?: string
          display_phone?: string | null
          last_checked_at?: string | null
          messaging_limit?: string | null
          phone_number_id?: string
          quality_rating?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbound: {
        Row: {
          action_taken: string | null
          body: string | null
          client_id: string | null
          from_phone: string
          id: string
          kind: string
          payload: string | null
          received_at: string
          tenant_id: string
          wa_message_id: string
        }
        Insert: {
          action_taken?: string | null
          body?: string | null
          client_id?: string | null
          from_phone: string
          id?: string
          kind: string
          payload?: string | null
          received_at?: string
          tenant_id: string
          wa_message_id: string
        }
        Update: {
          action_taken?: string | null
          body?: string | null
          client_id?: string | null
          from_phone?: string
          id?: string
          kind?: string
          payload?: string | null
          received_at?: string
          tenant_id?: string
          wa_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbound_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      whatsapp_status: {
        Row: {
          display_phone: string | null
          has_token: boolean | null
          last_checked_at: string | null
          messaging_limit: string | null
          quality_rating: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          display_phone?: string | null
          has_token?: never
          last_checked_at?: string | null
          messaging_limit?: string | null
          quality_rating?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          display_phone?: string | null
          has_token?: never
          last_checked_at?: string | null
          messaging_limit?: string | null
          quality_rating?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      book_appointment: {
        Args: {
          p_client: string
          p_notes?: string
          p_service_ids: string[]
          p_starts_at: string
        }
        Returns: string
      }
      count_phone_duplicates: { Args: { p_client: string }; Returns: number }
      create_tenant: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          created_at: string
          currency: string
          id: string
          locale: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_claim_due_jobs: {
        Args: { p_limit?: number }
        Returns: {
          appointment_id: string | null
          attempts: number
          channel: Database["public"]["Enums"]["message_channel"] | null
          client_id: string
          cost_cents: number
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          id: string
          last_error: string | null
          provider_message_id: string | null
          read_at: string | null
          rendered_body: string | null
          rendered_subject: string | null
          rule_id: string | null
          scheduled_for: string
          sent_at: string | null
          skip_reason: string | null
          status: Database["public"]["Enums"]["job_status"]
          template_id: string | null
          tenant_id: string
          updated_at: string
          was_test: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "message_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_finish_job: {
        Args: {
          p_body?: string
          p_error?: string
          p_id: string
          p_ok: boolean
          p_permanent?: boolean
          p_provider_id?: string
          p_subject?: string
          p_was_test?: boolean
        }
        Returns: undefined
      }
      rpc_handle_inbound: {
        Args: {
          p_body?: string
          p_from: string
          p_kind: string
          p_payload?: string
          p_phone_number_id: string
          p_wa_message_id: string
        }
        Returns: string
      }
      rpc_jobs_payload: {
        Args: { p_ids: string[] }
        Returns: {
          access_token: string
          appointment_at: string
          appointment_id: string
          channel: Database["public"]["Enums"]["message_channel"]
          client_email: string
          client_name: string
          client_phone: string
          job_id: string
          phone_number_id: string
          provider_language: string
          provider_name: string
          quick_replies: string[]
          service_names: string
          template_body: string
          template_subject: string
          tenant_id: string
          tenant_name: string
          tenant_timezone: string
          test_mode: boolean
        }[]
      }
      rpc_record_account_health: {
        Args: {
          p_limit?: string
          p_phone_number_id: string
          p_quality?: string
          p_status?: string
        }
        Returns: undefined
      }
      rpc_record_delivery: {
        Args: { p_error?: string; p_provider_id: string; p_status: string }
        Returns: undefined
      }
      rpc_webhook_secrets: {
        Args: { p_phone_number_id: string }
        Returns: {
          app_secret: string
          tenant_id: string
          verify_token: string
        }[]
      }
      simulate_rule: {
        Args: {
          p_channel_order: Database["public"]["Enums"]["message_channel"][]
          p_days_ahead?: number
          p_offset_minutes: number
          p_only_if_missed?: boolean
          p_service_ids?: string[]
          p_statuses?: Database["public"]["Enums"]["appointment_status"][]
          p_trigger: Database["public"]["Enums"]["reminder_trigger"]
        }
        Returns: {
          channel: Database["public"]["Enums"]["message_channel"]
          cost_cents: number
          recipients: number
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "staff" | "reception"
      appointment_source: "staff" | "online" | "import"
      appointment_status:
        | "pending"
        | "confirmed"
        | "attended"
        | "no_show"
        | "cancelled"
      channel_mode: "auto" | "email" | "whatsapp" | "none"
      job_status:
        | "pending"
        | "sending"
        | "sent"
        | "failed"
        | "skipped"
        | "cancelled"
      membership_status: "active" | "invited" | "suspended"
      message_category: "utility" | "marketing"
      message_channel: "push" | "email" | "whatsapp"
      price_mode: "fixed" | "on_request"
      reminder_trigger:
        | "before_appointment"
        | "after_appointment"
        | "birthday"
        | "no_activity"
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
      app_role: ["owner", "admin", "staff", "reception"],
      appointment_source: ["staff", "online", "import"],
      appointment_status: [
        "pending",
        "confirmed",
        "attended",
        "no_show",
        "cancelled",
      ],
      channel_mode: ["auto", "email", "whatsapp", "none"],
      job_status: [
        "pending",
        "sending",
        "sent",
        "failed",
        "skipped",
        "cancelled",
      ],
      membership_status: ["active", "invited", "suspended"],
      message_category: ["utility", "marketing"],
      message_channel: ["push", "email", "whatsapp"],
      price_mode: ["fixed", "on_request"],
      reminder_trigger: [
        "before_appointment",
        "after_appointment",
        "birthday",
        "no_activity",
      ],
    },
  },
} as const

