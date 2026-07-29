import { Tables } from '@/utils/supabase/database.types';

export type NavPage = {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
};

export type AccessWithPages = Tables<'baby_access'> & {
  allowedPages: NavPage[];
};
