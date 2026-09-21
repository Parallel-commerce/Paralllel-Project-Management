export type ProjectRole = "admin" | "member" | "client";
export type ListVisibility = "public" | "private";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "requiring_feedback"
  | "done";
export type TaskType =
  | "bug"
  | "new_feature"
  | "improvement"
  | "data"
  | "documentation"
  | "design"
  | "research"
  | "maintenance"
  | "other";
export type CompanyStatus =
  | "lead"
  | "contacted"
  | "proposal"
  | "won"
  | "lost";
export type CompanyKind =
  | "prospect"
  | "lost_opportunity"
  | "customer"
  | "ex_customer"
  | "agency";
export type CompanyReengage = "yes" | "no" | "not_applicable";
export type ProjectType =
  | "new_website"
  | "maintain"
  | "optimise"
  | "accelerate"
  | "enterprise_b2b";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  avatar_path: string | null;
  is_platform_admin: boolean;
  can_access_crm: boolean;
  deleted_at: string | null;
  previous_email: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  logo_path: string | null;
  next_task_number: number;
  company_id: string | null;
  sort_order: number;
  /** 0 = Sunday … 6 = Saturday */
  scheduled_weekdays: number[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  website: string | null;
  summary: string | null;
  linkedin_url: string | null;
  notes: string | null;
  status: CompanyStatus;
  kind: CompanyKind;
  can_reengage: CompanyReengage | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  enriched_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type Vertical = {
  id: string;
  name: string;
  created_at: string;
};

export type CompanyVertical = {
  company_id: string;
  vertical_id: string;
  created_at: string;
};

export type ProjectEngagement = {
  project_id: string;
  project_type: ProjectType | null;
  monthly_hours: number | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
};

export type ProjectInvite = {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  invited_by: string;
  created_at: string;
};

export type List = {
  id: string;
  project_id: string;
  name: string;
  visibility: ListVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  list_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  task_type: TaskType | null;
  number: number;
  key: string;
  created_by: string;
  reported_by: string;
  assigned_to: string | null;
  completed_at: string | null;
  archived_at: string | null;
  theme_commit_sha: string | null;
  theme_commit_message: string | null;
  theme_commit_url: string | null;
  theme_committed_at: string | null;
  theme_commit_none: boolean;
  source_report_id: string | null;
  source_action_key: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  parent_id: string | null;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskCommentAttachment = {
  id: string;
  comment_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
};

export type TaskCommentMention = {
  comment_id: string;
  user_id: string;
  created_at: string;
};

export type TaskCommentRead = {
  user_id: string;
  comment_id: string;
  read_at: string;
};

export type Conversation = {
  id: string;
  project_id: string;
  client_user_id: string;
  created_at: string;
  updated_at: string;
  last_message_body: string | null;
  last_message_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};

export type MessageAttachment = {
  id: string;
  message_id: string;
  conversation_id: string;
  file_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
};

export type MessageMention = {
  message_id: string;
  user_id: string;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type ActivityEvent = {
  id: string;
  project_id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type TimeEntrySource = "timer" | "manual";

export type TimeEntry = {
  id: string;
  project_id: string;
  user_id: string;
  task_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  source: TimeEntrySource;
  created_at: string;
  updated_at: string;
};

export type ReportPeriod = "week" | "month" | "custom";
export type ReportKind = "progress" | "store";
export type ScorecardTrend = "up" | "flat" | "down";
export type ScorecardFormat = "money" | "count" | "percent";

export type ReportDigest = {
  stats: {
    tasks_created: number;
    tasks_completed: number;
    status_changes: number;
    comments: number;
    people_invited: number;
  };
  highlights: string[];
  completed_tasks: string[];
  activity_summaries: string[];
};

export type PeriodMetric = {
  this_week: number | null;
  last_week: number | null;
  change_pct: number | null;
};

export type ScorecardMetric = {
  key: string;
  label: string;
  this_week: number | null;
  last_week: number | null;
  change_pct: number | null;
  trend: ScorecardTrend | null;
  format: ScorecardFormat;
  available: boolean;
};

export type StoreReportDay = {
  date: string;
  sales?: number | null;
  orders?: number | null;
  sessions?: number | null;
  conversion_rate?: number | null;
};

export type StoreChannelRow = {
  name: string;
  sales: number;
  previous_sales: number | null;
  share_pct: number | null;
  change_pct: number | null;
};

export type StoreProductRow = {
  title: string;
  units: number | null;
  sales: number | null;
  sell_through: number | null;
};

export type StoreReferrerRow = {
  source: string;
  sessions: number;
  share_pct: number | null;
};

export type StoreReportDigest = {
  kind: "store";
  source: "shopifyql" | "admin_orders" | "mixed";
  shop_name: string | null;
  currency: string | null;
  timezone: string | null;
  period?: ReportPeriod;
  week_start: string;
  week_end: string;
  previous_week_start: string;
  previous_week_end: string;
  unavailable: string[];
  warnings: string[];
  /** Headline sales, orders, AOV, customers, and products are Online Store only. */
  sales_scope?: "online_store";
  /** All-channel sales (POS, Shop, etc.) for Section 3 context. */
  all_sales?: PeriodMetric | null;
  scorecard: {
    metrics: ScorecardMetric[];
    greens: number;
    scored: number;
    score: number;
    interpretation: string;
  };
  sales: {
    total_sales: PeriodMetric;
    orders: PeriodMetric;
    aov: PeriodMetric;
    discounts: PeriodMetric;
    discount_order_pct: PeriodMetric | null;
    avg_discount: number | null;
    strongest_day: { date: string; sales: number } | null;
    weakest_day: { date: string; sales: number } | null;
    daily: StoreReportDay[];
  };
  channels: StoreChannelRow[];
  customers: {
    new: PeriodMetric | null;
    returning: PeriodMetric | null;
    returning_rate: PeriodMetric | null;
  };
  conversion: {
    rate: PeriodMetric | null;
    sessions: PeriodMetric | null;
    best_day: { date: string; rate: number } | null;
    worst_day: { date: string; rate: number } | null;
  };
  products: StoreProductRow[];
  referrers: StoreReferrerRow[];
  sessions_daily: StoreReportDay[];
  /** Latest Lighthouse / Core Web Vitals snapshot as of the period end. */
  speed?: StoreReportSpeed | null;
};

export type StoreReportSpeedOrigin = {
  passed: boolean | null;
  lcp_ms: number | null;
  inp_ms: number | null;
  cls: number | null;
  category: string | null;
  url: string | null;
};

export type StoreReportSpeedPage = {
  page_kind: SpeedPageKind;
  title: string;
  url: string;
  lab_score: number | null;
  previous_lab_score: number | null;
  lab_score_change: number | null;
  lab_lcp_ms: number | null;
  lab_tbt_ms: number | null;
  lab_cls: number | null;
  field_lcp_ms: number | null;
  field_inp_ms: number | null;
  field_cls: number | null;
  field_passed: boolean | null;
  field_category: string | null;
  opportunities: { id?: string; title: string; savings_ms: number }[];
  error: string | null;
};

export type StoreReportSpeed = {
  captured_at: string;
  previous_captured_at: string | null;
  origin: StoreReportSpeedOrigin;
  pages: StoreReportSpeedPage[];
};

export type ProjectReportDigest = ReportDigest | StoreReportDigest;

export type ProjectReport = {
  id: string;
  project_id: string;
  kind: ReportKind;
  period: ReportPeriod;
  period_start: string;
  period_end: string;
  title: string;
  narrative: string | null;
  digest: ProjectReportDigest;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  sent_to: string[];
};

export type ShopifyConnectionStatus =
  | "pending"
  | "connected"
  | "error"
  | "disconnected";

export type ProjectShopifyConnection = {
  project_id: string;
  shop_domain: string;
  client_id: string;
  client_secret_ciphertext: string;
  access_token_ciphertext: string | null;
  scopes: string | null;
  status: ShopifyConnectionStatus;
  last_error: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreConnectionPublic = {
  shop_domain: string;
  client_id: string;
  has_client_secret: boolean;
  has_access_token: boolean;
  status: ShopifyConnectionStatus;
  last_error: string | null;
  last_synced_at: string | null;
  scopes: string | null;
};

export type ProjectThemeGit = {
  project_id: string;
  repo: string;
  branch: string;
  created_at: string;
  updated_at: string;
};

export type StoreSnapshotSource = "manual" | "scheduled";

export type ProjectStoreSnapshot = {
  id: string;
  project_id: string;
  shop_name: string | null;
  shop_domain: string | null;
  primary_domain: string | null;
  plan_name: string | null;
  currency: string | null;
  orders_1d: number | null;
  sales_1d: number | null;
  sessions_1d: number | null;
  conversion_rate_1d: number | null;
  orders_7d: number | null;
  sales_7d: number | null;
  sessions_7d: number | null;
  conversion_rate_7d: number | null;
  orders_30d: number | null;
  sales_30d: number | null;
  sessions_30d: number | null;
  conversion_rate_30d: number | null;
  sales_available: boolean;
  reports_available: boolean | null;
  theme_name: string | null;
  theme_updated_at: string | null;
  snapshot_date: string | null;
  source: StoreSnapshotSource;
  payload: Record<string, unknown>;
  captured_at: string;
  created_at: string;
};

export type SpeedPageKind = "home" | "collection" | "product" | "cart";

export type ProjectStoreSpeedRun = {
  id: string;
  project_id: string;
  source: StoreSnapshotSource;
  origin_url: string | null;
  origin_passed: boolean | null;
  origin_lcp_ms: number | null;
  origin_inp_ms: number | null;
  origin_cls: number | null;
  origin_category: string | null;
  digest: Record<string, unknown>;
  captured_at: string;
  created_at: string;
};

export type ProjectStoreSpeedPage = {
  id: string;
  run_id: string;
  project_id: string;
  page_kind: SpeedPageKind;
  url: string;
  title: string | null;
  performance_score: number | null;
  lab_lcp_ms: number | null;
  lab_tbt_ms: number | null;
  lab_cls: number | null;
  field_lcp_ms: number | null;
  field_inp_ms: number | null;
  field_cls: number | null;
  field_passed: boolean | null;
  field_category: string | null;
  opportunities: { id: string; title: string; savings_ms: number }[];
  error: string | null;
  payload: Record<string, unknown>;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          title?: string | null;
          avatar_path?: string | null;
          is_platform_admin?: boolean;
          can_access_crm?: boolean;
          deleted_at?: string | null;
          previous_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          title?: string | null;
          avatar_path?: string | null;
          is_platform_admin?: boolean;
          can_access_crm?: boolean;
          deleted_at?: string | null;
          previous_email?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          logo_path?: string | null;
          next_task_number?: number;
          company_id?: string | null;
          sort_order?: number;
          scheduled_weekdays?: number[];
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          logo_path?: string | null;
          next_task_number?: number;
          company_id?: string | null;
          sort_order?: number;
          scheduled_weekdays?: number[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_engagement_project_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "project_engagement";
            referencedColumns: ["project_id"];
          },
        ];
      };
      project_engagement: {
        Row: ProjectEngagement;
        Insert: {
          project_id: string;
          project_type?: ProjectType | null;
          monthly_hours?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          project_type?: ProjectType | null;
          monthly_hours?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_engagement_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: Company;
        Insert: {
          id?: string;
          name: string;
          website?: string | null;
          summary?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          status?: CompanyStatus;
          kind?: CompanyKind;
          can_reengage?: CompanyReengage | null;
          follow_up_at?: string | null;
          follow_up_note?: string | null;
          enriched_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          website?: string | null;
          summary?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          status?: CompanyStatus;
          kind?: CompanyKind;
          can_reengage?: CompanyReengage | null;
          follow_up_at?: string | null;
          follow_up_note?: string | null;
          enriched_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: Contact;
        Insert: {
          id?: string;
          company_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          linkedin_url?: string | null;
          notes?: string | null;
          is_primary?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      verticals: {
        Row: Vertical;
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      company_verticals: {
        Row: CompanyVertical;
        Insert: {
          company_id: string;
          vertical_id: string;
          created_at?: string;
        };
        Update: {
          company_id?: string;
          vertical_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_verticals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_verticals_vertical_id_fkey";
            columns: ["vertical_id"];
            isOneToOne: false;
            referencedRelation: "verticals";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: ProjectMember;
        Insert: {
          project_id: string;
          user_id: string;
          role?: ProjectRole;
          created_at?: string;
        };
        Update: {
          role?: ProjectRole;
        };
        Relationships: [];
      };
      project_invites: {
        Row: ProjectInvite;
        Insert: {
          id?: string;
          project_id: string;
          email: string;
          role?: ProjectRole;
          invited_by: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          role?: ProjectRole;
        };
        Relationships: [];
      };
      lists: {
        Row: List;
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          visibility?: ListVisibility;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          visibility?: ListVisibility;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: {
          id?: string;
          list_id: string;
          project_id?: string;
          title: string;
          description?: string | null;
          due_date?: string | null;
          status?: TaskStatus;
          task_type?: TaskType | null;
          number: number;
          key: string;
          created_by: string;
          reported_by: string;
          assigned_to?: string | null;
          completed_at?: string | null;
          archived_at?: string | null;
          theme_commit_sha?: string | null;
          theme_commit_message?: string | null;
          theme_commit_url?: string | null;
          theme_committed_at?: string | null;
          theme_commit_none?: boolean;
          source_report_id?: string | null;
          source_action_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          due_date?: string | null;
          status?: TaskStatus;
          task_type?: TaskType | null;
          reported_by?: string;
          assigned_to?: string | null;
          number?: number;
          key?: string;
          project_id?: string;
          completed_at?: string | null;
          archived_at?: string | null;
          theme_commit_sha?: string | null;
          theme_commit_message?: string | null;
          theme_commit_url?: string | null;
          theme_committed_at?: string | null;
          theme_commit_none?: boolean;
          source_report_id?: string | null;
          source_action_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_reported_by_fkey";
            columns: ["reported_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      task_attachments: {
        Row: TaskAttachment;
        Insert: {
          id?: string;
          task_id: string;
          file_path: string;
          file_name: string;
          content_type?: string | null;
          size_bytes?: number | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          file_name?: string;
        };
        Relationships: [];
      };
      task_comments: {
        Row: TaskComment;
        Insert: {
          id?: string;
          task_id: string;
          parent_id?: string | null;
          body: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          parent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "task_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      task_comment_attachments: {
        Row: TaskCommentAttachment;
        Insert: {
          id?: string;
          comment_id: string;
          file_path: string;
          file_name: string;
          content_type?: string | null;
          size_bytes?: number | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          file_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comment_attachments_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "task_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comment_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_comment_mentions: {
        Row: TaskCommentMention;
        Insert: {
          comment_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          comment_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comment_mentions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "task_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comment_mentions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_comment_reads: {
        Row: TaskCommentRead;
        Insert: {
          user_id: string;
          comment_id: string;
          read_at?: string;
        };
        Update: {
          read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comment_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comment_reads_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "task_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: Conversation;
        Insert: {
          id?: string;
          project_id: string;
          client_user_id: string;
          created_at?: string;
          updated_at?: string;
          last_message_body?: string | null;
          last_message_at?: string | null;
        };
        Update: {
          updated_at?: string;
          last_message_body?: string | null;
          last_message_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_client_user_id_fkey";
            columns: ["client_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: Message;
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          parent_id?: string | null;
          body?: string;
          created_at?: string;
        };
        Update: {
          body?: string;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      message_attachments: {
        Row: MessageAttachment;
        Insert: {
          id?: string;
          message_id: string;
          conversation_id: string;
          file_path: string;
          file_name: string;
          content_type?: string | null;
          size_bytes?: number | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          file_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_attachments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      message_mentions: {
        Row: MessageMention;
        Insert: {
          message_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_mentions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_mentions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: Notification;
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };
      activity_events: {
        Row: ActivityEvent;
        Insert: {
          id?: string;
          project_id: string;
          actor_id?: string | null;
          entity_type: string;
          entity_id?: string | null;
          action: string;
          summary: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          summary?: string;
          metadata?: Record<string, unknown>;
        };
        Relationships: [];
      };
      project_reports: {
        Row: ProjectReport;
        Insert: {
          id?: string;
          project_id: string;
          kind?: ReportKind;
          period: ReportPeriod;
          period_start: string;
          period_end: string;
          title: string;
          narrative?: string | null;
          digest?: ProjectReportDigest;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
          sent_to?: string[];
        };
        Update: {
          title?: string;
          narrative?: string | null;
          digest?: ProjectReportDigest;
          kind?: ReportKind;
          sent_at?: string | null;
          sent_to?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      project_shopify_connections: {
        Row: ProjectShopifyConnection;
        Insert: {
          project_id: string;
          shop_domain: string;
          client_id: string;
          client_secret_ciphertext: string;
          access_token_ciphertext?: string | null;
          scopes?: string | null;
          status?: ShopifyConnectionStatus;
          last_error?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          shop_domain?: string;
          client_id?: string;
          client_secret_ciphertext?: string;
          access_token_ciphertext?: string | null;
          scopes?: string | null;
          status?: ShopifyConnectionStatus;
          last_error?: string | null;
          last_synced_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_shopify_connections_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_theme_git: {
        Row: ProjectThemeGit;
        Insert: {
          project_id: string;
          repo: string;
          branch?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          repo?: string;
          branch?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_theme_git_project_id_fkey",
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_store_snapshots: {
        Row: ProjectStoreSnapshot;
        Insert: {
          id?: string;
          project_id: string;
          shop_name?: string | null;
          shop_domain?: string | null;
          primary_domain?: string | null;
          plan_name?: string | null;
          currency?: string | null;
          orders_1d?: number | null;
          sales_1d?: number | null;
          sessions_1d?: number | null;
          conversion_rate_1d?: number | null;
          orders_7d?: number | null;
          sales_7d?: number | null;
          sessions_7d?: number | null;
          conversion_rate_7d?: number | null;
          orders_30d?: number | null;
          sales_30d?: number | null;
          sessions_30d?: number | null;
          conversion_rate_30d?: number | null;
          sales_available?: boolean;
          reports_available?: boolean | null;
          theme_name?: string | null;
          theme_updated_at?: string | null;
          snapshot_date?: string | null;
          source?: StoreSnapshotSource;
          payload?: Record<string, unknown>;
          captured_at?: string;
          created_at?: string;
        };
        Update: {
          shop_name?: string | null;
          shop_domain?: string | null;
          primary_domain?: string | null;
          plan_name?: string | null;
          currency?: string | null;
          orders_1d?: number | null;
          sales_1d?: number | null;
          sessions_1d?: number | null;
          conversion_rate_1d?: number | null;
          orders_7d?: number | null;
          sales_7d?: number | null;
          sessions_7d?: number | null;
          conversion_rate_7d?: number | null;
          orders_30d?: number | null;
          sales_30d?: number | null;
          sessions_30d?: number | null;
          conversion_rate_30d?: number | null;
          sales_available?: boolean;
          reports_available?: boolean | null;
          theme_name?: string | null;
          theme_updated_at?: string | null;
          snapshot_date?: string | null;
          source?: StoreSnapshotSource;
          payload?: Record<string, unknown>;
        };
        Relationships: [
          {
            foreignKeyName: "project_store_snapshots_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_store_speed_runs: {
        Row: ProjectStoreSpeedRun;
        Insert: {
          id?: string;
          project_id: string;
          source?: StoreSnapshotSource;
          origin_url?: string | null;
          origin_passed?: boolean | null;
          origin_lcp_ms?: number | null;
          origin_inp_ms?: number | null;
          origin_cls?: number | null;
          origin_category?: string | null;
          digest?: Record<string, unknown>;
          captured_at?: string;
          created_at?: string;
        };
        Update: {
          origin_url?: string | null;
          origin_passed?: boolean | null;
          origin_lcp_ms?: number | null;
          origin_inp_ms?: number | null;
          origin_cls?: number | null;
          origin_category?: string | null;
          digest?: Record<string, unknown>;
        };
        Relationships: [
          {
            foreignKeyName: "project_store_speed_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_store_speed_pages: {
        Row: ProjectStoreSpeedPage;
        Insert: {
          id?: string;
          run_id: string;
          project_id: string;
          page_kind: SpeedPageKind;
          url: string;
          title?: string | null;
          performance_score?: number | null;
          lab_lcp_ms?: number | null;
          lab_tbt_ms?: number | null;
          lab_cls?: number | null;
          field_lcp_ms?: number | null;
          field_inp_ms?: number | null;
          field_cls?: number | null;
          field_passed?: boolean | null;
          field_category?: string | null;
          opportunities?: Record<string, unknown>[] | ProjectStoreSpeedPage["opportunities"];
          error?: string | null;
          payload?: Record<string, unknown>;
        };
        Update: {
          title?: string | null;
          error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_store_speed_pages_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "project_store_speed_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: TimeEntry;
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          task_id: string;
          description?: string | null;
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          source: TimeEntrySource;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          description?: string | null;
          started_at?: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          task_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_project_member: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      is_project_admin: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      is_project_internal: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      project_task_prefix: {
        Args: { p_name: string };
        Returns: string;
      };
      allocate_task_key: {
        Args: { p_project_id: string; p_prefix?: string | null };
        Returns: { task_number: number; task_key: string }[];
      };
      archive_eligible_tasks: {
        Args: { p_list_id?: string | null; p_project_id?: string | null };
        Returns: number;
      };
      project_role: {
        Args: { p_project_id: string };
        Returns: ProjectRole;
      };
      can_view_list: {
        Args: { p_list_id: string };
        Returns: boolean;
      };
      can_access_conversation: {
        Args: { p_conversation_id: string };
        Returns: boolean;
      };
      can_send_in_conversation: {
        Args: { p_conversation_id: string };
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_internal_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_crm_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      reorder_projects: {
        Args: { p_ordered_ids: string[] };
        Returns: undefined;
      };
      soft_delete_user: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      reinstate_user: {
        Args: { p_user_id: string; p_email?: string | null };
        Returns: undefined;
      };
      find_profile_by_invite_email: {
        Args: { p_email: string };
        Returns: {
          profile_id: string;
          is_deleted: boolean;
          email: string;
          previous_email: string | null;
        }[];
      };
      list_user_login_status: {
        Args: { p_user_ids?: string[] | null };
        Returns: {
          user_id: string;
          last_sign_in_at: string | null;
          has_active_session: boolean;
          auth_status: "never_logged_in" | "logged_in" | "logged_out";
        }[];
      };
      project_task_stats: {
        Args: { p_project_ids: string[] };
        Returns: {
          project_id: string;
          status: TaskStatus;
          task_count: number;
        }[];
      };
      list_task_stats: {
        Args: { p_project_id: string };
        Returns: {
          list_id: string;
          status: TaskStatus;
          task_count: number;
        }[];
      };
      create_notification: {
        Args: {
          p_user_id: string;
          p_type: string;
          p_title: string;
          p_body?: string | null;
          p_link?: string | null;
        };
        Returns: string;
      };
      log_activity: {
        Args: {
          p_project_id: string;
          p_actor_id: string;
          p_entity_type: string;
          p_entity_id?: string | null;
          p_action: string;
          p_summary: string;
          p_metadata?: Record<string, unknown>;
          p_client_visible?: boolean;
        };
        Returns: string;
      };
    };
    Enums: {
      project_role: ProjectRole;
      list_visibility: ListVisibility;
      task_status: TaskStatus;
      task_type: TaskType;
      report_period: ReportPeriod;
      report_kind: ReportKind;
      company_status: CompanyStatus;
      company_kind: CompanyKind;
      company_reengage: CompanyReengage;
      project_type: ProjectType;
      shopify_connection_status: ShopifyConnectionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "requiring_feedback", label: "Requiring feedback" },
  { value: "done", label: "Done" },
];

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "new_feature", label: "New feature" },
  { value: "improvement", label: "Improvement" },
  { value: "data", label: "Data" },
  { value: "documentation", label: "Documentation" },
  { value: "design", label: "Design" },
  { value: "research", label: "Research" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

export const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Team member" },
  { value: "client", label: "Client" },
];

export const COMPANY_STATUSES: { value: CompanyStatus; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "proposal", label: "Proposal" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const COMPANY_KINDS: { value: CompanyKind; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "lost_opportunity", label: "Lost opportunity" },
  { value: "customer", label: "Customer" },
  { value: "ex_customer", label: "Ex customer" },
  { value: "agency", label: "Agency / evangelist" },
];

export const COMPANY_REENGAGES: { value: CompanyReengage; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_applicable", label: "Not applicable" },
];

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "new_website", label: "New Website" },
  { value: "maintain", label: "Maintain" },
  { value: "optimise", label: "Optimise" },
  { value: "accelerate", label: "Accelerate" },
  { value: "enterprise_b2b", label: "Enterprise & B2B" },
];
