import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export type ReservationType = 'flight' | 'hotel' | 'car' | 'train' | 'meeting' | 'event';

export interface Reservation {
  id: string;
  tripId: string;
  type: ReservationType;
  title: string;
  subtitle?: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  address?: string;
  confirmationNumber?: string;
  details: Record<string, string>;
  status: 'confirmed' | 'delayed' | 'cancelled' | 'completed';
  alertMessage?: string;
}

export interface Receipt {
  id: string;
  tripId: string;
  reservationId?: string;
  merchant: string;
  amount: number;
  currency: string;
  date: Date;
  category: 'transport' | 'lodging' | 'meals' | 'other';
  imageUrl?: string;
  status: 'pending' | 'submitted' | 'approved';
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  coverImage?: string;
  reservations: Reservation[];
  receipts: Receipt[];
  status: 'upcoming' | 'active' | 'completed';
}

export interface User {
  id: string;
  name: string;
  email: string;
  forwardingEmail: string;
  avatarUrl?: string;
  plan: 'free' | 'pro' | 'team';
}

interface TripStore {
  trips: Trip[];
  user: User | null;
  isLoading: boolean;
  setTrips: (trips: Trip[]) => void;
  setUser: (user: User | null) => void;
  addTrip: (trip: Trip) => void;
  updateTrip: (tripId: string, updates: Partial<Trip>) => void;
  addReservation: (tripId: string, reservation: Reservation) => void;
  getActiveTrip: () => Trip | undefined;
  getUpcomingReservations: (hours?: number) => Reservation[];
  getTodayReservations: () => Reservation[];
  getMissingReceipts: () => { trip: Trip; reservation: Reservation }[];
}

// Mock data with realistic business travel scenarios
const mockUser: User = {
  id: 'user-1',
  name: 'Alex Chen',
  email: 'alex@startup.io',
  forwardingEmail: 'plans@triptrack.ai',
  plan: 'pro',
};

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// Helper to create dates relative to today
const createDate = (daysOffset: number, hours: number, minutes: number = 0): Date => {
  const date = new Date(today);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const mockTrips: Trip[] = [
  {
    id: 'trip-1',
    name: 'NYC Client Pitch',
    destination: 'New York City',
    startDate: createDate(0, 0),
    endDate: createDate(2, 23, 59),
    coverImage: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800',
    status: 'active',
    reservations: [
      {
        id: 'res-1',
        tripId: 'trip-1',
        type: 'flight',
        title: 'AA 182',
        subtitle: 'SFO → JFK',
        startTime: createDate(0, 15, 45),
        endTime: createDate(0, 23, 30),
        location: 'San Francisco International Airport',
        address: 'Terminal 2, Gate B12',
        confirmationNumber: 'XKWP7M',
        status: 'confirmed',
        alertMessage: 'Gate changed to B12',
        details: {
          'Seat': '12A (Window)',
          'Class': 'Business',
          'Duration': '5h 45m',
          'Aircraft': 'Boeing 777-300ER',
        },
      },
      {
        id: 'res-2',
        tripId: 'trip-1',
        type: 'hotel',
        title: 'The William Vale',
        subtitle: '2 nights',
        startTime: createDate(0, 23, 0),
        endTime: createDate(2, 11, 0),
        location: 'Brooklyn, NY',
        address: '111 N 12th St, Brooklyn, NY 11249',
        confirmationNumber: '89234521',
        status: 'confirmed',
        details: {
          'Room': 'King Suite, City View',
          'Check-in': '3:00 PM',
          'Check-out': '11:00 AM',
          'WiFi': 'Complimentary',
        },
      },
      {
        id: 'res-3',
        tripId: 'trip-1',
        type: 'meeting',
        title: 'Pitch Meeting',
        subtitle: 'Acme Ventures',
        startTime: createDate(1, 10, 0),
        endTime: createDate(1, 11, 30),
        location: 'Acme Ventures HQ',
        address: '350 5th Ave, New York, NY 10118',
        status: 'confirmed',
        details: {
          'Contact': 'Sarah Johnson',
          'Floor': '42nd',
          'Attendees': '4',
        },
      },
      {
        id: 'res-4',
        tripId: 'trip-1',
        type: 'flight',
        title: 'AA 291',
        subtitle: 'JFK → SFO',
        startTime: createDate(2, 19, 20),
        endTime: createDate(2, 22, 45),
        location: 'John F. Kennedy International Airport',
        address: 'Terminal 8, Gate 47',
        confirmationNumber: 'XKWP7M',
        status: 'confirmed',
        details: {
          'Seat': '8F (Window)',
          'Class': 'Business',
          'Duration': '6h 25m',
          'Aircraft': 'Airbus A321',
        },
      },
    ],
    receipts: [
      {
        id: 'receipt-1',
        tripId: 'trip-1',
        merchant: 'Uber',
        amount: 47.50,
        currency: 'USD',
        date: createDate(0, 14, 0),
        category: 'transport',
        status: 'pending',
      },
    ],
  },
  {
    id: 'trip-2',
    name: 'Austin Tech Summit',
    destination: 'Austin, TX',
    startDate: createDate(7, 0),
    endDate: createDate(9, 23, 59),
    coverImage: 'https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=800',
    status: 'upcoming',
    reservations: [
      {
        id: 'res-5',
        tripId: 'trip-2',
        type: 'flight',
        title: 'UA 1547',
        subtitle: 'SFO → AUS',
        startTime: createDate(7, 7, 30),
        endTime: createDate(7, 12, 45),
        location: 'San Francisco International Airport',
        address: 'Terminal 3, Gate F8',
        confirmationNumber: 'B7K92L',
        status: 'confirmed',
        details: {
          'Seat': '4A (Window)',
          'Class': 'First',
          'Duration': '3h 15m',
        },
      },
      {
        id: 'res-6',
        tripId: 'trip-2',
        type: 'hotel',
        title: 'Austin Proper Hotel',
        subtitle: '2 nights',
        startTime: createDate(7, 15, 0),
        endTime: createDate(9, 12, 0),
        location: 'Downtown Austin',
        address: '600 W 2nd St, Austin, TX 78701',
        confirmationNumber: 'APH-77291',
        status: 'confirmed',
        details: {
          'Room': 'Proper Room King',
          'Check-in': '3:00 PM',
          'Check-out': '12:00 PM',
        },
      },
      {
        id: 'res-7',
        tripId: 'trip-2',
        type: 'car',
        title: 'Tesla Model 3',
        subtitle: 'Enterprise',
        startTime: createDate(7, 13, 0),
        endTime: createDate(9, 12, 0),
        location: 'Austin-Bergstrom Airport',
        address: 'Rental Car Center',
        confirmationNumber: 'ENT-882341',
        status: 'confirmed',
        details: {
          'Pickup': '1:00 PM',
          'Return': '12:00 PM',
          'Insurance': 'Full Coverage',
        },
      },
      {
        id: 'res-8',
        tripId: 'trip-2',
        type: 'event',
        title: 'Tech Summit 2025',
        subtitle: 'Main Stage Pass',
        startTime: createDate(8, 9, 0),
        endTime: createDate(8, 18, 0),
        location: 'Austin Convention Center',
        address: '500 E Cesar Chavez St, Austin, TX 78701',
        confirmationNumber: 'TS25-VIP-4421',
        status: 'confirmed',
        details: {
          'Badge': 'VIP',
          'Sessions': 'All Access',
        },
      },
    ],
    receipts: [],
  },
  {
    id: 'trip-3',
    name: 'London Board Meeting',
    destination: 'London, UK',
    startDate: createDate(-14, 0),
    endDate: createDate(-11, 23, 59),
    coverImage: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800',
    status: 'completed',
    reservations: [
      {
        id: 'res-9',
        tripId: 'trip-3',
        type: 'flight',
        title: 'BA 286',
        subtitle: 'SFO → LHR',
        startTime: createDate(-14, 16, 30),
        endTime: createDate(-13, 11, 15),
        location: 'San Francisco International Airport',
        confirmationNumber: 'G7HK92',
        status: 'completed',
        details: {
          'Seat': '2K (Window)',
          'Class': 'Business',
        },
      },
    ],
    receipts: [
      {
        id: 'receipt-2',
        tripId: 'trip-3',
        merchant: 'British Airways',
        amount: 4250.00,
        currency: 'USD',
        date: createDate(-20, 10, 0),
        category: 'transport',
        status: 'approved',
      },
      {
        id: 'receipt-3',
        tripId: 'trip-3',
        merchant: 'The Ned London',
        amount: 892.00,
        currency: 'GBP',
        date: createDate(-14, 15, 0),
        category: 'lodging',
        status: 'approved',
      },
    ],
  },
];

export const useTripStore = create<TripStore>((set, get) => ({
  trips: mockTrips,
  user: mockUser,
  isLoading: false,

  setTrips: (trips) => set({ trips }),
  setUser: (user) => set({ user }),

  addTrip: (trip) => set((state) => ({ trips: [...state.trips, trip] })),

  updateTrip: (tripId, updates) =>
    set((state) => ({
      trips: state.trips.map((trip) =>
        trip.id === tripId ? { ...trip, ...updates } : trip
      ),
    })),

  addReservation: (tripId, reservation) =>
    set((state) => ({
      trips: state.trips.map((trip) =>
        trip.id === tripId
          ? {
              ...trip,
              reservations: [...trip.reservations, reservation].sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              ),
            }
          : trip
      ),
    })),

  getActiveTrip: () => {
    const { trips } = get();
    return trips.find((trip) => trip.status === 'active');
  },

  getUpcomingReservations: (hours = 24) => {
    const { trips } = get();
    const now = new Date();
    const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const allReservations: Reservation[] = [];
    trips
      .filter((trip) => trip.status === 'active' || trip.status === 'upcoming')
      .forEach((trip) => {
        trip.reservations.forEach((res) => {
          if (res.startTime >= now && res.startTime <= cutoff) {
            allReservations.push(res);
          }
        });
      });

    return allReservations.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
  },

  getTodayReservations: () => {
    const { trips } = get();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const allReservations: Reservation[] = [];
    trips
      .filter((trip) => trip.status === 'active' || trip.status === 'upcoming')
      .forEach((trip) => {
        trip.reservations.forEach((res) => {
          if (res.startTime >= startOfDay && res.startTime < endOfDay) {
            allReservations.push(res);
          }
        });
      });

    return allReservations.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
  },

  getMissingReceipts: () => {
    const { trips } = get();
    const missing: { trip: Trip; reservation: Reservation }[] = [];

    trips
      .filter((trip) => trip.status === 'active' || trip.status === 'completed')
      .forEach((trip) => {
        trip.reservations
          .filter(
            (res) =>
              (res.type === 'flight' || res.type === 'hotel' || res.type === 'car') &&
              res.status === 'completed'
          )
          .forEach((res) => {
            const hasReceipt = trip.receipts.some(
              (receipt) => receipt.reservationId === res.id
            );
            if (!hasReceipt) {
              missing.push({ trip, reservation: res });
            }
          });
      });

    return missing;
  },
}));
