export type Database = {
  public: {
    Tables: {
      candidates: {
        Row: {
          id: string;
          user_id: string;
          phone: string;
          name: string;
          photo_url: string | null;
          skills: string[];
          location: string;
          online: boolean;
          rating: number;
          rating_count: number;
          fcm_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone: string;
          name: string;
          photo_url?: string | null;
          skills: string[];
          location: string;
          online?: boolean;
          rating?: number;
          rating_count?: number;
          fcm_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['candidates']['Insert']>;
      };
      employers: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          phone: string;
          subscription_tier: 'starter' | 'pro' | 'business';
          posts_remaining: number;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          next_billing_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          phone: string;
          subscription_tier?: 'starter' | 'pro' | 'business';
          posts_remaining?: number;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          next_billing_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['employers']['Insert']>;
      };
      jobs: {
        Row: {
          id: string;
          employer_id: string;
          skill: string;
          location: string;
          tarif: number;
          start_time: string;
          end_time: string;
          details: string | null;
          status: 'open' | 'filled' | 'expired';
          filled_by: string | null;
          published_at: string;
          expires_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employer_id: string;
          skill: string;
          location: string;
          tarif: number;
          start_time: string;
          end_time: string;
          details?: string | null;
          status?: 'open' | 'filled' | 'expired';
          filled_by?: string | null;
          published_at?: string;
          expires_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>;
      };
      applications: {
        Row: {
          id: string;
          job_id: string;
          candidate_id: string;
          status: 'accepted' | 'confirmed' | 'rejected' | 'completed';
          accepted_at: string;
          confirmed_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          candidate_id: string;
          status?: 'accepted' | 'confirmed' | 'rejected' | 'completed';
          accepted_at?: string;
          confirmed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['applications']['Insert']>;
      };
      reviews: {
        Row: {
          id: string;
          job_id: string;
          from_user_id: string;
          to_user_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          from_user_id: string;
          to_user_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
      };
    };
  };
};

export type Candidate = Database['public']['Tables']['candidates']['Row'];
export type Employer = Database['public']['Tables']['employers']['Row'];
export type Job = Database['public']['Tables']['jobs']['Row'];
export type Application = Database['public']['Tables']['applications']['Row'];
export type Review = Database['public']['Tables']['reviews']['Row'];
export type UserRole = 'candidate' | 'employer';

export type ApplicationWithCandidate = Application & { candidates: Candidate | null };
export type JobWithApplications = Job & { applications: ApplicationWithCandidate[] };
