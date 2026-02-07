/**
 * Weather hook using React Query
 * Fetches real weather data from OpenWeatherMap API
 */

import { useQuery } from '@tanstack/react-query';
import { getWeatherForDestination, WeatherData } from '../weather';

/**
 * Hook to fetch weather for a destination
 * Caches for 5 minutes to avoid excessive API calls
 */
export function useWeather(destination: string | undefined) {
  return useQuery({
    queryKey: ['weather', destination],
    queryFn: () => getWeatherForDestination(destination!),
    enabled: !!destination,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
}
