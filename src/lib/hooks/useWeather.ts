/**
 * Weather hook using React Query
 * Fetches real weather data from OpenWeatherMap API
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getWeatherForDestination, WeatherData } from '../weather';

/**
 * Hook to fetch weather for a destination.
 * 
 * Caches for 30 minutes — weather doesn't change fast enough to justify
 * frequent refetches, and this dramatically reduces API calls when
 * rendering multiple TripCards on the trips screen.
 */
export function useWeather(destination: string | undefined) {
  return useQuery({
    queryKey: queryKeys.weather.byLocation(destination),
    queryFn: () => getWeatherForDestination(destination!),
    enabled: !!destination,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour (keep in cache even when unused)
  });
}
