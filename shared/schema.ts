export interface Role {
  id: number;
  name: string;
  description: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birthdate: string | null;
  tax_id: string | null;
  street_address_1: string | null;
  street_address_2: string | null;
  country: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal_code: string | null;
  profile_complete: boolean;
  created_at: string;
  updated_at: string;
  roles: Role[];
}

export interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  birthdate?: string;
  tax_id?: string;
  street_address_1?: string;
  street_address_2?: string;
  country?: string;
  city?: string;
  state_province?: string;
  zip_postal_code?: string;
  roles?: string[];
}

export interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  birthdate?: string;
  tax_id?: string;
  street_address_1?: string;
  street_address_2?: string;
  country?: string;
  city?: string;
  state_province?: string;
  zip_postal_code?: string;
  profile_complete?: boolean;
  roles?: string[];
}
