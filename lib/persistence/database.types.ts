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
      agent_runs: {
        Row: {
          agent: Database["public"]["Enums"]["agent_kind"]
          attempt: number
          created_at: string
          error: Json | null
          finished_at: string | null
          id: string
          input_hash: string | null
          model: string | null
          organization_id: string
          output: Json | null
          prompt_version: string | null
          provider: string | null
          site_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          updated_at: string
          workflow_run_id: string
        }
        Insert: {
          agent: Database["public"]["Enums"]["agent_kind"]
          attempt?: number
          created_at?: string
          error?: Json | null
          finished_at?: string | null
          id?: string
          input_hash?: string | null
          model?: string | null
          organization_id: string
          output?: Json | null
          prompt_version?: string | null
          provider?: string | null
          site_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          updated_at?: string
          workflow_run_id: string
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_kind"]
          attempt?: number
          created_at?: string
          error?: Json | null
          finished_at?: string | null
          id?: string
          input_hash?: string | null
          model?: string | null
          organization_id?: string
          output?: Json | null
          prompt_version?: string | null
          provider?: string | null
          site_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          updated_at?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agent_runs_organization_id_workflow_run_id_fkey"
            columns: ["organization_id", "workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      candidate_sites: {
        Row: {
          address: string | null
          apn: string | null
          city: string | null
          country_code: string
          created_at: string
          geometry_geojson: Json | null
          id: string
          jurisdiction: string
          latitude: number | null
          longitude: number | null
          normalized_apn: string | null
          normalized_payload: Json
          organization_id: string
          parcel_acres: number | null
          postal_code: string | null
          region: string | null
          reported_capacity_units: number | null
          signals: Json
          status: Database["public"]["Enums"]["candidate_status"]
          thesis_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          apn?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          geometry_geojson?: Json | null
          id?: string
          jurisdiction: string
          latitude?: number | null
          longitude?: number | null
          normalized_apn?: string | null
          normalized_payload?: Json
          organization_id: string
          parcel_acres?: number | null
          postal_code?: string | null
          region?: string | null
          reported_capacity_units?: number | null
          signals?: Json
          status?: Database["public"]["Enums"]["candidate_status"]
          thesis_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          apn?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          geometry_geojson?: Json | null
          id?: string
          jurisdiction?: string
          latitude?: number | null
          longitude?: number | null
          normalized_apn?: string | null
          normalized_payload?: Json
          organization_id?: string
          parcel_acres?: number | null
          postal_code?: string | null
          region?: string | null
          reported_capacity_units?: number | null
          signals?: Json
          status?: Database["public"]["Enums"]["candidate_status"]
          thesis_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_sites_organization_id_thesis_id_fkey"
            columns: ["organization_id", "thesis_id"]
            isOneToOne: false
            referencedRelation: "development_theses"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      candidate_source_records: {
        Row: {
          candidate_site_id: string
          created_at: string
          match_confidence: number
          match_method: string
          organization_id: string
          source_record_id: string
        }
        Insert: {
          candidate_site_id: string
          created_at?: string
          match_confidence: number
          match_method: string
          organization_id: string
          source_record_id: string
        }
        Update: {
          candidate_site_id?: string
          created_at?: string
          match_confidence?: number
          match_method?: string
          organization_id?: string
          source_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_source_records_organization_id_candidate_site_id_fkey"
            columns: ["organization_id", "candidate_site_id"]
            isOneToOne: false
            referencedRelation: "candidate_sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "candidate_source_records_organization_id_source_record_id_fkey"
            columns: ["organization_id", "source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      data_sources: {
        Row: {
          adapter_key: string
          agency: string | null
          base_url: string | null
          configuration: Json
          created_at: string
          display_name: string
          enabled: boolean
          id: string
          jurisdiction: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          adapter_key: string
          agency?: string | null
          base_url?: string | null
          configuration?: Json
          created_at?: string
          display_name: string
          enabled?: boolean
          id?: string
          jurisdiction?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          adapter_key?: string
          agency?: string | null
          base_url?: string | null
          configuration?: Json
          created_at?: string
          display_name?: string
          enabled?: boolean
          id?: string
          jurisdiction?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      development_events: {
        Row: {
          confidence: number
          created_at: string
          description: string | null
          event_date: string | null
          event_kind: Database["public"]["Enums"]["event_kind"]
          event_type: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          id: string
          observed_at: string
          organization_id: string
          payload: Json
          primary_evidence_id: string | null
          site_id: string
          status: string | null
          title: string
        }
        Insert: {
          confidence: number
          created_at?: string
          description?: string | null
          event_date?: string | null
          event_kind: Database["public"]["Enums"]["event_kind"]
          event_type: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          id?: string
          observed_at: string
          organization_id: string
          payload?: Json
          primary_evidence_id?: string | null
          site_id: string
          status?: string | null
          title: string
        }
        Update: {
          confidence?: number
          created_at?: string
          description?: string | null
          event_date?: string | null
          event_kind?: Database["public"]["Enums"]["event_kind"]
          event_type?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          id?: string
          observed_at?: string
          organization_id?: string
          payload?: Json
          primary_evidence_id?: string | null
          site_id?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_events_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "development_events_organization_id_site_id_primary_evidenc_fkey"
            columns: ["organization_id", "site_id", "primary_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      development_theses: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          id: string
          market: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["thesis_status"]
          strategy: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          market: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["thesis_status"]
          strategy: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          market?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["thesis_status"]
          strategy?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "development_theses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_projections: {
        Row: {
          content_checksum: string
          created_at: string
          id: string
          organization_id: string
          payload: Json
          projection_kind: string
          scope_key: string
          source_cutoff_at: string
          status: string
          version_key: string
        }
        Insert: {
          content_checksum: string
          created_at?: string
          id?: string
          organization_id: string
          payload: Json
          projection_kind: string
          scope_key: string
          source_cutoff_at: string
          status: string
          version_key: string
        }
        Update: {
          content_checksum?: string
          created_at?: string
          id?: string
          organization_id?: string
          payload?: Json
          projection_kind?: string
          scope_key?: string
          source_cutoff_at?: string
          status?: string
          version_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_projections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_events: {
        Row: {
          action: string | null
          application_number: string | null
          created_at: string
          decision_body: string | null
          development_event_id: string
          entitlement_type: string | null
          organization_id: string
          site_id: string
        }
        Insert: {
          action?: string | null
          application_number?: string | null
          created_at?: string
          decision_body?: string | null
          development_event_id: string
          entitlement_type?: string | null
          organization_id: string
          site_id: string
        }
        Update: {
          action?: string | null
          application_number?: string | null
          created_at?: string
          decision_body?: string | null
          development_event_id?: string
          entitlement_type?: string | null
          organization_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_events_organization_id_site_id_development_eve_fkey"
            columns: ["organization_id", "site_id", "development_event_id"]
            isOneToOne: false
            referencedRelation: "development_events"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      evidence: {
        Row: {
          agency: string | null
          category: string
          content_checksum: string
          created_at: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          excerpt: string | null
          id: string
          media_type: string | null
          object_path: string | null
          organization_id: string
          professional_verification_required: boolean
          retrieved_at: string
          site_id: string
          source_published_at: string | null
          source_record_id: string | null
          source_uri: string | null
          structured_payload: Json | null
          supersedes_evidence_id: string | null
          title: string
        }
        Insert: {
          agency?: string | null
          category: string
          content_checksum: string
          created_at?: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          excerpt?: string | null
          id?: string
          media_type?: string | null
          object_path?: string | null
          organization_id: string
          professional_verification_required?: boolean
          retrieved_at: string
          site_id: string
          source_published_at?: string | null
          source_record_id?: string | null
          source_uri?: string | null
          structured_payload?: Json | null
          supersedes_evidence_id?: string | null
          title: string
        }
        Update: {
          agency?: string | null
          category?: string
          content_checksum?: string
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          excerpt?: string | null
          id?: string
          media_type?: string | null
          object_path?: string | null
          organization_id?: string
          professional_verification_required?: boolean
          retrieved_at?: string
          site_id?: string
          source_published_at?: string | null
          source_record_id?: string | null
          source_uri?: string | null
          structured_payload?: Json | null
          supersedes_evidence_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "evidence_organization_id_site_id_supersedes_evidence_id_fkey"
            columns: ["organization_id", "site_id", "supersedes_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "evidence_organization_id_source_record_id_fkey"
            columns: ["organization_id", "source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      feasibility_scenarios: {
        Row: {
          assumptions: Json
          calculation_version: string
          created_at: string
          created_by: string | null
          id: string
          input_checksum: string
          name: string
          organization_id: string
          outputs: Json
          research_context: Json
          site_id: string
        }
        Insert: {
          assumptions: Json
          calculation_version: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_checksum: string
          name: string
          organization_id: string
          outputs: Json
          research_context: Json
          site_id: string
        }
        Update: {
          assumptions?: Json
          calculation_version?: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_checksum?: string
          name?: string
          organization_id?: string
          outputs?: Json
          research_context?: Json
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_scenarios_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      finding_evidence: {
        Row: {
          created_at: string
          evidence_id: string
          finding_id: string
          organization_id: string
          relationship: string
          site_id: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          finding_id: string
          organization_id: string
          relationship?: string
          site_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          finding_id?: string
          organization_id?: string
          relationship?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_evidence_organization_id_site_id_evidence_id_fkey"
            columns: ["organization_id", "site_id", "evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "finding_evidence_organization_id_site_id_finding_id_fkey"
            columns: ["organization_id", "site_id", "finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      findings: {
        Row: {
          agent_run_id: string | null
          category: string
          confidence: number
          created_at: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          field: string
          id: string
          impact: Database["public"]["Enums"]["finding_impact"]
          note: string | null
          organization_id: string
          site_id: string
          status: Database["public"]["Enums"]["finding_status"]
          supersedes_finding_id: string | null
          value_json: Json
        }
        Insert: {
          agent_run_id?: string | null
          category: string
          confidence: number
          created_at?: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          field: string
          id?: string
          impact: Database["public"]["Enums"]["finding_impact"]
          note?: string | null
          organization_id: string
          site_id: string
          status: Database["public"]["Enums"]["finding_status"]
          supersedes_finding_id?: string | null
          value_json?: Json
        }
        Update: {
          agent_run_id?: string | null
          category?: string
          confidence?: number
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          field?: string
          id?: string
          impact?: Database["public"]["Enums"]["finding_impact"]
          note?: string | null
          organization_id?: string
          site_id?: string
          status?: Database["public"]["Enums"]["finding_status"]
          supersedes_finding_id?: string | null
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "findings_organization_id_site_id_agent_run_id_fkey"
            columns: ["organization_id", "site_id", "agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "findings_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "findings_organization_id_site_id_supersedes_finding_id_fkey"
            columns: ["organization_id", "site_id", "supersedes_finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      managed_ingestion_batches: {
        Row: {
          created_at: string
          dataset_key: string
          external_batch_id: string
          id: string
          organization_id: string
          payload: Json
          payload_checksum: string
          provider: string
          record_count: number
          retrieved_at: string
          source_uri: string
        }
        Insert: {
          created_at?: string
          dataset_key: string
          external_batch_id: string
          id?: string
          organization_id: string
          payload: Json
          payload_checksum: string
          provider: string
          record_count: number
          retrieved_at: string
          source_uri: string
        }
        Update: {
          created_at?: string
          dataset_key?: string
          external_batch_id?: string
          id?: string
          organization_id?: string
          payload?: Json
          payload_checksum?: string
          provider?: string
          record_count?: number
          retrieved_at?: string
          source_uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "managed_ingestion_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      next_actions: {
        Row: {
          action_type: string
          agent_run_id: string | null
          created_at: string
          documents_to_request: Json
          expected_follow_up: string | null
          id: string
          known_facts: Json
          organization_id: string
          priority: number
          questions_to_ask: Json
          resolver_role: string
          site_id: string
          unresolved_question: string
          why_it_matters: string
        }
        Insert: {
          action_type: string
          agent_run_id?: string | null
          created_at?: string
          documents_to_request?: Json
          expected_follow_up?: string | null
          id?: string
          known_facts?: Json
          organization_id: string
          priority?: number
          questions_to_ask?: Json
          resolver_role: string
          site_id: string
          unresolved_question: string
          why_it_matters: string
        }
        Update: {
          action_type?: string
          agent_run_id?: string | null
          created_at?: string
          documents_to_request?: Json
          expected_follow_up?: string | null
          id?: string
          known_facts?: Json
          organization_id?: string
          priority?: number
          questions_to_ask?: Json
          resolver_role?: string
          site_id?: string
          unresolved_question?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_actions_organization_id_site_id_agent_run_id_fkey"
            columns: ["organization_id", "site_id", "agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "next_actions_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      permit_events: {
        Row: {
          action: string | null
          created_at: string
          development_event_id: string
          organization_id: string
          permit_number: string | null
          permit_type: string | null
          site_id: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          development_event_id: string
          organization_id: string
          permit_number?: string | null
          permit_type?: string | null
          site_id: string
        }
        Update: {
          action?: string | null
          created_at?: string
          development_event_id?: string
          organization_id?: string
          permit_number?: string | null
          permit_type?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_events_organization_id_site_id_development_event_id_fkey"
            columns: ["organization_id", "site_id", "development_event_id"]
            isOneToOne: false
            referencedRelation: "development_events"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      research_snapshots: {
        Row: {
          acceptance_version: string | null
          accepted: boolean
          accepted_at: string | null
          created_at: string
          id: string
          manifest_checksum: string
          manifest_version: string
          organization_id: string
          site_id: string
          source_cutoff_at: string | null
          status: Database["public"]["Enums"]["snapshot_status"]
          summary: Json
          version: number
          workflow_run_id: string
        }
        Insert: {
          acceptance_version?: string | null
          accepted?: boolean
          accepted_at?: string | null
          created_at?: string
          id?: string
          manifest_checksum: string
          manifest_version: string
          organization_id: string
          site_id: string
          source_cutoff_at?: string | null
          status: Database["public"]["Enums"]["snapshot_status"]
          summary?: Json
          version: number
          workflow_run_id: string
        }
        Update: {
          acceptance_version?: string | null
          accepted?: boolean
          accepted_at?: string | null
          created_at?: string
          id?: string
          manifest_checksum?: string
          manifest_version?: string
          organization_id?: string
          site_id?: string
          source_cutoff_at?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
          summary?: Json
          version?: number
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_snapshots_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "research_snapshots_organization_id_workflow_run_id_fkey"
            columns: ["organization_id", "workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      site_scores: {
        Row: {
          calculated_at: string
          calculation_version: string
          caps: Json
          created_at: string
          id: string
          input_hash: string
          material_flags: Json
          normalized_inputs: Json
          organization_id: string
          rule_weights: Json
          score: number
          score_type: Database["public"]["Enums"]["score_type"]
          site_id: string
          warnings: Json
        }
        Insert: {
          calculated_at: string
          calculation_version: string
          caps?: Json
          created_at?: string
          id?: string
          input_hash: string
          material_flags?: Json
          normalized_inputs: Json
          organization_id: string
          rule_weights?: Json
          score: number
          score_type: Database["public"]["Enums"]["score_type"]
          site_id: string
          warnings?: Json
        }
        Update: {
          calculated_at?: string
          calculation_version?: string
          caps?: Json
          created_at?: string
          id?: string
          input_hash?: string
          material_flags?: Json
          normalized_inputs?: Json
          organization_id?: string
          rule_weights?: Json
          score?: number
          score_type?: Database["public"]["Enums"]["score_type"]
          site_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_scores_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      site_source_records: {
        Row: {
          created_at: string
          organization_id: string
          relationship: string
          site_id: string
          source_record_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          relationship: string
          site_id: string
          source_record_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          relationship?: string
          site_id?: string
          source_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_source_records_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "site_source_records_organization_id_source_record_id_fkey"
            columns: ["organization_id", "source_record_id"]
            isOneToOne: false
            referencedRelation: "source_records"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          apn: string | null
          candidate_site_id: string | null
          city: string | null
          country_code: string
          created_at: string
          created_by: string | null
          current_snapshot_id: string | null
          geometry_geojson: Json | null
          geometry_provenance: string | null
          id: string
          jurisdiction: string
          latitude: number | null
          longitude: number | null
          name: string
          normalized_apn: string | null
          organization_id: string
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          apn?: string | null
          candidate_site_id?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          current_snapshot_id?: string | null
          geometry_geojson?: Json | null
          geometry_provenance?: string | null
          id?: string
          jurisdiction: string
          latitude?: number | null
          longitude?: number | null
          name: string
          normalized_apn?: string | null
          organization_id: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          apn?: string | null
          candidate_site_id?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          current_snapshot_id?: string | null
          geometry_geojson?: Json | null
          geometry_provenance?: string | null
          id?: string
          jurisdiction?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          normalized_apn?: string | null
          organization_id?: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_current_snapshot_fk"
            columns: ["organization_id", "id", "current_snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "sites_organization_id_candidate_site_id_fkey"
            columns: ["organization_id", "candidate_site_id"]
            isOneToOne: false
            referencedRelation: "candidate_sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshot_agent_runs: {
        Row: {
          agent_run_id: string
          created_at: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Insert: {
          agent_run_id: string
          created_at?: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Update: {
          agent_run_id?: string
          created_at?: string
          organization_id?: string
          site_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_agent_runs_organization_id_site_id_agent_run_id_fkey"
            columns: ["organization_id", "site_id", "agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "snapshot_agent_runs_organization_id_site_id_snapshot_id_fkey"
            columns: ["organization_id", "site_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      snapshot_events: {
        Row: {
          created_at: string
          development_event_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Insert: {
          created_at?: string
          development_event_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Update: {
          created_at?: string
          development_event_id?: string
          organization_id?: string
          site_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_events_organization_id_site_id_development_event__fkey"
            columns: ["organization_id", "site_id", "development_event_id"]
            isOneToOne: false
            referencedRelation: "development_events"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "snapshot_events_organization_id_site_id_snapshot_id_fkey"
            columns: ["organization_id", "site_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      snapshot_evidence: {
        Row: {
          created_at: string
          evidence_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          organization_id?: string
          site_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_evidence_organization_id_site_id_evidence_id_fkey"
            columns: ["organization_id", "site_id", "evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "snapshot_evidence_organization_id_site_id_snapshot_id_fkey"
            columns: ["organization_id", "site_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      snapshot_findings: {
        Row: {
          created_at: string
          finding_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Insert: {
          created_at?: string
          finding_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Update: {
          created_at?: string
          finding_id?: string
          organization_id?: string
          site_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_findings_organization_id_site_id_finding_id_fkey"
            columns: ["organization_id", "site_id", "finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "snapshot_findings_organization_id_site_id_snapshot_id_fkey"
            columns: ["organization_id", "site_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      snapshot_next_actions: {
        Row: {
          created_at: string
          next_action_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Insert: {
          created_at?: string
          next_action_id: string
          organization_id: string
          site_id: string
          snapshot_id: string
        }
        Update: {
          created_at?: string
          next_action_id?: string
          organization_id?: string
          site_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_next_actions_organization_id_site_id_next_action__fkey"
            columns: ["organization_id", "site_id", "next_action_id"]
            isOneToOne: false
            referencedRelation: "next_actions"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "snapshot_next_actions_organization_id_site_id_snapshot_id_fkey"
            columns: ["organization_id", "site_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      snapshot_scores: {
        Row: {
          created_at: string
          organization_id: string
          site_id: string
          site_score_id: string
          snapshot_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          site_id: string
          site_score_id: string
          snapshot_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          site_id?: string
          site_score_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_scores_organization_id_site_id_site_score_id_fkey"
            columns: ["organization_id", "site_id", "site_score_id"]
            isOneToOne: false
            referencedRelation: "site_scores"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "snapshot_scores_organization_id_site_id_snapshot_id_fkey"
            columns: ["organization_id", "site_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "research_snapshots"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
        ]
      }
      source_records: {
        Row: {
          created_at: string
          data_source_id: string
          external_record_id: string
          id: string
          normalization_errors: Json
          organization_id: string
          payload_checksum: string
          raw_object_path: string | null
          raw_payload: Json | null
          record_status: Database["public"]["Enums"]["source_record_status"]
          retrieved_at: string
          source_updated_at: string | null
          source_uri: string | null
        }
        Insert: {
          created_at?: string
          data_source_id: string
          external_record_id: string
          id?: string
          normalization_errors?: Json
          organization_id: string
          payload_checksum: string
          raw_object_path?: string | null
          raw_payload?: Json | null
          record_status?: Database["public"]["Enums"]["source_record_status"]
          retrieved_at?: string
          source_updated_at?: string | null
          source_uri?: string | null
        }
        Update: {
          created_at?: string
          data_source_id?: string
          external_record_id?: string
          id?: string
          normalization_errors?: Json
          organization_id?: string
          payload_checksum?: string
          raw_object_path?: string | null
          raw_payload?: Json | null
          record_status?: Database["public"]["Enums"]["source_record_status"]
          retrieved_at?: string
          source_updated_at?: string | null
          source_uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_records_organization_id_data_source_id_fkey"
            columns: ["organization_id", "data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      watchlist_notifications: {
        Row: {
          created_at: string
          development_event_id: string
          id: string
          organization_id: string
          read_at: string | null
          severity: string
          site_id: string
          summary: string
          title: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          development_event_id: string
          id?: string
          organization_id: string
          read_at?: string | null
          severity: string
          site_id: string
          summary: string
          title: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          development_event_id?: string
          id?: string
          organization_id?: string
          read_at?: string | null
          severity?: string
          site_id?: string
          summary?: string
          title?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_notifications_organization_id_site_id_developmen_fkey"
            columns: ["organization_id", "site_id", "development_event_id"]
            isOneToOne: false
            referencedRelation: "development_events"
            referencedColumns: ["organization_id", "site_id", "id"]
          },
          {
            foreignKeyName: "watchlist_notifications_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "watchlist_notifications_organization_id_watchlist_id_fkey"
            columns: ["organization_id", "watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      watchlist_sites: {
        Row: {
          added_by: string | null
          created_at: string
          external_site_id: string
          organization_id: string
          site_id: string
          watchlist_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          external_site_id: string
          organization_id: string
          site_id: string
          watchlist_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          external_site_id?: string
          organization_id?: string
          site_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_sites_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "watchlist_sites_organization_id_watchlist_id_fkey"
            columns: ["organization_id", "watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_idempotency: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          idempotency_key: string
          operation: Database["public"]["Enums"]["workflow_type"]
          organization_id: string
          request_hash: string
          requested_by: string | null
          response: Json | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          operation: Database["public"]["Enums"]["workflow_type"]
          organization_id: string
          request_hash: string
          requested_by?: string | null
          response?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          operation?: Database["public"]["Enums"]["workflow_type"]
          organization_id?: string
          request_hash?: string
          requested_by?: string | null
          response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_idempotency_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          attempt: number
          created_at: string
          error: Json | null
          finished_at: string | null
          id: string
          idempotency_id: string
          input: Json
          organization_id: string
          output: Json | null
          provider: string
          provider_run_id: string | null
          requested_at: string
          site_id: string | null
          source_cutoff_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          thesis_id: string | null
          updated_at: string
          workflow_type: Database["public"]["Enums"]["workflow_type"]
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: Json | null
          finished_at?: string | null
          id?: string
          idempotency_id: string
          input?: Json
          organization_id: string
          output?: Json | null
          provider: string
          provider_run_id?: string | null
          requested_at?: string
          site_id?: string | null
          source_cutoff_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          thesis_id?: string | null
          updated_at?: string
          workflow_type: Database["public"]["Enums"]["workflow_type"]
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: Json | null
          finished_at?: string | null
          id?: string
          idempotency_id?: string
          input?: Json
          organization_id?: string
          output?: Json | null
          provider?: string
          provider_run_id?: string | null
          requested_at?: string
          site_id?: string | null
          source_cutoff_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          thesis_id?: string | null
          updated_at?: string
          workflow_type?: Database["public"]["Enums"]["workflow_type"]
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_organization_id_idempotency_id_fkey"
            columns: ["organization_id", "idempotency_id"]
            isOneToOne: true
            referencedRelation: "workflow_idempotency"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "workflow_runs_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "workflow_runs_organization_id_thesis_id_fkey"
            columns: ["organization_id", "thesis_id"]
            isOneToOne: false
            referencedRelation: "development_theses"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      workspace_agent_settings: {
        Row: {
          created_at: string
          enabled_agents: Json
          max_external_research_tasks_per_site: number
          organization_id: string
          updated_at: string
          updated_by: string | null
          verification_depth: string
        }
        Insert: {
          created_at?: string
          enabled_agents?: Json
          max_external_research_tasks_per_site?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          verification_depth?: string
        }
        Update: {
          created_at?: string
          enabled_agents?: Json
          max_external_research_tasks_per_site?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          verification_depth?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agent_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_research_snapshot: {
        Args: { p_site_id: string; p_snapshot_id: string }
        Returns: string
      }
      get_effective_research_snapshot: {
        Args: { p_site_id: string }
        Returns: {
          acceptance_version: string | null
          accepted: boolean
          accepted_at: string | null
          created_at: string
          id: string
          manifest_checksum: string
          manifest_version: string
          organization_id: string
          site_id: string
          source_cutoff_at: string | null
          status: Database["public"]["Enums"]["snapshot_status"]
          summary: Json
          version: number
          workflow_run_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "research_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_organization_role: {
        Args: {
          p_allowed_roles: Database["public"]["Enums"]["membership_role"][]
          p_organization_id: string
        }
        Returns: boolean
      }
      is_organization_member: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      storage_object_organization_id: {
        Args: { p_object_name: string }
        Returns: string
      }
    }
    Enums: {
      agent_kind:
        | "scout"
        | "land_use"
        | "development_history"
        | "site_risk"
        | "verifier"
        | "next_best_action"
      candidate_status:
        | "candidate"
        | "queued"
        | "researching"
        | "investigated"
        | "failed"
        | "high_priority"
        | "monitoring"
        | "passed"
        | "pursuing"
      event_kind: "entitlement" | "permit" | "development"
      evidence_level:
        | "document_verified"
        | "gis_screened"
        | "ai_researched"
        | "professional_verification_required"
      finding_impact:
        | "opportunity"
        | "cost_timing_risk"
        | "fatal_constraint"
        | "unknown"
      finding_status: "verified" | "probable" | "unknown" | "conflicting"
      membership_role: "owner" | "admin" | "member" | "viewer"
      run_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "partial"
      score_type:
        | "strategy_fit"
        | "development_readiness"
        | "site_feasibility"
        | "deal_potential"
        | "evidence_confidence"
      snapshot_status: "partial" | "complete"
      source_record_status:
        | "received"
        | "normalized"
        | "rejected"
        | "superseded"
      thesis_status: "draft" | "active" | "archived"
      workflow_type:
        | "ingest_candidates"
        | "research_site"
        | "refresh_site"
        | "refresh_finding"
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
      agent_kind: [
        "scout",
        "land_use",
        "development_history",
        "site_risk",
        "verifier",
        "next_best_action",
      ],
      candidate_status: [
        "candidate",
        "queued",
        "researching",
        "investigated",
        "failed",
        "high_priority",
        "monitoring",
        "passed",
        "pursuing",
      ],
      event_kind: ["entitlement", "permit", "development"],
      evidence_level: [
        "document_verified",
        "gis_screened",
        "ai_researched",
        "professional_verification_required",
      ],
      finding_impact: [
        "opportunity",
        "cost_timing_risk",
        "fatal_constraint",
        "unknown",
      ],
      finding_status: ["verified", "probable", "unknown", "conflicting"],
      membership_role: ["owner", "admin", "member", "viewer"],
      run_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "partial",
      ],
      score_type: [
        "strategy_fit",
        "development_readiness",
        "site_feasibility",
        "deal_potential",
        "evidence_confidence",
      ],
      snapshot_status: ["partial", "complete"],
      source_record_status: [
        "received",
        "normalized",
        "rejected",
        "superseded",
      ],
      thesis_status: ["draft", "active", "archived"],
      workflow_type: [
        "ingest_candidates",
        "research_site",
        "refresh_site",
        "refresh_finding",
      ],
    },
  },
} as const
