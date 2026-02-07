// Database types matching Supabase schema

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  forwarding_email: string | null;
  avatar_url: string | null;
  plan: 'free' | 'pro' | 'team';
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  user_id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  cover_image: string | null;
  status: 'upcoming' | 'active' | 'completed';
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: string;
  trip_id: string;
  type: 'flight' | 'hotel' | 'car' | 'train' | 'meeting' | 'event';
  title: string;
  subtitle: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  address: string | null;
  confirmation_number: string | null;
  details: Record<string, any>;
  status: 'confirmed' | 'delayed' | 'cancelled' | 'completed';
  alert_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Receipt {
  id: string;
  trip_id: string;
  reservation_id: string | null;
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  category: 'transport' | 'lodging' | 'meals' | 'other';
  image_url: string | null;
  status: 'pending' | 'submitted' | 'approved';
  ocr_data: Record<string, any> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'gate_change' | 'delay' | 'reminder' | 'confirmation' | 'trip_summary';
  title: string;
  message: string;
  trip_id: string | null;
  read: boolean;
  created_at: string;
}

// Insert types (omit auto-generated fields)
export type TripInsert = Omit<Trip, 'id' | 'created_at' | 'updated_at' | 'summary'>;
export type TripUpdate = Partial<TripInsert>;

export type ReservationInsert = Omit<Reservation, 'id' | 'created_at' | 'updated_at'>;
export type ReservationUpdate = Partial<ReservationInsert>;

export type ReceiptInsert = Omit<Receipt, 'id' | 'created_at'>;
export type ReceiptUpdate = Partial<ReceiptInsert>;
