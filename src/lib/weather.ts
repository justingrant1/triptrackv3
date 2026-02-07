// Real weather data using OpenWeatherMap API

export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'foggy';

export interface WeatherData {
  condition: WeatherCondition;
  temperature: number;
  high: number;
  low: number;
  description?: string;
  humidity?: number;
  windSpeed?: number;
}

// OpenWeatherMap API (free tier: 1000 calls/day)
import Constants from 'expo-constants';

const OPENWEATHER_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_OPENWEATHER_API_KEY || 
                             process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || 
                             'ca9d55c7295f703e4b7c538996845a85'; // Fallback to hardcoded key
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Cache for weather data (5 minutes)
const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Map OpenWeatherMap condition codes to our simplified conditions
 */
function mapWeatherCondition(weatherCode: number, description: string): WeatherCondition {
  // Thunderstorm (200-232)
  if (weatherCode >= 200 && weatherCode < 300) return 'stormy';
  
  // Drizzle (300-321) or Rain (500-531)
  if ((weatherCode >= 300 && weatherCode < 400) || (weatherCode >= 500 && weatherCode < 600)) {
    return 'rainy';
  }
  
  // Snow (600-622)
  if (weatherCode >= 600 && weatherCode < 700) return 'snowy';
  
  // Atmosphere (fog, mist, etc.) (700-781)
  if (weatherCode >= 700 && weatherCode < 800) return 'foggy';
  
  // Clear (800)
  if (weatherCode === 800) return 'sunny';
  
  // Clouds (801-804)
  if (weatherCode > 800 && weatherCode < 900) {
    // Few clouds or scattered clouds
    if (weatherCode === 801 || weatherCode === 802) return 'partly_cloudy';
    // Broken or overcast clouds
    return 'cloudy';
  }
  
  return 'partly_cloudy';
}

/**
 * Fetch weather data from OpenWeatherMap API
 */
async function fetchWeatherData(destination: string): Promise<WeatherData | null> {
  try {
    // Check cache first
    const cached = weatherCache.get(destination);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('☀️ Using cached weather for:', destination);
      return cached.data;
    }

    console.log('🌤️ Fetching weather for:', destination);

    // Fetch current weather
    const response = await fetch(
      `${OPENWEATHER_BASE_URL}/weather?q=${encodeURIComponent(destination)}&units=imperial&appid=${OPENWEATHER_API_KEY}`
    );

    if (!response.ok) {
      console.warn('Weather API error:', response.status);
      return null;
    }

    const data = await response.json();

    const weatherData: WeatherData = {
      condition: mapWeatherCondition(data.weather[0].id, data.weather[0].description),
      temperature: Math.round(data.main.temp),
      high: Math.round(data.main.temp_max),
      low: Math.round(data.main.temp_min),
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
    };

    // Cache the result
    weatherCache.set(destination, { data: weatherData, timestamp: Date.now() });

    return weatherData;
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return null;
  }
}

/**
 * Get weather for a destination (with fallback to mock data)
 */
export async function getWeatherForDestination(destination: string): Promise<WeatherData> {
  const weatherData = await fetchWeatherData(destination);
  
  if (weatherData) {
    return weatherData;
  }

  // Fallback to default weather if API fails
  console.log('⚠️ Using fallback weather for:', destination);
  return {
    condition: 'partly_cloudy',
    temperature: 65,
    high: 70,
    low: 55,
    description: 'Partly cloudy',
  };
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
