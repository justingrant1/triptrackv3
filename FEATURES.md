# TripTrack Features

Complete list of all features available to TripTrack users.

---

## 🎯 Core Trip Management

### Trip Organization
- **Create Trips** — Manually create trips with destination, dates, and notes
- **Edit Trips** — Update trip details, dates, destinations, and status
- **Delete Trips** — Remove trips with automatic cleanup of associated reservations
- **Trip Status Tracking** — Automatic status updates (upcoming, active, completed)
- **Trip Timeline** — Visual timeline showing all reservations chronologically
- **Trip Grouping** — Automatic grouping of reservations by destination and dates
- **Multi-Trip View** — See all your trips in one organized list

### Reservation Types
- **✈️ Flights** — Track flights with airline, flight number, departure/arrival times, airports, seat, gate, terminal
- **🏨 Hotels** — Manage hotel stays with check-in/out times, room type, confirmation numbers
- **🚗 Car Rentals** — Track rental cars with pickup/dropoff locations, times, and vehicle details
- **🚂 Trains** — Organize train travel with departure/arrival stations, seat, car number
- **🚢 Cruises** — Track cruise bookings with ship name, cabin, embarkation/disembarkation ports
- **📍 Other Travel** — Flexible reservation type for tours, activities, and other bookings

### Reservation Management
- **Add Reservations** — Manually add any type of reservation to a trip
- **Edit Reservations** — Update reservation details, times, and confirmation numbers
- **Delete Reservations** — Remove individual reservations from trips
- **Confirmation Numbers** — Track booking confirmation codes
- **Notes & Details** — Add custom notes and structured details to any reservation
- **Duplicate Detection** — Automatic detection and prevention of duplicate reservations

---

## 🤖 AI-Powered Automation

### Email Forwarding
- **Unique Forwarding Address** — Each user gets a personal email address (e.g., `abc123@trips.triptrack.ai`)
- **AI Email Parsing** — Forward flight, hotel, or car rental confirmations
- **Automatic Trip Creation** — AI extracts dates, times, locations, and creates trips automatically
- **PDF Attachment Support** — AI reads PDF confirmations attached to emails
- **Image OCR** — AI extracts text from screenshots of confirmations
- **Multi-Leg Support** — Automatically splits connecting flights into separate reservations
- **Smart Trip Merging** — Groups related reservations into the same trip by destination and dates

### Gmail Auto-Scan (Pro)
- **OAuth Integration** — Securely connect your Gmail account
- **Automatic Scanning** — Scans last 6 months of emails for travel confirmations
- **Smart Filtering** — AI identifies real travel emails vs. marketing/spam
- **Known Sender Detection** — Fast-tracks emails from 200+ airlines, hotels, and booking platforms
- **Forwarded Email Support** — Catches travel emails forwarded by friends/colleagues
- **Duplicate Prevention** — Tracks processed emails to avoid re-creating trips
- **Background Sync** — Periodic automatic scans for new travel emails
- **Receipt Scanning** — Also scans for travel receipts (Uber, Lyft, hotels, etc.)

### Email Paste/Parse
- **Copy-Paste Parsing** — Paste any travel confirmation email text
- **AI Extraction** — Extracts trip details from unstructured text
- **Itinerary Support** — Handles full itineraries with multiple bookings
- **Manual Fallback** — If AI can't parse, you can still add manually

---

## 🧾 Receipt Tracking

### Receipt Management
- **Manual Entry** — Add receipts with merchant, amount, date, category
- **Camera OCR** — Scan paper receipts with your camera (AI extracts details)
- **Trip Association** — Receipts automatically link to trips by date
- **Categories** — Organize by transport, lodging, meals, or other
- **Currency Support** — Track expenses in any currency
- **Receipt Limits** — Free: 10/month, Pro: unlimited
- **Total Spend Tracking** — See total expenses per trip and overall

### Receipt Sources
- **Manual Input** — Type in receipt details
- **Camera Scan** — Take a photo of a receipt (AI extracts merchant, amount, date)
- **Gmail Auto-Scan (Pro)** — Automatically finds travel receipts in Gmail (Uber, Lyft, hotels, etc.)

---

## ✈️ Flight Status Tracking

### Real-Time Flight Updates
- **Live Flight Status** — Real-time departure/arrival times, delays, gate changes
- **Flight Status Bar** — Visual indicator on flight reservations (on-time, delayed, cancelled)
- **Automatic Updates** — Background checks for flight status changes
- **Push Notifications** — Get notified of delays, gate changes, and cancellations
- **Multiple Data Sources** — Uses AirLabs API for comprehensive coverage
- **Manual Refresh** — Pull-to-refresh for instant updates

---

## 🎫 Boarding Pass Extraction

### Boarding Pass Scanner
- **Camera Scan** — Scan physical or digital boarding passes
- **AI Extraction** — Extracts flight number, gate, seat, boarding time, confirmation code
- **Auto-Fill Reservations** — Automatically populates flight details from boarding pass
- **QR Code Support** — Reads QR codes on boarding passes
- **Multi-Format Support** — Works with various airline boarding pass formats

---

## 💬 AI Concierge

### Travel Assistant
- **Natural Language Chat** — Ask questions about your trips in plain English
- **Trip Context Awareness** — AI knows your upcoming trips, reservations, and receipts
- **Travel Recommendations** — Get suggestions for restaurants, activities, weather tips
- **Itinerary Questions** — "When's my next flight?", "What hotel am I staying at?"
- **Expense Queries** — "How much have I spent on this trip?"
- **Date-Aware** — Understands "today", "tomorrow", "next week"
- **Message Limits** — Free: 3/day, Pro: unlimited

---

## 🌤️ Weather Forecasts

### Destination Weather
- **7-Day Forecasts** — See weather for your trip destinations
- **Temperature & Conditions** — High/low temps, precipitation, conditions
- **Automatic Location Detection** — Weather shown for each trip's destination
- **Trip Timeline Integration** — Weather displayed alongside your reservations

---

## 🔔 Notifications

### Push Notifications
- **Flight Status Alerts** — Delays, gate changes, cancellations
- **Trip Reminders** — Upcoming trip notifications
- **Gmail Sync Complete** — Notification when new trips are added from Gmail
- **Receipt Scan Results** — Confirmation when receipts are processed
- **Customizable** — Enable/disable specific notification types

### In-App Notifications
- **Notification Center** — View all notifications in one place
- **Read/Unread Status** — Track which notifications you've seen
- **Action Links** — Tap to view related trip or reservation

---

## 📤 Export & Sharing

### Data Export (Pro)
- **CSV Export** — Export trips, reservations, and receipts to CSV
- **PDF Export** — Generate PDF itineraries for trips
- **Email Export** — Send itineraries via email
- **Structured Data** — All fields included (dates, times, confirmation numbers, etc.)

### Trip Sharing
- **Share Itinerary** — Share trip details via text, email, or any app
- **Formatted Text** — Clean, readable trip summary with all reservations
- **Confirmation Numbers Included** — Recipients get all booking details

---

## 👤 Account & Profile

### User Profile
- **Profile Editing** — Update name, email, avatar
- **Avatar Upload** — Custom profile picture
- **Travel Stats Dashboard** — See total trips, destinations visited, days traveling, total spend
- **Account Management** — Change password, delete account

### Authentication
- **Apple Sign-In** — Quick sign-in with Apple ID
- **Email/Password** — Traditional email authentication
- **Password Reset** — Forgot password recovery via email
- **Secure Sessions** — Automatic session management and token refresh

---

## 🔗 Connected Accounts

### Gmail Integration
- **OAuth Connection** — Secure Gmail access (read-only)
- **Multiple Accounts** — Connect multiple Gmail accounts
- **Account Management** — View, disconnect, or reconnect accounts
- **Token Refresh** — Automatic token renewal for uninterrupted access
- **Privacy First** — Only reads travel-related emails, never sends emails

### Trusted Email Senders
- **Whitelist Management** — Add trusted email addresses for forwarding
- **Spam Protection** — Only process emails from trusted senders
- **Easy Management** — Add/remove trusted senders anytime

---

## 📱 App Experience

### User Interface
- **Dark Mode** — Beautiful dark theme optimized for OLED
- **Responsive Design** — Adapts to different screen sizes (iPhone, iPad)
- **Haptic Feedback** — Tactile feedback for interactions
- **Smooth Animations** — Polished transitions and micro-interactions
- **Pull-to-Refresh** — Refresh data with a simple pull gesture
- **Skeleton Loaders** — Loading states that match content structure

### Offline Support
- **Offline Mode** — View trips and reservations without internet
- **Offline Indicator** — Visual indicator when offline
- **Data Persistence** — All data cached locally
- **Sync on Reconnect** — Automatic sync when connection restored
- **Optimistic Updates** — Instant UI updates, synced in background

### Performance
- **Fast Loading** — Optimized queries and caching
- **Background Sync** — Data syncs without blocking UI
- **Image Optimization** — Efficient image loading and caching
- **Battery Efficient** — Minimal background activity

---

## 💳 Subscription Plans

### Free Plan
- **3 Active Trips** — Track up to 3 trips at a time
- **Unlimited Reservations** — Add as many reservations as you need
- **10 Receipts/Month** — Track up to 10 receipts per month
- **3 AI Messages/Day** — Chat with AI concierge 3 times daily
- **Email Forwarding** — Forward travel confirmations to auto-create trips
- **Manual Trip Creation** — Add trips and reservations manually
- **Flight Status Tracking** — Real-time flight updates
- **Weather Forecasts** — 7-day weather for destinations
- **Push Notifications** — Get notified of flight changes

### Pro Plan ($11.99/month or $99.99/year)
- **Unlimited Trips** — No limit on active trips
- **Unlimited Reservations** — Add as many reservations as you need
- **Unlimited Receipts** — Track all your travel expenses
- **Unlimited AI Concierge** — Chat with AI as much as you want
- **Email Auto-Parsing** — AI extracts trip details from forwarded emails
- **Gmail Auto-Scan** — Automatic scanning of Gmail for travel emails
- **Receipt OCR Scanning** — Scan paper receipts with camera
- **CSV & PDF Exports** — Export your data anytime
- **Priority Support** — Faster response times
- **Annual Discount** — Save 30% with annual billing

### Team Plan ($39.99/month) — Coming Soon
- **Everything in Pro** — All Pro features included
- **5 Team Members** — Collaborate with your team
- **Shared Trip Visibility** — See team members' trips
- **Team Expense Reports** — Consolidated expense tracking
- **Admin Dashboard** — Manage team members and permissions
- **Dedicated Support** — Priority support with dedicated rep

---

## 🔒 Privacy & Security

### Data Protection
- **Encrypted Storage** — All data encrypted at rest
- **Secure Authentication** — Industry-standard auth protocols
- **HTTPS Only** — All network traffic encrypted
- **No Data Selling** — We never sell your data
- **GDPR Compliant** — European privacy standards

### Email Privacy
- **Read-Only Access** — Gmail integration never sends emails
- **Selective Scanning** — Only reads travel-related emails
- **Secure Tokens** — OAuth tokens encrypted and refreshed automatically
- **Easy Disconnect** — Revoke access anytime

### Account Control
- **Delete Account** — Permanently delete all your data
- **Export Data** — Download all your data before deleting
- **Session Management** — Automatic logout on inactivity
- **Password Security** — Secure password hashing

---

## 🌐 Platform Support

### Devices
- **iOS** — iPhone and iPad (iOS 15+)
- **Android** — Coming soon
- **Web** — Coming soon

### Languages
- **English** — Full support
- **More Languages** — Coming soon

---

## 🆘 Support

### Help Resources
- **Help Center** — Comprehensive guides and FAQs at triptrack.ai/support
- **In-App Support** — Contact support directly from the app
- **Email Support** — support@triptrack.ai
- **Priority Support** — Pro users get faster response times

---

## 🚀 Coming Soon

### Planned Features
- **Team Collaboration** — Share trips with team members
- **Calendar Integration** — Sync trips to Apple Calendar / Google Calendar
- **Expense Reports** — Generate detailed expense reports
- **Multi-Currency Support** — Automatic currency conversion
- **Travel Insurance Integration** — Link insurance policies to trips
- **Loyalty Program Tracking** — Track airline miles, hotel points
- **Packing Lists** — Smart packing suggestions based on destination and weather
- **Travel Documents** — Store passport, visa, vaccination records
- **Trip Templates** — Save and reuse common trip types
- **Shared Trips** — Collaborate on trips with travel companions
- **Android App** — Native Android version
- **Web App** — Access TripTrack from any browser

---

**Last Updated:** February 2026  
**Version:** 1.0.0

For the latest updates and feature requests, visit [triptrack.ai](https://triptrack.ai)
