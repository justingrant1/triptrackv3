import { create } from 'zustand';

interface TripStore {
  selectedTripId: string | null;
  setSelectedTripId: (id: string | null) => void;
}

export const useTripStore = create<TripStore>((set) => ({
  selectedTripId: null,
  setSelectedTripId: (id) => set({ selectedTripId: id }),
}));
