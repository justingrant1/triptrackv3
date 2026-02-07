import { z } from 'zod';

/**
 * Validation schemas for TripTrack forms
 */

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

// Trip schemas
export const tripSchema = z.object({
  name: z.string().min(1, 'Trip name is required').max(100, 'Trip name is too long'),
  destination: z.string().min(1, 'Destination is required').max(100, 'Destination is too long'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  cover_image: z.string().url('Invalid image URL').optional().nullable(),
}).refine((data) => {
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  return end >= start;
}, {
  message: 'End date must be after start date',
  path: ['end_date'],
});

// Reservation schemas
export const reservationSchema = z.object({
  trip_id: z.string().uuid('Invalid trip ID'),
  type: z.enum(['flight', 'hotel', 'car', 'train', 'meeting', 'event'], {
    message: 'Please select a reservation type',
  }),
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  subtitle: z.string().max(200, 'Subtitle is too long').optional().nullable(),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().optional().nullable(),
  address: z.string().max(500, 'Address is too long').optional().nullable(),
  confirmation_number: z.string().max(100, 'Confirmation number is too long').optional().nullable(),
  status: z.enum(['confirmed', 'delayed', 'cancelled', 'completed']).default('confirmed'),
  alert_message: z.string().max(500, 'Alert message is too long').optional().nullable(),
}).refine((data) => {
  if (data.end_time) {
    const start = new Date(data.start_time);
    const end = new Date(data.end_time);
    return end >= start;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['end_time'],
});

// Receipt schemas
export const receiptSchema = z.object({
  trip_id: z.string().uuid('Invalid trip ID'),
  merchant: z.string().min(1, 'Merchant name is required').max(200, 'Merchant name is too long'),
  amount: z.number().positive('Amount must be greater than 0').max(1000000, 'Amount is too large'),
  currency: z.string().length(3, 'Currency must be 3 characters (e.g., USD)').default('USD'),
  category: z.string().min(1, 'Category is required').max(100, 'Category is too long'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().max(1000, 'Notes are too long').optional().nullable(),
  image_url: z.string().url('Invalid image URL').optional().nullable(),
});

// Profile schemas
export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().email('Please enter a valid email address'),
  avatar_url: z.string().url('Invalid avatar URL').optional().nullable(),
});

// Trusted email schemas
export const trustedEmailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  label: z.string().min(1, 'Label is required').max(100, 'Label is too long').optional().nullable(),
});

/**
 * Helper function to validate data against a schema
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: Record<string, string>;
} {
  try {
    const validData = schema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { _general: 'Validation failed' } };
  }
}

/**
 * Helper function to get a single field error
 */
export function getFieldError(errors: Record<string, string> | undefined, field: string): string | undefined {
  return errors?.[field];
}

// Type exports for use in components
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type TripInput = z.infer<typeof tripSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type TrustedEmailInput = z.infer<typeof trustedEmailSchema>;
