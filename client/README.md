# Webhook Processor - Client Dashboard

A modern, responsive web dashboard built with Next.js 16, React 19, and Tailwind CSS for real-time monitoring, inspection, and management of webhook events and background processing.

---

## Features

- **Status Overview & Metrics**: Real-time counter cards showing event distribution (`Pending`, `Processing`, `Completed`, `Failed / Permanently Failed`).
- **Interactive Event Table**:
  - View event ID, event type, status badge, attempt counts, order/customer references, and timestamps.
  - Search and filter by event ID, event type, customer ID, order ID, or processing status.
- **Detailed Event Inspection**:
  - Expandable drawer/accordion for each event showing the raw incoming JSON payload.
  - Granular attempt history: attempt numbers, durations, worker IDs, HTTP status codes, and error traces.
- **Manual Retry Action**: Trigger manual retries directly from the UI for failed or stuck webhook events.
- **Auto-polling / Refresh**: Synchronizes with the backend `GET /events` endpoint to reflect processing state changes.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Library**: [React 19](https://react.dev/)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Containerization**: Docker (Alpine multi-stage build)

---

## Directory Structure

```text
client/
├── public/                 # Static assets and icons
├── src/
│   ├── app/
│   │   ├── favicon.ico
│   │   ├── globals.css     # Global styles and Tailwind imports
│   │   ├── layout.tsx      # Root HTML layout and metadata
│   │   └── page.tsx        # Main dashboard page with event fetching and state
│   ├── components/
│   │   ├── StatusBadge.tsx # Status pill component with color indicators
│   │   ├── StatusCounts.tsx# Aggregate count cards for quick filtering
│   │   └── WebhookTable.tsx# Webhook list, expanded payload viewer & retry controls
│   └── types/
│       └── webhook.ts      # TypeScript definitions for events, payloads, and retries
├── Dockerfile              # Production multi-stage Docker build
├── next.config.ts          # Next.js configuration
├── package.json            # Scripts and dependencies
└── tsconfig.json           # TypeScript configuration
```

---

## Environment Variables

Configure environment variables in a `.env.local` file in the `client/` folder:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Base URL of the Webhook Processor backend server | `http://localhost:3001` |

---

## Getting Started

### 1. Prerequisites

- **Node.js**: v20+ or v22+
- **npm** (or yarn / pnpm / bun)
- Running Webhook Processor backend server (defaults to port `3001`)

### 2. Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install
```

### 3. Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Production Build

```bash
# Build the application
npm run build

# Start the production server
npm run start
```

### 5. Linting

```bash
npm run lint
```

---

## Docker

You can build and run the client dashboard independently with Docker:

```bash
# Build the Docker image
docker build -t webhook-client -f Dockerfile .

# Run the container mapping port 3000
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL="http://localhost:3001" webhook-client
```

Or start the entire stack (PostgreSQL, server, and client) using Docker Compose from the project root:

```bash
docker compose up -d
```
