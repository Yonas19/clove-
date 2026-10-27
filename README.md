# Clove

<p align="center">
  <img src="docs/images/banner.png" alt="Clove Banner" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/Yonas19/clove-/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  </a>
  <img src="https://img.shields.io/badge/Next.js-14%2B-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-Styled-38B2AC?logo=tailwind-css" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/SQLite-Local_Storage-003B57?logo=sqlite" alt="SQLite" />
</p>

---

## Overview

**Clove** is a high-performance inventory and item intake system powered by real-time computer vision and camera detection. Designed for salvage pipelines, asset tracking, and warehouse cataloging, Clove minimizes manual data entry by processing video/camera feeds directly in the intake workflow.

<p align="center">
  <img src="docs/images/intake-preview.png" alt="Clove Intake Dashboard and Camera Detection Preview" width="85%" />
</p>

---

## Key Features

- **Real-Time Camera Detection:** Integrated live feed processing (`/app/intake`) for instant object classification and item tagging.
- **Streamlined Intake Pipeline:** Step-by-step workflow designed for high-throughput scanning, verification, and salvage recording.
- **Local Persistence & Sync:** SQLite-backed local storage (`data/salvage.db`) ensuring offline tolerance and low latency.
- **Adaptive UI:** Responsive interface optimized for both desktop terminals and handheld intake tablets.
- **Fully Type-Safe:** Next.js App Router and TypeScript integration for reliable client-server state transitions.

---

## System Architecture

```text
               +---------------------------+
               |     Webcam / Camera Feed  |
               +-------------+-------------+
                             |
                             v
               +---------------------------+
               |   Clove Intake Scanner    |
               |     (Next.js Client)      |
               +-------------+-------------+
                             |
       +---------------------+---------------------+
       |                                           |
       v                                           v
+-------------------------+             +-------------------------+
|  Real-Time Detection UI |             | SQLite Salvage DB       |
|  (Preview & Annotation) |             | (Local Persistence)     |
+-------------------------+             +-------------------------+
```

---

## Repository Structure

```text
clove/
├── app/
│   ├── intake/             # Intake scanner & camera detection UI
│   │   └── page.tsx
│   ├── layout.tsx          # Root layout & global style providers
│   └── page.tsx            # Application entry & overview dashboard
├── components/             # Reusable UI elements, modals, and buttons
├── data/                   # Runtime SQLite storage and schemas
│   └── salvage.db
├── docs/
│   └── images/             # Documentation screenshots and assets
│       ├── banner.png
│       └── intake-preview.png
├── public/                 # Static web assets
├── next.config.mjs
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.17+ recommended)
- `npm`, `pnpm`, or `yarn`
- Web browser with webcam permissions enabled (for camera detection)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Yonas19/clove-.git
   cd clove-
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment settings:**
   Create a `.env.local` file in your root folder:
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser and allow camera permissions when prompted on the `/intake` route.

---

## Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs the Next.js local development server |
| `npm run build` | Builds an optimized production bundle |
| `npm run start` | Launches the production server |
| `npm run lint` | Analyzes code for ESLint errors |

---

## Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/camera-optimization`)
3. Commit your Changes (`git commit -m 'feat: improve detection accuracy'`)
4. Push to the Branch (`git push origin feature/camera-optimization`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
