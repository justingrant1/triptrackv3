/**
 * Smart Gmail Trip Scanner — Edge Function
 * 
 * Scans a connected Gmail account for real travel emails,
 * extracts trip details (including from PDF attachments),
 * and auto-creates trips/reservations in the database.
 * 
 * DATABASE PREREQUISITE — Run this SQL in Supabase:
 * 
 * CREATE TABLE IF NOT EXISTS processed_gmail_messages (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id uuid REFERENCES auth.users NOT NULL,
 *   gmail_message_id text NOT NULL,
 *   status text NOT NULL DEFAULT 'processed',
 *   processed_at timestamptz NOT NULL DEFAULT now(),
 *   UNIQUE(user_id, gmail_message_id)
 * );
 * CREATE INDEX idx_processed_gmail_user_message
 *   ON processed_gmail_messages(user_id, gmail_message_id);
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// CORS
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// TypeScript Interfaces
// ============================================================

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  pdfAttachments: PdfAttachmentInfo[];
  rawPayload: any;
}

interface PdfAttachmentInfo {
  attachmentId: string;
  filename: string;
  size: number;
}

interface ImageAttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface ClassificationResult {
  is_real_trip: boolean;
  confidence: number;
  rejection_reason: string | null;
}

interface ParsedTripData {
  type: string;
  title: string;
  subtitle: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  address: string | null;
  confirmation_number: string | null;
  details: Record<string, any>;
  destination: string;
  country: string | null;
  region: string | null;
  trip_dates: { start: string; end: string };
  error?: string;
}

interface ScanStats {
  messagesScanned: number;
  skippedAlreadyProcessed: number;
  skippedByClassifier: number;
  skippedPastTrips: number;
  emailsProcessed: number;
  tripsCreated: number;
  reservationsCreated: number;
  pdfAttachmentsProcessed: number;
  duplicatesSkipped: number;
  errors: number;
  stoppedEarly: boolean;
  has_more: boolean;
}

// ============================================================
// Known Travel Sender Domains
// ============================================================

/**
 * Strip timezone offset from an ISO datetime string.
 * Ensures local times are stored as-is without UTC conversion by PostgreSQL's timestamptz.
 * e.g., "2026-02-12T10:10:00-08:00" → "2026-02-12T10:10:00"
 *       "2026-02-12T10:10:00Z"       → "2026-02-12T10:10:00"
 *       "2026-02-12T10:10:00"         → "2026-02-12T10:10:00" (unchanged)
 */
function stripTimezoneOffset(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  return isoString.replace(/([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)(Z|[+-]\d{2}:?\d{2})$/i, '$1');
}

const KNOWN_TRAVEL_DOMAINS = new Set([
  // Airlines — US
  'delta.com', 'united.com', 'aa.com', 'americanairlines.com',
  'southwest.com', 'jetblue.com', 'alaskaair.com', 'spirit.com',
  'flyfrontier.com', 'frontier.com', 'hawaiianairlines.com',
  'allegiantair.com', 'suncountry.com', 'breeze.com',
  // Airlines — Canada
  'aircanada.com', 'westjet.com', 'porterairlines.com',
  // Airlines — Europe
  'britishairways.com', 'lufthansa.com', 'airfrance.com', 'klm.com',
  'iberia.com', 'vueling.com', 'ryanair.com', 'easyjet.com',
  'norwegian.com', 'finnair.com', 'sas.se', 'swiss.com',
  'turkishairlines.com', 'thy.com', 'aeroflot.com', 'tap.pt',
  'aegeanair.com', 'lot.com', 'icelandair.com', 'brusselsairlines.com',
  // Airlines — Middle East / Asia / Oceania
  'emirates.com', 'qatarairways.com', 'etihad.com',
  'singaporeair.com', 'cathaypacific.com', 'ana.co.jp', 'jal.co.jp',
  'koreanair.com', 'asiana.com', 'thaiairways.com',
  'vietnamairlines.com', 'airchina.com', 'csair.com',
  'qantas.com', 'virginaustralia.com', 'airnewzealand.co.nz',
  // Airlines — Latin America
  'latam.com', 'avianca.com', 'aeromexico.com', 'copaair.com',
  'volaris.com', 'vivaaerobus.com', 'azul.com.br', 'gol.com.br',
  // Hotels
  'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com',
  'wyndhamhotels.com', 'choicehotels.com', 'bestwestern.com',
  'accor.com', 'fourseasons.com', 'ritzcarlton.com',
  'starwoodhotels.com', 'radissonhotels.com', 'omnihotels.com',
  'loewshotels.com', 'sonesta.com', 'melia.com',
  'shangri-la.com', 'mandarinoriental.com', 'rosewoodhotels.com',
  'fairmont.com', 'kempinski.com', 'aman.com',
  // Booking Platforms
  'booking.com', 'expedia.com', 'hotels.com', 'priceline.com',
  'kayak.com', 'orbitz.com', 'travelocity.com', 'hotwire.com',
  'tripadvisor.com', 'agoda.com', 'trip.com', 'skyscanner.com',
  'cheapflights.com', 'momondo.com', 'kiwi.com',
  'google.com', 'travelport.com',
  // Vacation Rentals
  'airbnb.com', 'vrbo.com', 'homeaway.com', 'vacasa.com',
  'turnkeyvr.com', 'evolve.com', 'hipcamp.com',
  // Car Rentals
  'hertz.com', 'enterprise.com', 'avis.com', 'budget.com',
  'nationalcar.com', 'alamo.com', 'sixt.com', 'europcar.com',
  'turo.com', 'zipcar.com', 'foxrentacar.com', 'paylesscar.com',
  'dollar.com', 'thrifty.com',
  // Rail
  'amtrak.com', 'eurostar.com', 'thetrainline.com', 'viarail.ca',
  'renfe.com', 'trenitalia.com', 'sncf.com', 'bahn.de',
  'raileurope.com', 'seat61.com', 'brightline.com',
  // Cruises
  'royalcaribbean.com', 'carnival.com', 'ncl.com', 'princess.com',
  'hollandamerica.com', 'celebritycruises.com', 'vikingcruises.com',
  'msccruises.com', 'disneycruise.com', 'cunard.com',
  'silversea.com', 'seabourn.com', 'oceania.com',
  // Corporate Travel
  'concur.com', 'egencia.com', 'navan.com', 'tripactions.com',
  'amexgbt.com', 'cwt.com', 'bcd.travel', 'travelleaders.com',
  // Other Travel Services
  'viator.com', 'getyourguide.com', 'klook.com',
  'flightaware.com', 'seatguru.com',
]);

/**
 * Check if the sender email is from a known travel domain.
 * Checks both the exact domain and the parent domain.
 * e.g. noreply@email.delta.com -> checks "email.delta.com" AND "delta.com"
 */
function isKnownTravelSender(fromHeader: string): boolean {
  // Extract email from "Name <email@domain.com>" or plain "email@domain.com"
  const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
  if (!emailMatch) return false;

  const email = emailMatch[1].toLowerCase();
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return false;

  const domain = email.substring(atIndex + 1);

  // Check exact domain
  if (KNOWN_TRAVEL_DOMAINS.has(domain)) return true;

  // Check parent domain (e.g., email.delta.com -> delta.com)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join('.');
    if (KNOWN_TRAVEL_DOMAINS.has(parentDomain)) return true;

    // Also check 3-part TLDs like co.jp, co.uk, com.br
    if (parts.length > 3) {
      const parentDomain3 = parts.slice(-3).join('.');
      if (KNOWN_TRAVEL_DOMAINS.has(parentDomain3)) return true;
    }
  }

  return false;
}

// ============================================================
// Gmail Search Query
// ============================================================

/** Top known sender domains to include in the Gmail from: filter */
const SEARCH_SENDER_DOMAINS = [
  'delta.com', 'united.com', 'aa.com', 'southwest.com', 'jetblue.com',
  'alaskaair.com', 'spirit.com', 'frontier.com', 'hawaiianairlines.com',
  'britishairways.com', 'lufthansa.com', 'airfrance.com', 'emirates.com',
  'qatarairways.com', 'singaporeair.com', 'ryanair.com', 'easyjet.com',
  'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'bestwestern.com',
  'accor.com', 'fourseasons.com', 'radissonhotels.com',
  'booking.com', 'expedia.com', 'hotels.com', 'priceline.com', 'kayak.com',
  'orbitz.com', 'travelocity.com', 'agoda.com', 'trip.com',
  'airbnb.com', 'vrbo.com', 'vacasa.com',
  'hertz.com', 'enterprise.com', 'avis.com', 'budget.com', 'nationalcar.com',
  'alamo.com', 'sixt.com', 'turo.com',
  'amtrak.com', 'eurostar.com', 'thetrainline.com',
  'royalcaribbean.com', 'carnival.com', 'ncl.com', 'princess.com',
  'concur.com', 'egencia.com', 'navan.com',
];

/**
 * Build a smart Gmail search query that targets real travel emails.
 * Uses travel-specific subject phrases + known sender combos + negative exclusions.
 */
function buildTravelSearchQuery(): string {
  // Date filter: last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateFilter = `after:${sixMonthsAgo.getFullYear()}/${sixMonthsAgo.getMonth() + 1}/${sixMonthsAgo.getDate()}`;

  // Travel-specific subject phrases (high signal, low noise)
  const travelSubjectPhrases = [
    '"boarding pass"', '"flight confirmation"', '"e-ticket"',
    '"itinerary receipt"', '"airline confirmation"', '"flight itinerary"',
    '"hotel confirmation"', '"hotel reservation"', '"check-in details"',
    '"room reservation"', '"stay confirmation"', '"property reservation"',
    '"rental confirmation"', '"car rental"', '"vehicle reservation"',
    '"pickup confirmation"', '"rental agreement"',
    '"train ticket"', '"rail confirmation"', '"train reservation"',
    '"trip confirmation"', '"travel itinerary"', '"travel confirmation"',
    '"booking confirmation"', '"reservation confirmation"',
    '"cruise confirmation"', '"sailing confirmation"', '"embarkation"',
  ];

  // Known sender domains + generic keywords combo
  const senderDomainFilter = SEARCH_SENDER_DOMAINS.map(d => `from:${d}`).join(' OR ');
  const genericKeywords = 'subject:(confirmation OR reservation OR itinerary OR receipt OR booking OR e-ticket)';

  // Negative exclusions to filter noise
  const negativeExclusions = '-subject:(unsubscribe OR invitation OR coupon OR sale OR promo OR newsletter OR digest OR weekly OR survey OR "rate your" OR "how was" OR "leave a review" OR "earn points" OR "special offer" OR "limited time")';

  // Label exclusions
  const labelExclusions = '-label:spam -label:promotions';

  // Forwarded email detection — catch travel emails forwarded by friends/colleagues
  // Gmail searches body content by default, so these will match body text too
  const forwardedFilter = `(subject:(fwd OR forwarded) ("confirmation number" OR "booking reference" OR "record locator" OR "e-ticket" OR "boarding pass" OR "flight" OR "hotel reservation" OR "car rental"))`;

  // Body-level travel content — catches emails where travel info is in the body
  // even if the subject is casual (e.g., friend forwarding "here's our flight info")
  const bodyTravelContent = `("record locator" OR "confirmation number" OR "e-ticket number" OR "booking reference" OR "boarding pass")`;

  // Combine: date AND (travel phrases OR known-sender+generic OR forwarded-travel OR body-content) AND NOT noise
  const query = [
    dateFilter,
    labelExclusions,
    negativeExclusions,
    `(subject:(${travelSubjectPhrases.join(' OR ')}) OR ((${senderDomainFilter}) ${genericKeywords}) OR ${forwardedFilter} OR ${bodyTravelContent})`,
  ].join(' ');

  return query;
}

/**
 * Search Gmail for travel-related emails using the smart query.
 */
async function searchGmailForTravelEmails(
  accessToken: string,
  maxResults: number = 50
): Promise<GmailMessage[]> {
  const query = buildTravelSearchQuery();

  console.log('Gmail search query length:', query.length);

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API search error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.messages || [];
}

// ============================================================
// Email Body Extraction (Recursive)
// ============================================================

/**
 * Decode Gmail's base64url-encoded data to a UTF-8 string.
 * Gmail uses URL-safe base64 (- instead of +, _ instead of /).
 */
function decodeBase64Url(data: string): string {
  try {
    const standardBase64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return atob(standardBase64);
  } catch {
    console.warn('Failed to decode base64url data');
    return '';
  }
}

/**
 * Strip HTML tags and clean up the text for AI processing.
 * Removes style/script blocks, strips tags, decodes entities, collapses whitespace.
 */
function stripHtml(html: string): string {
  let text = html;
  // Remove style blocks
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove script blocks
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Replace <br>, <p>, <div>, <tr>, <li> with newlines
  text = text.replace(/<\s*(br|p|div|tr|li)[^>]*\/?>/gi, '\n');
  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&apos;/gi, "'");
  // Collapse excessive whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

/**
 * Recursively extract text content from a Gmail message payload.
 * Walks the entire MIME parts tree to find text/plain and text/html at any depth.
 * Prefers plain text; falls back to stripped HTML.
 */
function extractEmailBody(payload: any): string {
  const plainTexts: string[] = [];
  const htmlTexts: string[] = [];

  function walkParts(part: any): void {
    if (!part) return;

    const mimeType = (part.mimeType || '').toLowerCase();

    // If this part has body data, collect it
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (decoded) {
        if (mimeType === 'text/plain') {
          plainTexts.push(decoded);
        } else if (mimeType === 'text/html') {
          htmlTexts.push(decoded);
        }
      }
    }

    // Recurse into sub-parts (multipart/mixed, multipart/alternative, etc.)
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        walkParts(subPart);
      }
    }
  }

  walkParts(payload);

  // Prefer plain text over HTML
  if (plainTexts.length > 0) {
    return plainTexts.join('\n\n');
  }

  // Fall back to HTML with tags stripped
  if (htmlTexts.length > 0) {
    return stripHtml(htmlTexts.join('\n\n'));
  }

  return '';
}

/**
 * Recursively find PDF attachments in the Gmail message payload.
 * Returns attachment info for PDFs under 10MB.
 */
function findPdfAttachments(payload: any): PdfAttachmentInfo[] {
  const pdfs: PdfAttachmentInfo[] = [];
  const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

  function walkParts(part: any): void {
    if (!part) return;

    const mimeType = (part.mimeType || '').toLowerCase();
    const filename = part.filename || '';

    // Check if this is a PDF attachment
    if (
      mimeType === 'application/pdf' &&
      part.body?.attachmentId &&
      filename
    ) {
      const size = part.body.size || 0;
      if (size < MAX_PDF_SIZE) {
        pdfs.push({
          attachmentId: part.body.attachmentId,
          filename,
          size,
        });
      }
    }

    // Recurse into sub-parts
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        walkParts(subPart);
      }
    }
  }

  walkParts(payload);
  return pdfs;
}

/**
 * Recursively find image attachments in the Gmail message payload.
 * Returns attachment info for JPEG/PNG images under 5MB.
 * These are typically screenshots of flight confirmations, boarding passes, etc.
 */
function findImageAttachments(payload: any): ImageAttachmentInfo[] {
  const images: ImageAttachmentInfo[] = [];
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

  function walkParts(part: any): void {
    if (!part) return;

    const mimeType = (part.mimeType || '').toLowerCase();
    const filename = part.filename || '';

    // Check if this is an image attachment (must have attachmentId and filename)
    if (
      IMAGE_MIME_TYPES.has(mimeType) &&
      part.body?.attachmentId &&
      filename
    ) {
      const size = part.body.size || 0;
      if (size > 1000 && size < MAX_IMAGE_SIZE) { // Skip tiny images (tracking pixels, icons)
        images.push({
          attachmentId: part.body.attachmentId,
          filename,
          mimeType,
          size,
        });
      }
    }

    // Recurse into sub-parts
    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        walkParts(subPart);
      }
    }
  }

  walkParts(payload);
  return images;
}

/**
 * Extract text from an image attachment using GPT-4 Vision (OCR).
 * Sends the image as base64 to GPT-4o and asks it to extract all visible text.
 * This handles screenshots of flight confirmations, boarding passes, hotel bookings, etc.
 */
async function extractTextFromImage(
  base64Data: string,
  mimeType: string,
  filename: string
): Promise<string> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.warn('No OpenAI API key — skipping image OCR');
    return '';
  }

  try {
    console.log(`Running GPT-4 Vision OCR on image: ${filename} (${mimeType})`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an OCR assistant. Extract ALL visible text from the image. This is likely a screenshot of a travel confirmation, boarding pass, flight itinerary, or hotel booking. Preserve the structure and include all dates, times, flight numbers, confirmation codes, names, airports, hotels, and any other travel details you can see. Output the extracted text only, no commentary.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this travel document image:',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`GPT-4 Vision OCR API error: ${response.status} ${errText}`);
      return '';
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || '';
    console.log(`Image OCR extracted ${extractedText.length} chars from ${filename}`);
    return extractedText;
  } catch (error) {
    console.warn(`Image OCR failed for ${filename}:`, error);
    return '';
  }
}

/**
 * Fetch full email content from Gmail, including headers, body, and attachment info.
 */
async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageDetail> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API message error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // Extract headers
  const headers = data.payload?.headers || [];
  const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
  const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
  const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

  // Extract body recursively
  const body = extractEmailBody(data.payload);

  // Find PDF attachments
  const pdfAttachments = findPdfAttachments(data.payload);

  return {
    id: data.id,
    threadId: data.threadId,
    subject,
    from,
    date,
    body,
    pdfAttachments,
    rawPayload: data.payload,
  };
}

// ============================================================
// PDF Attachment Extraction
// ============================================================

/**
 * Download a PDF attachment from Gmail by its attachment ID.
 * Returns standard base64-encoded data.
 */
async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Gmail attachment API error: ${response.status}`);
  }

  const data = await response.json();
  // Convert base64url to standard base64
  const base64Data = (data.data || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return base64Data;
}

/**
 * Extract text content from a PDF using GPT-4o.
 * 
 * GPT-4o supports PDF files as input via the file content type.
 * We send the base64-encoded PDF and ask it to extract all readable text,
 * focusing on travel-relevant details like dates, confirmation numbers,
 * flight numbers, hotel names, etc.
 */
async function extractTextFromPdf(base64Data: string): Promise<string> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.warn('No OpenAI API key — skipping PDF extraction');
    return '';
  }

  try {
    console.log(`Running GPT-4o PDF extraction (${Math.round(base64Data.length / 1024)}KB base64)`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a document text extractor. Extract ALL readable text from the PDF document. This is likely a travel confirmation, boarding pass, flight itinerary, hotel booking, or car rental agreement. Preserve the structure and include all dates, times, flight numbers, confirmation codes, names, airports, hotels, addresses, and any other travel details. Output the extracted text only, no commentary.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this travel document PDF:',
              },
              {
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: `data:application/pdf;base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`GPT-4o PDF extraction API error: ${response.status} ${errText}`);
      return '';
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || '';
    console.log(`PDF extraction got ${extractedText.length} chars`);
    return extractedText;
  } catch (error) {
    console.warn('PDF extraction failed:', error);
    return '';
  }
}

// ============================================================
// Stage 1: Quick AI Classification
// ============================================================

/**
 * Cheap AI classification to determine if an email is a real travel booking.
 * Uses GPT-4o-mini with minimal tokens for fast, inexpensive filtering.
 * Only called for emails from unknown (non-travel) senders.
 */
async function classifyEmail(
  subject: string,
  from: string,
  bodyPreview: string
): Promise<ClassificationResult> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    // If no API key, assume it's a travel email to avoid blocking
    return { is_real_trip: true, confidence: 0.5, rejection_reason: null };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You classify emails as real travel bookings or not. Respond with JSON only.

A REAL travel email is a confirmation, receipt, or itinerary for:
- Commercial airline flights
- Hotels, vacation rentals, or lodging for out-of-town stays
- Car rentals
- Intercity train or rail tickets (NOT commuter rail)
- Cruises
- Package tours or guided travel

NOT a real travel email:
- Local restaurant reservations
- Local event tickets (concerts, sports, theater, conferences)
- Ride-share receipts (Uber/Lyft local trips)
- Food delivery confirmations
- Subscription services or newsletters
- Marketing or promotional emails from travel companies
- Credit card transaction alerts
- Travel insurance policies (unless bundled with a booking)
- Loyalty program updates or points notifications
- Price alerts or deal notifications
- Calendar invites for meetings
- Post-trip review requests or surveys
- Password resets or account notifications from travel sites

Respond with: {"is_real_trip": boolean, "confidence": 0.0-1.0, "rejection_reason": "reason" or null}`,
          },
          {
            role: 'user',
            content: `Subject: ${subject}\nFrom: ${from}\n\nBody preview:\n${bodyPreview.substring(0, 600)}`,
          },
        ],
        temperature: 0,
        max_tokens: 100,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.warn(`Classification API error: ${response.status}`);
      // On API error, let it through to avoid blocking real emails
      return { is_real_trip: true, confidence: 0.5, rejection_reason: null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const result = JSON.parse(content);

    return {
      is_real_trip: result.is_real_trip ?? false,
      confidence: result.confidence ?? 0,
      rejection_reason: result.rejection_reason ?? null,
    };
  } catch (error) {
    console.warn('Email classification failed:', error);
    // On error, let it through
    return { is_real_trip: true, confidence: 0.5, rejection_reason: null };
  }
}

// ============================================================
// Stage 2: Full AI Trip Extraction
// ============================================================

/**
 * Full AI extraction of structured trip data from email content.
 * Includes today's date for relative date resolution and optional PDF text.
 */
async function parseEmailWithAI(
  emailBody: string,
  subject: string,
  pdfText?: string
): Promise<{ reservations: ParsedTripData[]; error?: string }> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const today = new Date().toISOString().split('T')[0];

  // Combine email body with PDF text if available
  let fullContent = emailBody;
  if (pdfText) {
    fullContent += '\n\n--- ATTACHED DOCUMENT CONTENT ---\n\n' + pdfText;
  }

  // Truncate to avoid token limits (keep first ~8000 chars)
  if (fullContent.length > 8000) {
    fullContent = fullContent.substring(0, 8000) + '\n...[truncated]';
  }

  const prompt = `You are a travel email parser. Today's date is ${today}. Extract structured trip information from this travel confirmation email.

IMPORTANT: If the email contains MULTIPLE flight legs, hotel stays, car rentals, or other separate bookings, return EACH ONE as a separate item in the "reservations" array. For example, a connecting flight itinerary with MIA→LAX and LAX→HND should produce TWO separate flight reservations.

Email Subject: ${subject}

Email Content:
${fullContent}

Return JSON in this format:
{
  "reservations": [
    {
      "type": "flight" | "hotel" | "car_rental" | "train" | "cruise" | "other_travel",
      "title": "Brief title (e.g., 'AA Flight MIA → LAX', 'Hilton Downtown NYC')",
      "subtitle": "Key details (e.g., 'AA 1531 - Economy', 'Deluxe King Room - 3 nights')",
      "start_time": "YYYY-MM-DDTHH:MM:SS (LOCAL time at the location — do NOT append Z or timezone offset)",
      "end_time": "YYYY-MM-DDTHH:MM:SS (LOCAL time at the location — do NOT append Z or timezone offset), or null",
      "location": "Destination city name for this leg/segment",
      "address": "Full street address or null",
      "confirmation_number": "Booking/confirmation number or null (same for all legs if shared)",
      "details": {
        // For flights: "Airline", "Flight Number", "Departure Airport", "Arrival Airport", "Duration" (e.g. "11h 55m" — REQUIRED, calculate from times + timezone difference), "Departure Timezone" (UTC offset e.g. "-08:00" — REQUIRED for flights), "Arrival Timezone" (UTC offset e.g. "+09:00" — REQUIRED for flights), "Seat", "Class", "Gate", "Terminal", "Baggage"
        // For hotels: "Hotel Name", "Room Type", "Nights", "Check-in Time", "Check-out Time", "Guest Name"
        // For car rentals: "Company", "Car Type", "Pickup Location", "Dropoff Location", "Pickup Time", "Dropoff Time"
        // For trains: "Train Number", "Departure Station", "Arrival Station", "Seat", "Car Number"
        // For cruises: "Ship Name", "Cabin", "Embarkation Port", "Disembarkation Port"
      },
      "status": "confirmed" or "cancelled" (use "cancelled" ONLY if the email is explicitly a cancellation notice),
      "destination": "FINAL destination city for trip grouping (same for all legs in a connecting itinerary)",
      "country": "Country name (e.g., 'Indonesia', 'United States', 'Japan')",
      "region": "State, province, island, or sub-region (e.g., 'Bali', 'California', 'Hokkaido'). Use null if not applicable.",
      "trip_dates": {
        "start": "YYYY-MM-DD (earliest date across ALL legs)",
        "end": "YYYY-MM-DD (latest date across ALL legs)"
      }
    }
  ]
}

Rules:
- Each flight leg = separate reservation. MIA→LAX is one, LAX→HND is another.
- All reservations from the same email share the same "destination" (the FINAL destination), "country", "region", and "trip_dates" (spanning all legs).
- For connecting flights, the destination is the final arrival city, not the layover.
- "country" should be the full country name of the final destination.
- "region" should be the state, province, island, or well-known sub-region (e.g., "Bali" for anywhere in Bali, "Tuscany" for anywhere in Tuscany, "California" for anywhere in California). Use null if not meaningful.
- Use null for any field you cannot determine — never use empty strings.
- Resolve relative dates like "tomorrow" or "next Friday" using today's date (${today}).
- If this is NOT a travel-related email, return: { "error": "Not a travel email" }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You extract structured travel data from emails. Always respond with valid JSON. Return each flight leg, hotel stay, or booking as a SEPARATE item in the reservations array. Use null for missing fields, never empty strings.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const result = JSON.parse(content);
  
  // Handle both formats: { error: "..." } or { reservations: [...] }
  if (result.error) {
    return { reservations: [], error: result.error };
  }
  
  // Handle legacy single-object format (backwards compatibility)
  if (!result.reservations && result.type) {
    return { reservations: [result as ParsedTripData] };
  }
  
  return { reservations: result.reservations || [], error: result.error };
}

// ============================================================
// Message Tracking & Deduplication
// ============================================================

/**
 * Mark a Gmail message as processed in the database.
 * Uses upsert so re-processing updates the existing record.
 */
async function markMessageProcessed(
  supabase: any,
  userId: string,
  gmailMessageId: string,
  status: string
): Promise<void> {
  try {
    await supabase
      .from('processed_gmail_messages')
      .upsert(
        {
          user_id: userId,
          gmail_message_id: gmailMessageId,
          status,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,gmail_message_id' }
      );
  } catch (error) {
    console.warn(`Failed to mark message ${gmailMessageId} as processed:`, error);
  }
}

/**
 * Check if a Gmail message has already been processed.
 * Uses maybeSingle() to avoid errors when no row exists.
 */
async function isMessageProcessed(
  supabase: any,
  userId: string,
  gmailMessageId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('processed_gmail_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('gmail_message_id', gmailMessageId)
      .maybeSingle();

    return !!data;
  } catch {
    // If table doesn't exist or query fails, assume not processed
    return false;
  }
}

/**
 * Check if a reservation already exists (duplicate detection).
 * Uses multiple strategies to catch duplicates from different emails
 * about the same booking (confirmation, check-in, boarding pass, etc.).
 */
async function isDuplicateReservation(
  supabase: any,
  tripId: string,
  parsed: ParsedTripData
): Promise<boolean> {
  const reservationType = parsed.type === 'car_rental' ? 'car' : parsed.type;

  // Check 1: Same type + same start_time in same trip (most precise)
  if (parsed.start_time) {
    const { data: byTypeAndTime } = await supabase
      .from('reservations')
      .select('id')
      .eq('trip_id', tripId)
      .eq('type', reservationType)
      .eq('start_time', parsed.start_time)
      .maybeSingle();

    if (byTypeAndTime) return true;
  }

  // Check 2: FLIGHT-SPECIFIC — same flight number in same trip
  // This is the key dedup check: booking confirmation, check-in email,
  // and boarding pass all reference the same flight number (e.g., "AA 1531")
  // but may report slightly different times.
  if (parsed.type === 'flight') {
    const flightNumber = parsed.details?.['Flight Number'];
    if (flightNumber) {
      // Normalize flight number: strip spaces, uppercase (e.g., "AA 1531" → "AA1531")
      const normalizedFlightNum = flightNumber.toString().replace(/\s+/g, '').toUpperCase();

      // Get all flight reservations in this trip
      const { data: existingFlights } = await supabase
        .from('reservations')
        .select('id, details, start_time')
        .eq('trip_id', tripId)
        .eq('type', 'flight');

      if (existingFlights && existingFlights.length > 0) {
        for (const existing of existingFlights) {
          const existingFlightNum = existing.details?.['Flight Number'];
          if (existingFlightNum) {
            const normalizedExisting = existingFlightNum.toString().replace(/\s+/g, '').toUpperCase();
            if (normalizedFlightNum === normalizedExisting) {
              console.log(`Duplicate flight detected by flight number: ${flightNumber} (existing: ${existing.id})`);
              return true;
            }
          }
        }
      }
    }

    // Check 2b: FLIGHT fuzzy match — same route on same day
    // Catches cases where flight number is missing or formatted differently
    // by comparing departure/arrival airports + same calendar day
    if (parsed.start_time && parsed.details) {
      const depAirport = parsed.details['Departure Airport'];
      const arrAirport = parsed.details['Arrival Airport'];

      if (depAirport && arrAirport) {
        const parsedDate = new Date(parsed.start_time);
        const dayStart = new Date(parsedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(parsedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const { data: sameDayFlights } = await supabase
          .from('reservations')
          .select('id, details, start_time')
          .eq('trip_id', tripId)
          .eq('type', 'flight')
          .gte('start_time', dayStart.toISOString())
          .lte('start_time', dayEnd.toISOString());

        if (sameDayFlights && sameDayFlights.length > 0) {
          const normalizedDep = depAirport.toString().toUpperCase().trim();
          const normalizedArr = arrAirport.toString().toUpperCase().trim();

          for (const existing of sameDayFlights) {
            const existingDep = existing.details?.['Departure Airport']?.toString().toUpperCase().trim();
            const existingArr = existing.details?.['Arrival Airport']?.toString().toUpperCase().trim();

            if (existingDep === normalizedDep && existingArr === normalizedArr) {
              console.log(`Duplicate flight detected by route+date: ${depAirport}→${arrAirport} on ${parsedDate.toDateString()} (existing: ${existing.id})`);
              return true;
            }
          }
        }
      }
    }
  }

  // Check 3: Same confirmation number (for non-flight types)
  // For flights, we skip this since multiple legs share the same confirmation
  if (parsed.confirmation_number && parsed.type !== 'flight') {
    const { data: byConfirmation } = await supabase
      .from('reservations')
      .select('id')
      .eq('trip_id', tripId)
      .eq('confirmation_number', parsed.confirmation_number)
      .maybeSingle();

    if (byConfirmation) return true;
  }

  return false;
}

// ============================================================
// Trip Management
// ============================================================

/**
 * Check if a trip's end date is more than 7 days in the past.
 */
function isTripTooOld(endDate: string): boolean {
  const end = new Date(endDate);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return end < sevenDaysAgo;
}

/**
 * Check if two destinations are in the same geographic region.
 * Uses heuristic string matching on destination, country, and region fields.
 * Returns true if they likely belong to the same trip.
 */
function areDestinationsRelated(
  newDestination: string,
  newCountry: string | null,
  newRegion: string | null,
  existingDestination: string,
  existingName: string
): boolean {
  const normalize = (s: string) => s.toLowerCase().trim();
  const newDest = normalize(newDestination);
  const existDest = normalize(existingDestination);
  const existName = normalize(existingName);

  // Exact match
  if (newDest === existDest) return true;

  // One destination contains the other (e.g., "Denpasar" vs "Denpasar, Bali")
  if (newDest.includes(existDest) || existDest.includes(newDest)) return true;

  // Check if the trip name contains the new destination or vice versa
  // e.g., trip "Trip to Ubud" and new destination "Denpasar, Bali"
  if (existName.includes(newDest) || newDest.includes(existName.replace('trip to ', ''))) return true;

  // Extract words from both destinations for overlap checking
  const newWords = new Set(newDest.split(/[\s,]+/).filter(w => w.length > 2));
  const existWords = new Set(existDest.split(/[\s,]+/).filter(w => w.length > 2));

  // Check for shared significant words (city names, country names, regions)
  // e.g., "Denpasar, Bali" and "Ubud, Bali" both contain "Bali"
  for (const word of newWords) {
    if (existWords.has(word)) return true;
  }

  // Check if region matches any word in existing destination or trip name
  if (newRegion) {
    const region = normalize(newRegion);
    if (existDest.includes(region) || existName.includes(region)) return true;
    // Check if existing destination words match the region
    for (const word of existWords) {
      if (region.includes(word) || word.includes(region)) return true;
    }
  }

  // Check if country matches (and both are in the same country)
  // This is a weaker signal — only use if the trip name also hints at the country
  if (newCountry) {
    const country = normalize(newCountry);
    if (existDest.includes(country) || existName.includes(country)) return true;
  }

  return false;
}

/**
 * Find an existing trip that matches the destination and overlapping dates,
 * or create a new one. Uses tiered matching:
 * 
 * Tier 1: Exact destination + overlapping dates (original behavior)
 * Tier 2: Fuzzy destination (same region/country) + overlapping/adjacent dates (±3 day buffer)
 * 
 * Also expands trip dates if the new reservation extends beyond the existing trip's date range.
 */
async function findOrCreateTrip(
  supabase: any,
  userId: string,
  parsed: ParsedTripData,
  stats: ScanStats
): Promise<string | null> {
  const { destination, country, region, trip_dates } = parsed;

  if (!destination || !trip_dates?.start || !trip_dates?.end) {
    console.warn('Missing destination or trip dates, cannot create trip');
    return null;
  }

  // === Tier 1: Exact destination match + overlapping dates ===
  const { data: exactMatches } = await supabase
    .from('trips')
    .select('id, start_date, end_date, name, destination')
    .eq('user_id', userId)
    .eq('destination', destination)
    .gte('end_date', trip_dates.start)
    .lte('start_date', trip_dates.end);

  if (exactMatches && exactMatches.length > 0) {
    const trip = exactMatches[0];
    console.log(`[Tier 1] Exact destination match — using trip: ${trip.id} (${trip.name})`);
    return await expandTripDatesAndReturn(supabase, trip, trip_dates);
  }

  // === Tier 2: Fuzzy destination + overlapping/adjacent dates (±3 day buffer) ===
  // Add a 3-day buffer on each side to catch adjacent bookings
  // e.g., flight arrives Jan 10, hotel check-in Jan 10 but trip was created as Jan 8-10
  const bufferDays = 3;
  const bufferedStart = new Date(trip_dates.start);
  bufferedStart.setDate(bufferedStart.getDate() - bufferDays);
  const bufferedEnd = new Date(trip_dates.end);
  bufferedEnd.setDate(bufferedEnd.getDate() + bufferDays);
  const bufferedStartStr = bufferedStart.toISOString().split('T')[0];
  const bufferedEndStr = bufferedEnd.toISOString().split('T')[0];

  const { data: nearbyTrips } = await supabase
    .from('trips')
    .select('id, start_date, end_date, name, destination')
    .eq('user_id', userId)
    .gte('end_date', bufferedStartStr)
    .lte('start_date', bufferedEndStr);

  if (nearbyTrips && nearbyTrips.length > 0) {
    // Check each nearby trip for geographic relatedness
    for (const trip of nearbyTrips) {
      if (areDestinationsRelated(destination, country, region, trip.destination, trip.name)) {
        console.log(`[Tier 2] Fuzzy destination match — "${destination}" ≈ "${trip.destination}" (trip: ${trip.name}) — using trip: ${trip.id}`);
        return await expandTripDatesAndReturn(supabase, trip, trip_dates);
      }
    }
  }

  // === No match found — create new trip ===
  const { data: newTrip, error: tripError } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      name: `Trip to ${destination}`,
      destination,
      start_date: trip_dates.start,
      end_date: trip_dates.end,
      status: 'upcoming',
    })
    .select()
    .single();

  if (tripError) {
    console.error('Error creating trip:', tripError);
    return null;
  }

  stats.tripsCreated++;
  console.log(`Created new trip: ${newTrip.id} — ${destination}`);
  return newTrip.id;
}

/**
 * Helper: expand trip dates if the new reservation extends beyond, then return trip ID.
 */
async function expandTripDatesAndReturn(
  supabase: any,
  trip: { id: string; start_date: string; end_date: string },
  trip_dates: { start: string; end: string }
): Promise<string> {
  const updates: Record<string, string> = {};
  if (trip_dates.start < trip.start_date) {
    updates.start_date = trip_dates.start;
  }
  if (trip_dates.end > trip.end_date) {
    updates.end_date = trip_dates.end;
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('trips')
      .update(updates)
      .eq('id', trip.id);
    console.log(`Expanded trip dates:`, updates);
  }

  return trip.id;
}

// ============================================================
// Receipt Scanning Types & Logic
// ============================================================

/** Senders that only produce receipts when the user has an active trip on that date */
const TRIP_DEPENDENT_SENDERS = new Set([
  'uber.com', 'lyft.com',
]);

interface ParsedReceiptData {
  merchant: string;
  amount: number;
  currency: string;
  date: string;           // YYYY-MM-DD
  category: 'transport' | 'lodging' | 'meals' | 'other';
  description: string | null;
  confirmation_number: string | null;
}

interface ReceiptScanStats {
  messagesScanned: number;
  skippedAlreadyProcessed: number;
  skippedByClassifier: number;
  skippedNoTripMatch: number;
  receiptsCreated: number;
  duplicatesSkipped: number;
  totalAmount: number;
  errors: number;
}

/**
 * Check if a sender is trip-dependent (Uber/Lyft).
 */
function isTripDependentSender(fromHeader: string): boolean {
  const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
  if (!emailMatch) return false;
  const email = emailMatch[1].toLowerCase();
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return false;
  const domain = email.substring(atIndex + 1);
  if (TRIP_DEPENDENT_SENDERS.has(domain)) return true;
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join('.');
    if (TRIP_DEPENDENT_SENDERS.has(parentDomain)) return true;
  }
  return false;
}

/**
 * Build a Gmail search query targeting travel receipts/charges.
 * Looks for receipt/charge/invoice emails from known travel senders.
 */
function buildReceiptSearchQuery(): string {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFilter = `after:${thirtyDaysAgo.getFullYear()}/${thirtyDaysAgo.getMonth() + 1}/${thirtyDaysAgo.getDate()}`;

  // Receipt-specific subject phrases
  const receiptSubjectPhrases = [
    '"your receipt"', '"payment receipt"', '"booking receipt"',
    '"payment confirmation"', '"charge confirmation"',
    '"invoice"', '"billing statement"', '"payment processed"',
    '"transaction receipt"', '"order confirmation"',
    '"your bill"', '"folio"', '"checkout receipt"',
    '"rental receipt"', '"rental invoice"',
    '"trip receipt"', '"ride receipt"',
  ];

  // Receipt senders — travel companies + rideshare
  const receiptSenderDomains = [
    'delta.com', 'united.com', 'aa.com', 'southwest.com', 'jetblue.com',
    'alaskaair.com', 'spirit.com', 'frontier.com',
    'britishairways.com', 'lufthansa.com', 'airfrance.com', 'emirates.com',
    'ryanair.com', 'easyjet.com',
    'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'bestwestern.com',
    'accor.com', 'fourseasons.com', 'radissonhotels.com',
    'booking.com', 'expedia.com', 'hotels.com', 'priceline.com',
    'airbnb.com', 'vrbo.com', 'vacasa.com',
    'hertz.com', 'enterprise.com', 'avis.com', 'budget.com', 'nationalcar.com',
    'alamo.com', 'sixt.com', 'turo.com',
    'amtrak.com', 'eurostar.com',
    'uber.com', 'lyft.com',
    'royalcaribbean.com', 'carnival.com', 'ncl.com',
  ];

  const senderFilter = receiptSenderDomains.map(d => `from:${d}`).join(' OR ');
  const genericKeywords = 'subject:(receipt OR invoice OR charge OR payment OR bill OR folio)';

  const negativeExclusions = '-subject:(unsubscribe OR newsletter OR promo OR sale OR coupon OR survey OR "rate your" OR "how was" OR "leave a review" OR "special offer")';
  const labelExclusions = '-label:spam -label:promotions';

  const query = [
    dateFilter,
    labelExclusions,
    negativeExclusions,
    `(subject:(${receiptSubjectPhrases.join(' OR ')}) OR ((${senderFilter}) ${genericKeywords}))`,
  ].join(' ');

  return query;
}

/**
 * AI extraction of receipt data from email content.
 */
async function parseReceiptWithAI(
  emailBody: string,
  subject: string,
  from: string,
  pdfText?: string
): Promise<{ receipts: ParsedReceiptData[]; error?: string }> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) throw new Error('OpenAI API key not configured');

  const today = new Date().toISOString().split('T')[0];

  let fullContent = emailBody;
  if (pdfText) {
    fullContent += '\n\n--- ATTACHED DOCUMENT CONTENT ---\n\n' + pdfText;
  }
  if (fullContent.length > 8000) {
    fullContent = fullContent.substring(0, 8000) + '\n...[truncated]';
  }

  const prompt = `You are a travel receipt parser. Today's date is ${today}. Extract receipt/charge information from this email.

Email Subject: ${subject}
From: ${from}

Email Content:
${fullContent}

Return JSON in this format:
{
  "receipts": [
    {
      "merchant": "Company name (e.g., 'Delta Air Lines', 'Marriott Downtown NYC', 'Uber')",
      "amount": 123.45,
      "currency": "USD",
      "date": "YYYY-MM-DD",
      "category": "transport" | "lodging" | "meals" | "other",
      "description": "Brief description (e.g., 'Flight MIA→LAX', '3-night stay', 'Airport ride')",
      "confirmation_number": "Booking/confirmation number or null"
    }
  ]
}

Rules:
- Extract the TOTAL CHARGED amount, not per-night or per-segment prices.
- Use the charge/transaction date, not the travel date.
- Category mapping: flights/trains/car rentals/rideshare = "transport", hotels/airbnb/vacation rentals = "lodging", restaurants/food = "meals", everything else = "other".
- If this is NOT a receipt/charge/invoice email, return: { "error": "Not a receipt email" }
- If there are multiple separate charges in one email, return each as a separate receipt.
- Use null for any field you cannot determine.
- Currency should be a 3-letter ISO code (USD, EUR, GBP, etc.).`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You extract structured receipt/charge data from travel emails. Always respond with valid JSON. Use null for missing fields.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const result = JSON.parse(content);

  if (result.error) return { receipts: [], error: result.error };
  return { receipts: result.receipts || [] };
}

/**
 * Find a trip that overlaps with a given date.
 * Returns the trip_id or null.
 */
async function findTripForDate(
  supabase: any,
  userId: string,
  dateStr: string
): Promise<string | null> {
  const { data: trips } = await supabase
    .from('trips')
    .select('id')
    .eq('user_id', userId)
    .lte('start_date', dateStr)
    .gte('end_date', dateStr)
    .limit(1);

  return trips && trips.length > 0 ? trips[0].id : null;
}

/**
 * Check if a receipt already exists (dedup by merchant + date + amount in same trip).
 */
async function isDuplicateReceipt(
  supabase: any,
  tripId: string,
  receipt: ParsedReceiptData
): Promise<boolean> {
  const { data } = await supabase
    .from('receipts')
    .select('id')
    .eq('trip_id', tripId)
    .eq('merchant', receipt.merchant)
    .eq('date', receipt.date)
    .eq('amount', receipt.amount)
    .maybeSingle();

  return !!data;
}

/**
 * Handle receipt scanning mode.
 * Searches Gmail for travel receipts, extracts data with AI,
 * matches to existing trips, and creates receipt records.
 */
async function handleReceiptScan(
  supabase: any,
  userId: string,
  accessToken: string
): Promise<{ success: boolean; summary: ReceiptScanStats }> {
  const stats: ReceiptScanStats = {
    messagesScanned: 0,
    skippedAlreadyProcessed: 0,
    skippedByClassifier: 0,
    skippedNoTripMatch: 0,
    receiptsCreated: 0,
    duplicatesSkipped: 0,
    totalAmount: 0,
    errors: 0,
  };

  // Search Gmail for receipt emails
  const query = buildReceiptSearchQuery();
  console.log('Receipt search query length:', query.length);

  const searchResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    throw new Error(`Gmail API search error: ${searchResponse.status} ${errorText}`);
  }

  const searchData = await searchResponse.json();
  const messages: GmailMessage[] = searchData.messages || [];
  stats.messagesScanned = messages.length;
  console.log(`Found ${messages.length} potential receipt emails`);

  for (const message of messages) {
    try {
      // Check if already processed (use receipt-specific prefix)
      const receiptMsgId = `receipt_${message.id}`;
      const alreadyProcessed = await isMessageProcessed(supabase, userId, receiptMsgId);
      if (alreadyProcessed) {
        stats.skippedAlreadyProcessed++;
        continue;
      }

      // Fetch full email
      const emailDetail = await getGmailMessage(accessToken, message.id);
      console.log(`[Receipt] Processing: "${emailDetail.subject}" from ${emailDetail.from}`);

      // Check if this is a trip-dependent sender (Uber/Lyft)
      const tripDependent = isTripDependentSender(emailDetail.from);

      // Check if from a known travel sender (fast-pass for classification)
      const knownSender = isKnownTravelSender(emailDetail.from) || tripDependent;

      // If unknown sender, run quick classification
      if (!knownSender) {
        const classification = await classifyEmail(
          emailDetail.subject,
          emailDetail.from,
          emailDetail.body
        );
        if (!classification.is_real_trip || classification.confidence < 0.6) {
          console.log(`[Receipt] Rejected by classifier: ${classification.rejection_reason}`);
          await markMessageProcessed(supabase, userId, receiptMsgId, 'receipt_rejected');
          stats.skippedByClassifier++;
          continue;
        }
      }

      // Extract PDF text if available
      let pdfText = '';
      if (emailDetail.pdfAttachments.length > 0) {
        const firstPdf = emailDetail.pdfAttachments[0];
        try {
          const pdfBase64 = await downloadAttachment(accessToken, message.id, firstPdf.attachmentId);
          pdfText = await extractTextFromPdf(pdfBase64);
        } catch (pdfError) {
          console.warn(`[Receipt] PDF extraction failed:`, pdfError);
        }
      }

      // AI extraction
      const parseResult = await parseReceiptWithAI(
        emailDetail.body,
        emailDetail.subject,
        emailDetail.from,
        pdfText || undefined
      );

      if (parseResult.error || parseResult.receipts.length === 0) {
        console.log(`[Receipt] Parser rejected: ${parseResult.error || 'no receipts found'}`);
        await markMessageProcessed(supabase, userId, receiptMsgId, 'receipt_no_data');
        continue;
      }

      // Process each extracted receipt
      for (const receipt of parseResult.receipts) {
        if (!receipt.merchant || !receipt.amount || !receipt.date) {
          console.log(`[Receipt] Skipping incomplete receipt: ${receipt.merchant || 'unknown'}`);
          continue;
        }

        // Find matching trip for this receipt date
        const tripId = await findTripForDate(supabase, userId, receipt.date);

        // Trip-dependent senders (Uber/Lyft): skip if no matching trip
        if (tripDependent && !tripId) {
          console.log(`[Receipt] Skipping trip-dependent receipt (no matching trip): ${receipt.merchant} on ${receipt.date}`);
          stats.skippedNoTripMatch++;
          continue;
        }

        // For non-trip-dependent senders: also skip if no matching trip
        // (receipts must belong to a trip)
        if (!tripId) {
          console.log(`[Receipt] No matching trip for ${receipt.merchant} on ${receipt.date} — skipping`);
          stats.skippedNoTripMatch++;
          continue;
        }

        // Check for duplicates
        const isDup = await isDuplicateReceipt(supabase, tripId, receipt);
        if (isDup) {
          console.log(`[Receipt] Duplicate skipped: ${receipt.merchant} $${receipt.amount}`);
          stats.duplicatesSkipped++;
          continue;
        }

        // Insert receipt
        const { error: insertError } = await supabase
          .from('receipts')
          .insert({
            trip_id: tripId,
            merchant: receipt.merchant,
            amount: receipt.amount,
            currency: receipt.currency || 'USD',
            date: receipt.date,
            category: receipt.category || 'other',
            status: 'pending',
            ocr_data: {
              source: 'gmail_scan',
              description: receipt.description,
              confirmation_number: receipt.confirmation_number,
              email_subject: emailDetail.subject,
              email_from: emailDetail.from,
            },
          });

        if (insertError) {
          console.error(`[Receipt] Insert error:`, insertError);
          stats.errors++;
          continue;
        }

        stats.receiptsCreated++;
        stats.totalAmount += receipt.amount;
        console.log(`[Receipt] Created: ${receipt.merchant} $${receipt.amount} → trip ${tripId}`);
      }

      await markMessageProcessed(supabase, userId, receiptMsgId, 'receipt_processed');
    } catch (error) {
      console.error(`[Receipt] Error processing message ${message.id}:`, error);
      await markMessageProcessed(supabase, userId, `receipt_${message.id}`, 'receipt_error');
      stats.errors++;
    }
  }

  console.log('[Receipt] Scan complete:', stats);
  return { success: true, summary: stats };
}

// ============================================================
// Main Handler
// ============================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const { accountId, mode } = await req.json();

    if (!accountId) {
      throw new Error('Missing accountId parameter');
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get user token from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get connected account
    const { data: account, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      throw new Error(`Connected account not found: ${accountError?.message || 'no data'}`);
    }

    // Refresh Gmail access token if we have a refresh token
    let accessToken = account.access_token;
    if (account.refresh_token) {
      try {
        // Use the iOS client ID — the refresh token was issued to this client
        const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID_IOS') || Deno.env.get('GOOGLE_CLIENT_ID_WEB') || '';
        
        console.log('Attempting token refresh with client ID:', googleClientId ? googleClientId.substring(0, 20) + '...' : 'MISSING');
        
        if (googleClientId) {
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              refresh_token: account.refresh_token,
              grant_type: 'refresh_token',
            }),
          });

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            if (tokenData.access_token) {
              accessToken = tokenData.access_token;
              console.log('Refreshed Gmail access token');
              
              // Update stored token
              await supabase
                .from('connected_accounts')
                .update({ 
                  access_token: accessToken,
                  token_expiry: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
                })
                .eq('id', accountId);
            }
          } else {
            const errText = await tokenResponse.text();
            console.warn('Token refresh failed:', errText);
          }
        }
      } catch (refreshError) {
        console.warn('Token refresh error:', refreshError);
        // Continue with existing token
      }
    }

    // ============================================================
    // Route based on mode: 'receipts' or default (trips)
    // ============================================================
    if (mode === 'receipts') {
      console.log('Mode: receipt scanning');
      const result = await handleReceiptScan(supabase, user.id, accessToken);
      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // ============================================================
    // Default mode: Trip scanning
    // ============================================================

    // Time budget: stop processing before the 150s Supabase timeout
    const SCAN_START_TIME = Date.now();
    const TIME_BUDGET_MS = 115_000; // 115 seconds — leave 35s buffer for cleanup + response

    function hasTimeBudget(): boolean {
      return (Date.now() - SCAN_START_TIME) < TIME_BUDGET_MS;
    }

    // Initialize stats
    const stats: ScanStats = {
      messagesScanned: 0,
      skippedAlreadyProcessed: 0,
      skippedByClassifier: 0,
      skippedPastTrips: 0,
      emailsProcessed: 0,
      tripsCreated: 0,
      reservationsCreated: 0,
      pdfAttachmentsProcessed: 0,
      duplicatesSkipped: 0,
      errors: 0,
      stoppedEarly: false,
      has_more: false,
    };

    // Search Gmail for travel emails
    console.log('Searching Gmail for travel emails...');
    const messages = await searchGmailForTravelEmails(accessToken, 50);
    stats.messagesScanned = messages.length;
    console.log(`Found ${messages.length} potential travel emails`);

    // Batch check: get all already-processed message IDs in one query
    // This replaces 50 individual DB queries with 1 query
    const allMessageIds = messages.map(m => m.id);
    let processedMessageIds = new Set<string>();
    if (allMessageIds.length > 0) {
      try {
        const { data: processedRows } = await supabase
          .from('processed_gmail_messages')
          .select('gmail_message_id')
          .eq('user_id', user.id)
          .in('gmail_message_id', allMessageIds);
        
        if (processedRows) {
          processedMessageIds = new Set(processedRows.map((r: any) => r.gmail_message_id));
        }
        console.log(`Batch dedup: ${processedMessageIds.size} of ${allMessageIds.length} already processed`);
      } catch (err) {
        console.warn('Batch dedup query failed, falling back to individual checks:', err);
      }
    }

    // Process each message
    for (const message of messages) {
      // Check time budget before starting a new email
      if (!hasTimeBudget()) {
        console.log(`⏱️ Time budget exhausted after ${Math.round((Date.now() - SCAN_START_TIME) / 1000)}s — stopping early`);
        stats.stoppedEarly = true;
        stats.has_more = true;
        break;
      }

      try {
        // Step 1: Check if already processed (using batch result)
        if (processedMessageIds.has(message.id)) {
          stats.skippedAlreadyProcessed++;
          continue;
        }

        // Step 2: Fetch full email content
        const emailDetail = await getGmailMessage(accessToken, message.id);
        console.log(`Processing: "${emailDetail.subject}" from ${emailDetail.from}`);

        // Step 3: Check known travel sender (fast-pass)
        const knownSender = isKnownTravelSender(emailDetail.from);

        // Step 3b: Check if subject contains strong travel keywords (subject fast-pass)
        // This catches self-forwarded emails, friend-forwarded emails, etc.
        const travelSubjectKeywords = [
          'flight confirmation', 'travel confirmation', 'hotel confirmation',
          'booking confirmation', 'trip confirmation', 'e-ticket',
          'boarding pass', 'itinerary', 'reservation confirmation',
          'car rental', 'train ticket', 'cruise confirmation',
          'hotel reservation', 'flight itinerary', 'travel itinerary',
        ];
        const subjectLower = emailDetail.subject.toLowerCase();
        const hasStrongTravelSubject = travelSubjectKeywords.some(kw => subjectLower.includes(kw));

        // Step 4: Extract attachments BEFORE classification
        // This ensures image OCR text is available for the classifier

        // Step 4a: Extract PDF attachment text (first PDF only)
        let pdfText = '';
        if (emailDetail.pdfAttachments.length > 0) {
          const firstPdf = emailDetail.pdfAttachments[0];
          console.log(`Extracting PDF: ${firstPdf.filename} (${Math.round(firstPdf.size / 1024)}KB)`);
          try {
            const pdfBase64 = await downloadAttachment(
              accessToken,
              message.id,
              firstPdf.attachmentId
            );
            pdfText = await extractTextFromPdf(pdfBase64);
            if (pdfText) {
              stats.pdfAttachmentsProcessed++;
              console.log(`PDF text extracted: ${pdfText.length} chars`);
            }
          } catch (pdfError) {
            console.warn(`PDF extraction failed for ${firstPdf.filename}:`, pdfError);
          }
        }

        // Step 4b: Extract image attachment text via GPT-4 Vision OCR
        // Run BEFORE classification so the classifier can see the image content
        let imageOcrText = '';
        const imageAttachments = findImageAttachments(emailDetail.rawPayload);
        if (imageAttachments.length > 0) {
          const firstImage = imageAttachments[0];
          console.log(`Found image attachment: ${firstImage.filename} (${Math.round(firstImage.size / 1024)}KB, ${firstImage.mimeType})`);
          
          // Run OCR if the email body is thin (< 500 chars) OR has a strong travel subject
          const bodyLength = emailDetail.body.trim().length;
          const shouldOcr = bodyLength < 500 || hasStrongTravelSubject;
          
          if (shouldOcr) {
            console.log(`Running image OCR (body: ${bodyLength} chars, travel subject: ${hasStrongTravelSubject})`);
            try {
              const imageBase64 = await downloadAttachment(
                accessToken,
                message.id,
                firstImage.attachmentId
              );
              imageOcrText = await extractTextFromImage(imageBase64, firstImage.mimeType, firstImage.filename);
              if (imageOcrText) {
                console.log(`Image OCR extracted ${imageOcrText.length} chars`);
              }
            } catch (imgError) {
              console.warn(`Image OCR failed for ${firstImage.filename}:`, imgError);
            }
          } else {
            console.log(`Email body is rich (${bodyLength} chars) and no travel subject — skipping image OCR`);
          }
        }

        // Step 5: Classification — skip if known sender OR strong travel subject with content
        const hasContentFromAttachments = !!(pdfText || imageOcrText);
        const skipClassification = knownSender || (hasStrongTravelSubject && (emailDetail.body.trim().length > 50 || hasContentFromAttachments));

        if (skipClassification) {
          console.log(`Fast-pass: ${knownSender ? 'known travel sender' : 'strong travel subject' + (hasContentFromAttachments ? ' + attachment content' : '')}`);
        } else {
          // Combine body with OCR text for better classification
          const classificationBody = [emailDetail.body, imageOcrText, pdfText].filter(Boolean).join('\n\n');
          
          const classification = await classifyEmail(
            emailDetail.subject,
            emailDetail.from,
            classificationBody
          );

          if (!classification.is_real_trip || classification.confidence < 0.7) {
            console.log(`Rejected by classifier: ${classification.rejection_reason} (confidence: ${classification.confidence})`);
            await markMessageProcessed(supabase, user.id, message.id, 'rejected_by_classifier');
            stats.skippedByClassifier++;
            continue;
          }

          console.log(`Classified as travel email (confidence: ${classification.confidence})`);
        }

        // Combine supplementary text from PDF and image OCR
        const supplementaryText = [pdfText, imageOcrText].filter(Boolean).join('\n\n');

        // Step 6: Run Stage 2 full AI extraction (returns array of reservations)
        const parseResult = await parseEmailWithAI(emailDetail.body, emailDetail.subject, supplementaryText || undefined);

        // Step 7: Check if parser returned an error
        if (parseResult.error || parseResult.reservations.length === 0) {
          console.log(`Parser rejected: ${parseResult.error || 'no reservations found'}`);
          await markMessageProcessed(supabase, user.id, message.id, 'parse_no_travel_data');
          continue;
        }

        // Filter out reservations with missing critical data
        const validReservations = parseResult.reservations.filter(r => {
          if (!r.start_time || !r.destination || !r.trip_dates?.start || !r.trip_dates?.end) {
            console.log(`Skipping reservation with missing data: ${r.title || 'untitled'} (start_time: ${r.start_time}, destination: ${r.destination})`);
            return false;
          }
          return true;
        });

        if (validReservations.length === 0) {
          console.log(`No valid reservations after filtering — skipping`);
          await markMessageProcessed(supabase, user.id, message.id, 'parse_incomplete_data');
          continue;
        }

        console.log(`${validReservations.length} valid reservation(s) from email`);

        // Use the first reservation's data for trip-level checks
        const firstReservation = validReservations[0];

        // Step 8: Check if trip is too old (ended 7+ days ago)
        if (firstReservation.trip_dates?.end && isTripTooOld(firstReservation.trip_dates.end)) {
          console.log(`Skipping past trip: ${firstReservation.destination} (ended ${firstReservation.trip_dates.end})`);
          await markMessageProcessed(supabase, user.id, message.id, 'past_trip');
          stats.skippedPastTrips++;
          continue;
        }

        // Step 9: Find or create trip (using first reservation for trip-level data)
        const tripId = await findOrCreateTrip(supabase, user.id, firstReservation, stats);
        if (!tripId) {
          await markMessageProcessed(supabase, user.id, message.id, 'error');
          stats.errors++;
          continue;
        }

        // Step 10-11: Insert each reservation from this email
        for (const reservation of validReservations) {
          // Check for duplicate reservations
          const isDuplicate = await isDuplicateReservation(supabase, tripId, reservation);
          if (isDuplicate) {
            console.log(`Duplicate reservation skipped: ${reservation.title}`);
            stats.duplicatesSkipped++;
            continue;
          }

          // Map car_rental to car for database compatibility
          const reservationType = reservation.type === 'car_rental' ? 'car' : reservation.type;

          // Use AI-detected status (supports cancellation emails)
          const reservationStatus = (reservation as any).status === 'cancelled' ? 'cancelled' : 'confirmed';

          // If this is a cancellation email, try to update existing reservation instead of creating new
          if (reservationStatus === 'cancelled' && reservation.confirmation_number) {
            const { data: existingRes } = await supabase
              .from('reservations')
              .select('id')
              .eq('trip_id', tripId)
              .eq('confirmation_number', reservation.confirmation_number)
              .eq('type', reservationType)
              .maybeSingle();

            if (existingRes) {
              await supabase
                .from('reservations')
                .update({ status: 'cancelled' })
                .eq('id', existingRes.id);
              console.log(`Updated existing reservation to cancelled: ${reservation.title} (${existingRes.id})`);
              stats.reservationsCreated++;

              // Check if ALL reservations in this trip are now cancelled → mark trip completed
              const { data: allTripRes } = await supabase
                .from('reservations')
                .select('id, status')
                .eq('trip_id', tripId);

              if (allTripRes && allTripRes.length > 0) {
                const allCancelled = allTripRes.every((r: any) => r.status === 'cancelled');
                if (allCancelled) {
                  await supabase
                    .from('trips')
                    .update({ status: 'completed', updated_at: new Date().toISOString() })
                    .eq('id', tripId);
                  console.log(`All reservations cancelled — marked trip ${tripId} as completed`);
                }
              }

              continue;
            }
          }

          const { error: reservationError } = await supabase
            .from('reservations')
            .insert({
              trip_id: tripId,
              type: reservationType,
              title: reservation.title,
              subtitle: reservation.subtitle || null,
              start_time: stripTimezoneOffset(reservation.start_time) || reservation.start_time,
              end_time: stripTimezoneOffset(reservation.end_time) || reservation.end_time || null,
              location: reservation.location || null,
              address: reservation.address || null,
              confirmation_number: reservation.confirmation_number || null,
              details: reservation.details || {},
              status: reservationStatus,
            });

          if (reservationError) {
            console.error('Error creating reservation:', reservationError);
            stats.errors++;
            continue;
          }

          stats.reservationsCreated++;
          console.log(`Created reservation: ${reservation.title} (status: ${reservationStatus})`);
        }

        stats.emailsProcessed++;

        // Step 12: Mark message as processed
        await markMessageProcessed(supabase, user.id, message.id, 'processed');

      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        await markMessageProcessed(supabase, user.id, message.id, 'error');
        stats.errors++;
        // Continue with next message
      }
    }

    // Return detailed stats
    console.log('Scan complete:', stats);
    return new Response(
      JSON.stringify({
        success: true,
        summary: stats,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in scan-gmail function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
