// Weather types and mock data for destinations

export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'foggy';

export interface WeatherData {
  condition: WeatherCondition;
  temperature: number;
  high: number;
  low: number;
}

// Mock weather data by destination
const destinationWeather: Record<string, WeatherData> = {
  'New York City': {
    condition: 'partly_cloudy',
    temperature: 42,
    high: 45,
    low: 34,
  },
  'Austin, TX': {
    condition: 'sunny',
    temperature: 72,
    high: 78,
    low: 58,
  },
  'London, UK': {
    condition: 'rainy',
    temperature: 48,
    high: 52,
    low: 42,
  },
};

const defaultWeather: WeatherData = {
  condition: 'partly_cloudy',
  temperature: 65,
  high: 70,
  low: 55,
};

export function getWeatherForDestination(destination: string): WeatherData {
  return destinationWeather[destination] ?? defaultWeather;
}

export function getWeatherIcon(condition: WeatherCondition): string {
  const icons: Record<WeatherCondition, string> = {
    sunny: '☀️',
    partly_cloudy: '⛅',
    cloudy: '☁️',
    rainy: '🌧️',
    stormy: '⛈️',
    snowy: '❄️',
    foggy: '🌫️',
  };
  return icons[condition];
}
