export type ProjectRole = "admin" | "member" | "client";
export type ListVisibility = "public" | "private";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "requiring_feedback"
  | "done";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  avatar_path: string | null;
  is_platform_admin: boolean;
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
  created_by: string;
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
  link_url: string | null;
  number: number;
  key: string;
  created_by: string;
  reported_by: string;
  assigned_to: string | null;
  completed_at: string | null;
  archived_at: string | null;
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
  body: string;
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

export type ProjectReport = {
  id: string;
  project_id: string;
  period: ReportPeriod;
  period_start: string;
  period_end: string;
  title: string;
  narrative: string | null;
  digest: ReportDigest;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  sent_to: string[];
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
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          logo_path?: string | null;
          next_task_number?: number;
          updated_at?: string;
        };
        Relationships: [];
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
          link_url?: string | null;
          number: number;
          key: string;
          created_by: string;
          reported_by: string;
          assigned_to?: string | null;
          completed_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          due_date?: string | null;
          status?: TaskStatus;
          link_url?: string | null;
          reported_by?: string;
          assigned_to?: string | null;
          number?: number;
          key?: string;
          project_id?: string;
          completed_at?: string | null;
          archived_at?: string | null;
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
          body: string;
          created_at?: string;
        };
        Update: {
          body?: string;
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
          period: ReportPeriod;
          period_start: string;
          period_end: string;
          title: string;
          narrative?: string | null;
          digest?: ReportDigest;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          sent_at?: string | null;
          sent_to?: string[];
        };
        Update: {
          title?: string;
          narrative?: string | null;
          digest?: ReportDigest;
          sent_at?: string | null;
          sent_to?: string[];
          updated_at?: string;
        };
        Relationships: [];
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
      report_period: ReportPeriod;
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

export const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Team member" },
  { value: "client", label: "Client" },
];
