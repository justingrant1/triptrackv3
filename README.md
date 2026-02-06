# TripTrack.ai

AI Travel Command Center for Business Travelers

## Overview

TripTrack automatically turns your messy travel emails into a clean, real-time itinerary. Forward your confirmation emails and TripTrack handles everything - flights, hotels, cars, meetings, and receipts all in one place.

## Features

- **Today View (Command Center)**: See what's next at a glance with the "Next Up" card, quick actions, and upcoming events
- **Trip Timeline**: Full itinerary with expandable reservation details, confirmation numbers, and status
- **Receipt Tracking**: Capture, organize, and export travel expenses
- **AI Assistant**: Ask questions about your trips
- **Notifications**: Gate changes, departure reminders, check-in alerts
- **Profile**: Email forwarding setup, subscription management

## Structure

```
src/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab navigator with 5 tabs (including center Ask AI button)
│   │   ├── index.tsx        # Today/Command Center
│   │   ├── trips.tsx        # Trips list
│   │   ├── ask-ai.tsx       # Placeholder for center tab (opens modal)
│   │   ├── receipts.tsx     # Expense tracking
│   │   └── profile.tsx      # Settings & email forwarding
│   ├── trip/
│   │   └── [id].tsx         # Trip detail/timeline (with floating Ask AI button)
│   ├── login.tsx            # Login/Signup screen with email and Apple sign-in
│   ├── notifications.tsx    # Notifications list
│   ├── add-receipt.tsx      # Add receipt modal
│   ├── edit-profile.tsx     # Edit profile screen
│   ├── subscription.tsx     # Subscription plans
│   ├── notification-settings.tsx # Notification preferences
│   ├── modal.tsx            # AI assistant modal (Concierge)
│   └── _layout.tsx          # Root layout
├── lib/
│   ├── store.ts             # Zustand store with mock data
│   ├── utils.ts             # Date formatting helpers
│   └── cn.ts                # className utility
└── components/
```

## Ask AI Button

The Ask AI button is now prominently displayed in two places:
1. **Center Tab Bar Button** - A floating purple gradient button in the center of the tab bar, visible on all tab screens
2. **Trip Detail Screen** - A floating purple button in the bottom right corner for quick access while viewing trip details

Both buttons open the AI Concierge modal where users can ask questions about their trips.

## All Buttons & Actions

### Today Screen
- Bell icon -> Notifications screen
- Active Trip card -> Trip detail
- Next Up card -> Trip detail
- Ask AI -> AI modal
- Navigate -> Opens Maps app with address
- Add Receipt -> Add receipt modal
- Upcoming items -> Trip detail
- Learn How (empty state) -> Profile

### Trips Screen
- Plus button -> Profile (how to add trips)
- Trip cards -> Trip detail
- Past trip cards -> Trip detail
- How to Add Trips -> Profile

### Trip Detail Screen
- Back button -> Go back
- Share button -> Share trip
- Reservation cards -> Expand/collapse details
- Copy confirmation -> Copy to clipboard

### Receipts Screen
- Download button -> Export expense report via Share
- Plus button -> Add receipt modal
- Scan Receipt -> Add receipt modal
- Receipt items -> Trip detail
- Add Receipt (empty state) -> Add receipt modal

### Profile Screen
- User card -> Edit profile
- Copy email -> Copy forwarding address
- Edit Profile -> Edit profile screen
- Subscription -> Subscription plans
- Notifications -> Notification settings
- Help Center -> Opens website
- Privacy Policy -> Opens website
- Sign Out -> Haptic feedback (would logout)

## Design

- Dark aviation control aesthetic
- DM Sans for body text, Space Mono for data/numbers
- Blue accent for flights, Purple for hotels, Green for cars
- Smooth animations with react-native-reanimated
- Haptic feedback on all interactions

## Mock Data

The app includes realistic mock data for demonstration:
- Active NYC trip with flight (gate changed), hotel, meeting
- Upcoming Austin Tech Summit with flight, hotel, rental car, event
- Completed London trip with receipts
- Notifications for gate changes, reminders
