export type Gender = "male" | "female" | "other";

export type Visibility = "public" | "family" | "private";

export type UserRole = "admin" | "member" | "guest";

export interface Member {
  id: string;
  full_name: string;
  nickname?: string | null;
  gender: Gender;
  birth_date?: string | null;
  death_date?: string | null;
  birth_place?: string | null;
  hometown?: string | null;
  address?: string | null;
  occupation?: string | null;
  biography?: string | null;
  avatar_url?: string | null;
  generation: number;
  branch_id?: string | null;
  is_alive: boolean;
  visibility?: Visibility;
  /** id cha (huyết thống) */
  father_id?: string | null;
  /** id mẹ (huyết thống) */
  mother_id?: string | null;
  /** id vợ/chồng */
  spouse_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Branch {
  id: string;
  name: string;
  description?: string | null;
  ancestor_id?: string | null;
  image_url?: string | null;
  created_at?: string;
}

export interface ClanEvent {
  id: string;
  title: string;
  description?: string | null;
  event_date: string;
  location?: string | null;
  cover_image?: string | null;
  type?: string | null;
  created_at?: string;
}

export interface MemorialDay {
  id: string;
  member_id: string;
  member_name: string;
  death_date?: string | null;
  lunar_date?: string | null;
  solar_date?: string | null;
  location?: string | null;
  note?: string | null;
}

export interface Photo {
  id: string;
  album_id?: string | null;
  member_id?: string | null;
  url: string;
  caption?: string | null;
  created_at?: string;
}

export interface Album {
  id: string;
  title: string;
  cover_url?: string | null;
  description?: string | null;
}

export interface ClanStats {
  total: number;
  male: number;
  female: number;
  alive: number;
  deceased: number;
  generations: number;
  branches: number;
}
