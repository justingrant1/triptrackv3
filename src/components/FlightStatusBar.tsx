/**
 * FlightStatusBar Component
 *
 * Visual flight journey timeline showing:
 * Scheduled → Boarding → Departed → In Flight → Landed
 *
 * Color coding: green (on-time), amber (delayed), red (cancelled).
 * Shows key details inline: gate, terminal, boarding time, delay amount.
 * Hero element on flight reservation cards.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Plane, Clock, MapPin, Luggage, AlertTriangle } from 'lucide-react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { FlightStatusData, FlightStep } from '@/lib/flight-status';
import {
  getActiveFlightStep,
  getFlightPhaseLabel,
  getFlightPhaseColor,
  getDelayColor,
  formatDelay,
  getFlightProgress,
  inferFlightPhase,
} from '@/lib/flight-status';
import { formatTime, formatTimeFromISO } from '@/lib/utils';

interface FlightStatusBarProps {
  status: FlightStatusData;
  compact?: boolean;
}

const STEPS: { key: FlightStep; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'boarding', label: 'Boarding' },
  { key: 'departed', label: 'Departed' },
  { key: 'in_flight', label: 'In Flight' },
  { key: 'landed', label: 'Landed' },
];

const STEP_INDEX: Record<FlightStep, number> = {
  scheduled: 0,
  boarding: 1,
  departed: 2,
  in_flight: 3,
  landed: 4,
};

function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        },
      ]}
    />
  );
}

export function FlightStatusBar({ status, compact = false }: FlightStatusBarProps) {
  const activeStep = getActiveFlightStep(status);
  const activeIndex = STEP_INDEX[activeStep];
  const effectivePhase = inferFlightPhase(status);
  const phaseColor = getFlightPhaseColor(status.flight_status, status);
  const delayMinutes = status.dep_delay;
  const delayColor = getDelayColor(delayMinutes);
  const delayText = formatDelay(delayMinutes);
  const isCancelled = effectivePhase === 'cancelled';
  const isDiverted = effectivePhase === 'diverted';

  if (compact) {
    return <CompactFlightStatus status={status} />;
  }

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <View className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
        {/* Header: Status + Delay */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            {phaseColor.pulse ? (
              <PulsingDot color={phaseColor.dot} />
            ) : (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: phaseColor.dot,
                }}
              />
            )}
            <Text
              className="text-sm font-semibold ml-2"
              style={{ color: phaseColor.text, fontFamily: 'DMSans_700Bold' }}
            >
              {isCancelled
                ? 'Cancelled'
                : isDiverted
                  ? 'Diverted'
                  : getFlightPhaseLabel(status.flight_status, status)}
            </Text>
          </View>

          {delayText && !isCancelled && (
            <View
              className="px-2.5 py-1 rounded-full"
              style={{ backgroundColor: delayColor + '20' }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: delayColor, fontFamily: 'DMSans_700Bold' }}
              >
                {delayText}
              </Text>
            </View>
          )}

          {!delayText && !isCancelled && !isDiverted && status.flight_status !== 'unknown' && (
            <View className="px-2.5 py-1 rounded-full bg-emerald-500/20">
              <Text
                className="text-xs font-semibold text-emerald-400"
                style={{ fontFamily: 'DMSans_700Bold' }}
              >
                On Time
              </Text>
            </View>
          )}
        </View>

        {/* Progress Steps */}
        {!isCancelled && !isDiverted && (
          <View className="flex-row items-center mb-4">
            {STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              const isCompleted = index < activeIndex;
              const isFuture = index > activeIndex;

              return (
                <React.Fragment key={step.key}>
                  {/* Dot */}
                  <View className="items-center">
                    <View
                      style={{
                        width: isActive ? 12 : 8,
                        height: isActive ? 12 : 8,
                        borderRadius: isActive ? 6 : 4,
                        backgroundColor: isCompleted
                          ? '#10B981'
                          : isActive
                            ? phaseColor.dot
                            : '#334155',
                        borderWidth: isActive ? 2 : 0,
                        borderColor: isActive ? phaseColor.dot + '40' : 'transparent',
                      }}
                    />
                    <Text
                      className="text-center mt-1"
                      style={{
                        fontSize: 9,
                        color: isActive
                          ? phaseColor.text
                          : isCompleted
                            ? '#94A3B8'
                            : '#475569',
                        fontFamily: isActive ? 'DMSans_700Bold' : 'DMSans_400Regular',
                      }}
                    >
                      {step.label}
                    </Text>
                  </View>

                  {/* Connector line */}
                  {index < STEPS.length - 1 && (
                    <View
                      className="flex-1 mx-1"
                      style={{
                        height: 2,
                        backgroundColor: isCompleted ? '#10B981' : '#334155',
                        marginBottom: 14, // offset for label below dots
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}

        {/* Key Details Grid */}
        <View className="flex-row flex-wrap gap-3">
          {/* Gate */}
          {status.dep_gate && (
            <DetailChip
              icon={<MapPin size={12} color="#94A3B8" />}
              label="Gate"
              value={status.dep_gate}
              highlight={!!status.dep_gate}
            />
          )}

          {/* Terminal */}
          {status.dep_terminal && (
            <DetailChip
              icon={<MapPin size={12} color="#94A3B8" />}
              label="Terminal"
              value={status.dep_terminal}
            />
          )}

          {/* Boarding Time (estimated departure - 30 min) — only when still scheduled */}
          {status.dep_estimated && effectivePhase === 'scheduled' && (
            <DetailChip
              icon={<Clock size={12} color="#94A3B8" />}
              label="Boarding"
              value={formatBoardingTime(status.dep_estimated)}
            />
          )}

          {/* Actual Departure */}
          {status.dep_actual && (
            <DetailChip
              icon={<Plane size={12} color="#94A3B8" />}
              label="Departed"
              value={formatTimeFromISO(status.dep_actual)}
            />
          )}

          {/* Estimated Arrival — show when inferred as active (in flight) */}
          {status.arr_estimated && effectivePhase === 'active' && (
            <DetailChip
              icon={<Clock size={12} color="#94A3B8" />}
              label="ETA"
              value={formatTimeFromISO(status.arr_estimated)}
            />
          )}

          {/* Arrival Terminal */}
          {status.arr_terminal && (
            <DetailChip
              icon={<MapPin size={12} color="#94A3B8" />}
              label="Arr. Terminal"
              value={status.arr_terminal}
            />
          )}

          {/* Baggage */}
          {status.arr_baggage && (
            <DetailChip
              icon={<Luggage size={12} color="#94A3B8" />}
              label="Baggage"
              value={`Carousel ${status.arr_baggage}`}
              highlight
            />
          )}
        </View>

        {/* Last checked timestamp */}
        {status.last_checked && (
          <Text
            className="text-slate-600 text-xs mt-3"
            style={{ fontFamily: 'SpaceMono_400Regular' }}
          >
            Updated {formatTimeAgo(status.last_checked)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Compact version for inline display (Today screen, reservation cards).
 * Shows just the key info: status dot, gate, delay.
 */
function CompactFlightStatus({ status }: { status: FlightStatusData }) {
  const effectivePhase = inferFlightPhase(status);
  const phaseColor = getFlightPhaseColor(status.flight_status, status);
  const delayText = formatDelay(status.dep_delay);
  const delayColor = getDelayColor(status.dep_delay);
  const isCancelled = effectivePhase === 'cancelled';

  return (
    <View className="flex-row items-center flex-wrap gap-2">
      {/* Status */}
      <View
        className="flex-row items-center px-2 py-1 rounded-lg"
        style={{ backgroundColor: phaseColor.bg }}
      >
        {phaseColor.pulse ? (
          <PulsingDot color={phaseColor.dot} />
        ) : (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: phaseColor.dot,
            }}
          />
        )}
        <Text
          className="text-xs font-semibold ml-1.5"
          style={{ color: phaseColor.text, fontFamily: 'DMSans_700Bold' }}
        >
          {isCancelled ? 'Cancelled' : getFlightPhaseLabel(status.flight_status, status)}
        </Text>
      </View>

      {/* Gate */}
      {status.dep_gate && (
        <View className="flex-row items-center px-2 py-1 rounded-lg bg-slate-700/30">
          <Text
            className="text-slate-400 text-xs"
            style={{ fontFamily: 'DMSans_500Medium' }}
          >
            Gate{' '}
          </Text>
          <Text
            className="text-white text-xs font-bold"
            style={{ fontFamily: 'SpaceMono_700Bold' }}
          >
            {status.dep_gate}
          </Text>
        </View>
      )}

      {/* Terminal */}
      {status.dep_terminal && (
        <View className="flex-row items-center px-2 py-1 rounded-lg bg-slate-700/30">
          <Text
            className="text-slate-400 text-xs"
            style={{ fontFamily: 'DMSans_500Medium' }}
          >
            T{status.dep_terminal}
          </Text>
        </View>
      )}

      {/* Delay */}
      {delayText && !isCancelled && (
        <View
          className="px-2 py-1 rounded-lg"
          style={{ backgroundColor: delayColor + '20' }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: delayColor, fontFamily: 'DMSans_700Bold' }}
          >
            {delayText}
          </Text>
        </View>
      )}

      {/* On Time badge */}
      {!delayText && !isCancelled && status.flight_status !== 'unknown' && (
        <View className="px-2 py-1 rounded-lg bg-emerald-500/15">
          <Text
            className="text-xs font-semibold text-emerald-400"
            style={{ fontFamily: 'DMSans_700Bold' }}
          >
            On Time
          </Text>
        </View>
      )}

      {/* Baggage */}
      {status.arr_baggage && (
        <View className="flex-row items-center px-2 py-1 rounded-lg bg-blue-500/15">
          <Text
            className="text-blue-400 text-xs font-semibold"
            style={{ fontFamily: 'DMSans_700Bold' }}
          >
            Baggage #{status.arr_baggage}
          </Text>
        </View>
      )}
    </View>
  );
}

function DetailChip({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      className="flex-row items-center px-3 py-2 rounded-xl"
      style={{
        backgroundColor: highlight ? '#3B82F610' : '#1E293B80',
        borderWidth: highlight ? 1 : 0,
        borderColor: highlight ? '#3B82F630' : 'transparent',
      }}
    >
      {icon}
      <View className="ml-2">
        <Text
          className="text-slate-500"
          style={{ fontSize: 9, fontFamily: 'DMSans_400Regular' }}
        >
          {label}
        </Text>
        <Text
          className="text-white text-sm font-bold"
          style={{ fontFamily: 'SpaceMono_700Bold' }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function formatBoardingTime(depEstimated: string): string {
  try {
    // Parse the time from the ISO string directly to avoid timezone conversion
    const match = depEstimated.match(/T(\d{2}):(\d{2})/);
    if (match) {
      let hours = parseInt(match[1], 10);
      let minutes = parseInt(match[2], 10);
      // Subtract 30 minutes for boarding time
      minutes -= 30;
      if (minutes < 0) {
        minutes += 60;
        hours -= 1;
        if (hours < 0) hours += 24;
      }
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `${displayHours}:${displayMinutes} ${period}`;
    }
    // Fallback
    const dep = new Date(depEstimated);
    const boarding = new Date(dep.getTime() - 30 * 60 * 1000);
    return formatTime(boarding);
  } catch {
    return '—';
  }
}

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatTime(date);
  } catch {
    return '';
  }
}
