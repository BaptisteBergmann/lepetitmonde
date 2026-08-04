import { Tables, Enums } from '@/utils/supabase/database.types';
import { LucideIcon } from 'lucide-react';

export type NavPage = {
  id: string;
  name: string;
  role: Enums<'role'>;
  enabled: boolean;
  icon: LucideIcon;
};

export type AccessWithPages = Tables<'baby_access'> & {
  allowedPages: NavPage[];
};
