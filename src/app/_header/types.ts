import { Tables, Enums } from '@/utils/supabase/database.types';

// Deliberately no `icon` field: this type crosses the Server → Client
// Component boundary (passed into MobileMenu), and Lucide icon components
// are function references that Next.js can't serialize across that boundary.
// Client components that need the icon resolve it themselves from
// PAGE_REGISTRY by id instead (see mobile_menu.tsx).
export type NavPage = {
  id: string;
  name: string;
  role: Enums<'role'>;
  enabled: boolean;
};

export type AccessWithPages = Tables<'baby_access'> & {
  allowedPages: NavPage[];
};
