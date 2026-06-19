# FitOS — Full-Stack Fitness App
## Claude Code Project Brief

---

## Project Overview

Build a **free, no-signup, privacy-first fitness web app** that lives entirely in the browser. All data is stored locally (IndexedDB + localStorage). Users export/import their data as JSON backups. No accounts, no server, no subscriptions.

This app should be **better than most paid fitness apps** in terms of features, design, and usability.

**Stack:** React + TypeScript + Vite + Tailwind CSS  
**Storage:** IndexedDB (via `idb` library) for large data (photos, history), localStorage for settings/preferences  
**Deployment target:** Vercel or Netlify (free tier), or GitHub Pages  
**PWA:** Yes — add to home screen, offline support, splash screen  
**Design ethos:** Dark theme, clean, gym-aesthetic, feels premium. Think Whoop or Levels — not MyFitnessPal.

---

## Core Architecture

### Multi-Profile System
- App opens to a **Profile Selector** screen
- Each profile is fully isolated (own workouts, macros, photos, measurements, settings)
- Profile data: `{ id, name, goal, startDate, avatar_color, units: "imperial"|"metric" }`
- Max 5 profiles (localStorage constraint)
- Active profile stored in localStorage, all other data keyed by profile ID in IndexedDB

### Navigation
Five main tabs (bottom nav on mobile, sidebar on desktop):
1. **Dashboard** — summary, graphs, quick-start
2. **Workout** — program builder, active workout, history
3. **Nutrition** — macro tracker, food log, USDA search, AI vision
4. **Progress** — photos, measurements, weight trend
5. **Settings** — API keys, export/import, profile management

---

## Section 1: Dashboard

### Features
- Greeting with profile name and current date
- **Weekly ring** — workouts completed vs target (e.g., 3/5 days)
- **Macro summary card** — today's calories/protein/carbs/fat vs targets, shown as progress bars
- **Weight trend** — sparkline of last 30 days
- **Quick-start buttons** — tap to start any workout day immediately
- **PRs this week** — any new personal records logged
- **Streak counter** — consecutive days with any logged activity (workout OR nutrition log)

### Graphs (use Recharts)
- Line graph: bodyweight over time (30d / 90d / all-time toggle)
- Bar graph: weekly workout volume (total sets per week)
- Macro consistency score: % of days hitting protein target

---

## Section 2: Workout Hub

### Program Structure
```typescript
interface Program {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean; // built-in templates cannot be deleted, only duplicated
  days: WorkoutDay[];
  createdAt: string;
  updatedAt: string;
}

interface WorkoutDay {
  id: string;
  label: string;       // "Day 1", "Day 2" etc
  tag: string;         // "UPPER A", "LOWER", "FULL BODY" etc
  title: string;       // "Chest Focus"
  subtitle: string;
  accent: string;      // hex color
  note: string;        // coach note shown during workout
  exercises: Exercise[];
}

interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;        // "10-12", "AMRAP", "15-20/leg" etc
  muscle: string;
  note: string;
  flag?: string;       // "L5S1", "Injury caution" etc
}
```

### Built-in Templates (3 required, ship as JSON files in `/src/data/`)

#### Template 1: Ari's 5-Day Upper/Lower
**Pattern:** Upper A · Lower A · Rest · Upper B · Lower B · Full Body · Rest

**Day 1 — Upper A (Chest Focus)**
- Ring Pushups — 3×12-15 — Chest — "3s eccentric. Pre-exhausts pec before pressing."
- Single Arm Cable Fly — 3×15-20 — Chest — "Constant tension. Chase the stretch."
- Incline Smith Press — 3×10-12 — Chest/Front Delt — "Arms pre-fatigued. Moderate weight."
- Cable Side Raises (single arm) — 4×15-20 — Side Delt — "Constant tension. Slight forward lean."
- Weighted Dips — 3×8-12 — Triceps/Chest — "Forward lean to bias chest."
- Skull Crushers (DB) — 3×10-12 — Triceps — "Lower behind head for long head stretch."
- Tricep Pressdowns (cable) — 2×15-20 — Triceps — "Pump finisher."
- Facepulls — 3×15-20 — Rear Delt/RC — "Every upper day. Non-negotiable."

**Day 2 — Lower A (Quad Focus)**
- Light Smith Squats (upright) — 3×12-15 — Quads — flag: "L5S1" — "Never load heavy."
- Seated Leg Extensions — 4×15-20 — Quads — "Pause at top."
- Single Leg Step Ups — 4×12-15/leg — Glutes — "Drive through heel."
- Walking Lunges (DB) — 3×12-15/leg — Glutes/Quads — "Longer stride = more glute."
- Lying Leg Curls — 3×12-15 — Hamstrings — "Point toes for max recruitment."
- Weighted Hyperextensions — 4×12-15 — Glutes/Hams/Low Back — "1s hold at top. Centerpiece."
- Standing Calf Raises — 4×15-20 — Calves — "2s pause at stretch."

**Day 3 — REST**

**Day 4 — Upper B (Shoulder & Back Focus)**
- DB Seated Shoulder Press — 4×10-12 — Shoulders — "Primary compound today. Push overhead."
- Cable Side Raises (single arm) — 3×15-20 — Side Delt — "Second lateral hit this week."
- Weighted Chinups — 4×6-10 — Back/Biceps — "Full dead hang."
- Wide Grip Pullups or Pulldowns — 3×8-12 — Lats — "Lat width focus."
- Single Arm DB Row — 3×10-12/side — Mid Back — "Heavy. Brace hard."
- Close Grip Cable Pullovers — 3×12-15 — Lats — "Long head stretch. Ribs down."
- Rear Delt Flies — 3×15-20 — Rear Delt — "Light, high reps."
- Facepulls — 3×15-20 — Rear Delt/RC — "Every upper day."
- Single Arm Preacher Curl — 3×10-12 — Biceps — "Slow negative."
- Hammer Curls (DB) — 2×12-15 — Biceps/Forearms
- Cable Forearm Curls — 2×15-20 — Forearms — "Finisher."

**Day 5 — Lower B (Hamstring Focus)**
- Lying Leg Curls — 4×10-12 — Hamstrings — "Lead with hams today. Go heavier."
- Weighted Hyperextensions — 4×12-15 — Glutes/Hams/Low Back — "Second hit this week."
- Single Leg Step Ups — 3×12-15/leg — Glutes
- Seated Leg Extensions — 3×15-20 — Quads — "Maintenance volume."
- Walking Lunges (DB) — 3×12-15/leg — Glutes/Quads — "Longer stride, bias glutes."
- Seated Calf Raises — 4×15-20 — Calves — "Seated hits soleus."

**Day 6 — Full Body (Frequency Day)**
- Incline Smith Press — 2×12-15 — Chest — "65-70% effort. Mind-muscle."
- Single Arm Cable Fly — 2×15-20 — Chest
- DB Seated Shoulder Press — 2×12-15 — Shoulders — "Third shoulder hit."
- Weighted Chinups or Pulldowns — 3×8-12 — Back/Biceps
- Single Arm DB Row — 2×12/side — Mid Back
- Cable Side Raises — 3×15-20 — Side Delt
- Facepulls — 3×15-20 — Rear Delt/RC
- Weighted Hyperextensions — 3×12-15 — Glutes/Hams/Low Back — "Drop weight 20% from heaviest day."
- Seated Leg Extensions — 2×15-20 — Quads
- Hammer Curls (DB) — 2×12-15 — Biceps/Forearms
- Tricep Pressdowns — 2×15-20 — Triceps

**Day 7 — REST**

---

#### Template 2: Full Body 3x/Week
**Pattern:** Full Body A · Rest · Full Body B · Rest · Full Body C · Rest · Rest

**Full Body A — Push Dominant**
- Barbell Squat — 4×6-8 — Quads/Glutes
- Bench Press — 4×8-10 — Chest
- Overhead Press — 3×8-10 — Shoulders
- Romanian Deadlift — 3×10-12 — Hamstrings/Glutes
- Cable Lateral Raises — 3×15-20 — Side Delt
- Tricep Pressdowns — 3×12-15 — Triceps
- Plank — 3×45s — Core

**Full Body B — Pull Dominant**
- Deadlift — 4×5 — Full Body
- Pull-Ups or Pulldowns — 4×8-10 — Back/Biceps
- Incline DB Press — 3×10-12 — Chest
- DB Row — 3×10-12/side — Mid Back
- Face Pulls — 3×15-20 — Rear Delt/RC
- Barbell Curl — 3×10-12 — Biceps
- Leg Press — 3×12-15 — Quads

**Full Body C — Balanced**
- Front Squat or Goblet Squat — 3×10-12 — Quads
- Weighted Dips — 3×8-12 — Chest/Triceps
- Barbell Row — 4×8-10 — Back
- Leg Curl — 3×12-15 — Hamstrings
- Arnold Press — 3×10-12 — Shoulders
- Hammer Curls — 2×12-15 — Biceps/Forearms
- Standing Calf Raises — 4×15-20 — Calves
- Ab Wheel or Rollouts — 3×10 — Core

---

#### Template 3: Bro Split 5x/Week
**Pattern:** Chest · Back · Shoulders · Arms · Legs · Rest · Rest

**Day 1 — Chest**
- Flat Barbell Bench Press — 4×8-10
- Incline DB Press — 4×10-12
- Cable Crossovers — 3×15-20
- Pec Deck or Machine Fly — 3×12-15
- Dips (chest focused) — 3×10-12
- Push-Ups (burnout) — 1×AMRAP

**Day 2 — Back**
- Deadlift — 4×5
- Barbell Row — 4×8-10
- Pull-Ups or Pulldowns — 4×8-10
- Seated Cable Row — 3×10-12
- Single Arm DB Row — 3×10-12/side
- Face Pulls — 3×15-20

**Day 3 — Shoulders**
- Seated DB Press — 4×10-12
- Barbell Overhead Press — 3×8-10
- Lateral Raises — 4×15-20
- Rear Delt Flies — 3×15-20
- Upright Rows — 3×12-15
- Shrugs — 3×15-20

**Day 4 — Arms**
- Barbell Curl — 4×10-12
- Skull Crushers — 4×10-12
- Incline DB Curl — 3×12-15
- Close Grip Bench Press — 3×10-12
- Hammer Curls — 3×12-15
- Tricep Pressdowns — 3×15-20
- Preacher Curl — 2×12-15
- Overhead Tricep Extension — 2×15-20

**Day 5 — Legs**
- Barbell Squat — 4×8-10
- Leg Press — 4×12-15
- Romanian Deadlift — 3×10-12
- Leg Extensions — 3×15-20
- Lying Leg Curls — 3×12-15
- Standing Calf Raises — 5×15-20
- Seated Calf Raises — 3×20

---

### Program Editor
Full CRUD on programs:
- **Duplicate** any template to create a personal version
- **Rename** program, day, or exercise
- **Reorder** exercises via drag-and-drop (use `@dnd-kit/core`)
- **Add exercise** — name, sets, reps, muscle group, notes, flag
- **Remove exercise** — confirm dialog
- **Add day** — blank or copy from another day
- **Remove day** — confirm dialog
- **Change day accent color** — color picker (6 preset colors)
- **Export program** — downloads as `program-name.json`
- **Import program** — drag JSON file or tap to open file picker
- Built-in templates can be **duplicated but not edited directly**

### Active Workout Mode
```typescript
interface WorkoutSession {
  id: string;
  programId: string;
  dayId: string;
  date: string;         // ISO date
  startTime: number;    // timestamp
  endTime?: number;
  sets: {
    [exerciseId: string]: SetLog[];
  };
  notes?: string;
  bodyweight?: number;
}

interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
  timestamp: number;
}
```

Active workout features:
- Previous session shown as placeholder values for every set
- Checkmark to complete a set → auto-starts rest timer (90s default, adjustable)
- **Rest timer** — circular progress, shows countdown, vibrates on mobile when done (`navigator.vibrate`)
- Exercises collapse when all sets are checked
- **Finish Workout** button (sticky bottom) shows elapsed time
- Session saved to IndexedDB on finish
- **PR detection** — compare weight against all previous sessions for that exercise → show "🏆 New PR!" toast

### Workout History & Analytics
- Sessions list per day, sorted by date
- Tap any session to see full set logs
- **Volume chart** — total sets per week (Recharts bar chart)
- **Strength trend** — best weight per exercise over time (line chart)
- **PR tracker** — table of all-time PRs per exercise

---

## Section 3: Nutrition Hub

### Daily Macro Targets (set in Profile)
- Calories, Protein (g), Carbs (g), Fat (g)
- These are also used in the Dashboard progress bars

### Food Log
```typescript
interface FoodEntry {
  id: string;
  date: string;           // "YYYY-MM-DD"
  profileId: string;
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;    // "g", "oz", "cup", "serving"
  servingsConsumed: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  source: "manual" | "usda" | "ai_vision";
  fdcId?: string;         // USDA FoodData Central ID
  loggedAt: string;       // ISO timestamp
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
}
```

### Input Methods

#### 1. Manual Entry
Form with fields: food name, calories, protein, carbs, fat, serving size, serving unit, servings consumed, meal type. Simple and fast.

#### 2. USDA FoodData Central Search
- API docs: https://fdc.nal.usda.gov/api-guide.html
- Free API key: https://fdc.nal.usda.gov/api-key-signup.html (email signup, instant)
- Key stored in localStorage under profile settings
- Search endpoint: `GET https://api.nal.usda.gov/fdc/v1/foods/search?query={query}&api_key={key}`
- Food detail: `GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}?api_key={key}`
- Parse nutrient IDs from results: Calories=1008, Protein=1003, Carbs=1005, Fat=1004, Fiber=1079
- Show top 10 results with name, brand (if any), and macros per 100g
- User selects food → enters serving size and quantity → adds to log
- **No API key?** Show message: "Get your free USDA API key at fdc.nal.usda.gov — takes 30 seconds, just enter your email."

#### 3. AI Food Vision (Optional)
- Requires a **Claude API key** (stored in localStorage)
- Get one at: https://console.anthropic.com — free credits on signup
- UI flow:
  1. User taps "Scan Food" camera button
  2. Camera opens (`getUserMedia` or `<input type="file" accept="image/*" capture="environment">`)
  3. User takes photo or selects from camera roll
  4. App sends image to Claude API (`claude-sonnet-4-6`) with this exact system prompt:

```
You are a nutrition estimation assistant. Analyze the food in the image and estimate nutritional content.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "foods": [
    {
      "name": "Food name",
      "estimatedAmount": "e.g. 150g, 1 cup, 1 medium",
      "calories": 250,
      "protein": 30,
      "carbs": 15,
      "fat": 8,
      "confidence": "high|medium|low",
      "notes": "Brief note about the estimate"
    }
  ],
  "totalCalories": 250,
  "totalProtein": 30,
  "totalCarbs": 15,
  "totalFat": 8,
  "disclaimer": "These are estimates. Verify against packaging when possible."
}
```

  5. Parse JSON response, show each detected food with estimated macros
  6. User can **edit any value** before confirming
  7. User taps "Add to Log" → entries saved with `source: "ai_vision"`
  8. Show disclaimer under AI-estimated entries in the log

**Claude API call (client-side):**
```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": claudeApiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
        { type: "text", text: "Analyze this food and estimate the nutrition." }
      ]
    }]
  })
});
```

### Nutrition Log UI
- Day view with meal sections (Breakfast, Lunch, Dinner, Snacks)
- Total macros at bottom vs daily targets — shown as colored progress bars
- Calories in large type, protein/carbs/fat below
- **Copy yesterday's log** button — duplicates all entries to today
- **Favorite foods** — star any entry to save it as a quick-add template
- Swipe to delete on mobile (or trash icon on desktop)

### Nutrition Graphs (Recharts)
- **Daily macro breakdown** — stacked bar chart (last 7 days), protein/carbs/fat stacked
- **Calorie trend** — line chart (last 30 days) with target line overlaid
- **Protein consistency** — bar chart showing daily protein vs target (last 14 days)
- **Macro split pie** — donut chart for today's macros

---

## Section 4: Progress Hub

### Weight & Measurements Tracking
```typescript
interface Measurement {
  id: string;
  profileId: string;
  date: string;         // "YYYY-MM-DD"
  weight?: number;
  weightUnit: "lbs" | "kg";
  measurements?: {
    chest?: number;
    waist?: number;
    hips?: number;
    leftArm?: number;
    rightArm?: number;
    leftThigh?: number;
    rightThigh?: number;
    neck?: number;
    shoulders?: number;
  };
  notes?: string;
}
```

- Log weight + any measurements (all optional)
- Calendar view showing which days have entries
- **Graphs (Recharts line charts):**
  - Weight over time (30d / 90d / all-time)
  - Any body measurement over time
  - All measurements on one multi-line chart (each a different color)

### Progress Photos
```typescript
interface ProgressPhoto {
  id: string;
  profileId: string;
  date: string;
  time: string;
  pose: "front" | "side_left" | "side_right" | "back";
  imageData: string;    // base64 stored in IndexedDB
  weight?: number;
  notes?: string;
}
```

**Guided Photo Capture:**
- Camera opens with a **silhouette overlay** showing exactly how to stand
- Instructions displayed:
  - "Stand 6 feet from phone"
  - "Feet shoulder width apart"
  - "Arms slightly away from body"
  - "Look straight ahead"
- Pose selector: Front / Side (L) / Side (R) / Back
- After capture: preview with accept/retake options
- Optional: add weight and notes before saving
- Saved to IndexedDB with date + time filename format: `front_2025-06-17_0830`

**Photo Gallery:**
- Grid view sorted by date (newest first)
- Filter by pose
- Tap to enlarge
- Long press (or button) to delete

**Time Lapse Generator:**
- Select pose (e.g., "Front")
- App pulls all front-pose photos in chronological order
- Renders them as a slideshow: 0.5s per photo
- Built with HTML5 Canvas — draw each image frame by frame
- **Export as GIF** — use `gif.js` library or `canvas-to-gif`
- **Play in app** — canvas animates through frames
- Show date overlay on each frame

**Implementation note for time lapse:**
```javascript
// Load images from IndexedDB, draw to canvas sequentially
async function generateTimelapse(photos: ProgressPhoto[]) {
  const canvas = document.getElementById('timelapse-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  for (const photo of photos) {
    const img = new Image();
    img.src = photo.imageData;
    await new Promise(resolve => img.onload = resolve);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
```

---

## Section 5: Settings

### API Keys Panel
- **USDA FoodData Central API Key**
  - Input field (masked)
  - Link: "Get free key → fdc.nal.usda.gov/api-key-signup.html"
  - "Test Key" button — makes a test search for "chicken" to verify it works
  - Show green checkmark if valid, red X if not
- **Claude AI Vision API Key (Optional)**
  - Input field (masked)
  - Link: "Get key → console.anthropic.com"
  - Explanation: "Used for AI food photo scanning. ~$0.003 per photo."
  - "Test Key" button — sends a minimal test request
  - Toggle to enable/disable AI vision without deleting key

### Data Management
- **Export All Data** — downloads `fiitos-backup-{date}.json` containing ALL profiles, workouts, nutrition logs, measurements (not photos — too large)
- **Export Photos** — separate export, downloads a zip of all photos for current profile (use JSZip)
- **Import Data** — merge or replace, with clear warning dialog
- **Clear Profile Data** — delete one profile's data
- **Clear All Data** — nuclear option, confirm dialog

### Profile Management
- Create new profile
- Edit profile name/goal/units
- Switch active profile
- Delete profile (with confirm)

### App Settings (per profile)
- Default rest timer duration (60s / 90s / 120s / custom)
- Weight units (lbs / kg)
- Macro targets (calories, protein, carbs, fat)
- Measurement units (inches / cm)
- Theme (Dark only for now — light mode future)

---

## File Structure

```
fitness-app/
├── public/
│   ├── manifest.json          # PWA manifest
│   └── icons/                 # App icons (192x192, 512x512)
├── src/
│   ├── main.tsx
│   ├── App.tsx                # Router, profile gate
│   ├── data/
│   │   ├── programs/
│   │   │   ├── upper-lower-5day.json
│   │   │   ├── full-body-3day.json
│   │   │   └── bro-split.json
│   ├── db/
│   │   ├── index.ts           # IndexedDB setup via idb
│   │   ├── workouts.ts        # CRUD for workout sessions
│   │   ├── nutrition.ts       # CRUD for food log
│   │   ├── progress.ts        # CRUD for measurements + photos
│   │   └── programs.ts        # CRUD for custom programs
│   ├── hooks/
│   │   ├── useProfile.ts
│   │   ├── useWorkout.ts
│   │   ├── useNutrition.ts
│   │   └── useProgress.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── workout/
│   │   │   ├── ProgramList.tsx
│   │   │   ├── ProgramEditor.tsx
│   │   │   ├── WorkoutDay.tsx
│   │   │   ├── ActiveWorkout.tsx
│   │   │   ├── SetLogger.tsx
│   │   │   ├── RestTimer.tsx
│   │   │   └── WorkoutHistory.tsx
│   │   ├── nutrition/
│   │   │   ├── FoodLog.tsx
│   │   │   ├── FoodSearch.tsx       # USDA API search
│   │   │   ├── ManualEntry.tsx
│   │   │   ├── AIFoodScanner.tsx    # Claude vision
│   │   │   ├── MacroBar.tsx
│   │   │   └── NutritionCharts.tsx
│   │   ├── progress/
│   │   │   ├── PhotoCapture.tsx
│   │   │   ├── PhotoGallery.tsx
│   │   │   ├── TimeLapse.tsx
│   │   │   ├── MeasurementLog.tsx
│   │   │   └── ProgressCharts.tsx
│   │   ├── dashboard/
│   │   │   ├── WeeklyRing.tsx
│   │   │   ├── MacroSummary.tsx
│   │   │   ├── WeightSparkline.tsx
│   │   │   └── QuickStart.tsx
│   │   └── shared/
│   │       ├── Toast.tsx
│   │       ├── Modal.tsx
│   │       ├── ConfirmDialog.tsx
│   │       └── EmptyState.tsx
│   ├── pages/
│   │   ├── ProfileSelector.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Workout.tsx
│   │   ├── Nutrition.tsx
│   │   ├── Progress.tsx
│   │   └── Settings.tsx
│   ├── utils/
│   │   ├── exportImport.ts    # JSON export/import logic
│   │   ├── photoExport.ts     # JSZip photo export
│   │   ├── timelapse.ts       # Canvas timelapse generator
│   │   ├── usda.ts            # USDA API wrapper
│   │   ├── claudeVision.ts    # Claude API wrapper
│   │   └── dateHelpers.ts
│   └── types/
│       └── index.ts           # All TypeScript interfaces
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── index.html
```

---

## Dependencies

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "idb": "^8",
    "recharts": "^2",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^8",
    "jszip": "^3",
    "gif.js": "^0.2",
    "lucide-react": "^0.400"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8",
    "vite-plugin-pwa": "^0.19"
  }
}
```

---

## Design System

### Colors
```
Background:     #0e0e10  (near black)
Surface:        #13131a  (card bg)
Surface raised: #18181f  (elevated card)
Border:         #1c1c24
Border light:   #252535
Text primary:   #f0f0f0
Text secondary: #888
Text muted:     #444

Accent colors per workout day:
  Upper A:    #e8572a  (orange-red)
  Lower A:    #2e9e6b  (green)
  Upper B:    #5b6ef5  (blue-purple)
  Lower B:    #1a7a52  (dark green)
  Full Body:  #c44fc4  (purple)

Nutrition:    #f5a623  (amber)
Progress:     #5b6ef5  (blue)
Success:      #2e9e6b
Warning:      #e8a020
Danger:       #e85757
```

### Typography
- Font: System font stack (no external fonts needed for performance)
- Display: 900 weight, tight letter-spacing
- Body: 400-600 weight
- Labels: 700 weight, uppercase, wide letter-spacing

### Mobile-First
- Bottom nav 56px fixed
- Touch targets minimum 44px
- All inputs optimized for mobile keyboard (`inputMode="decimal"` for numbers)
- Swipe gestures where appropriate
- `navigator.vibrate([50])` on set completion

---

## PWA Configuration

```json
// public/manifest.json
{
  "name": "FitOS",
  "short_name": "FitOS",
  "description": "The free fitness app that lives on your phone",
  "theme_color": "#0e0e10",
  "background_color": "#0e0e10",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Use `vite-plugin-pwa` for service worker generation.

---

## Build & Deploy

```bash
# Install
npm create vite@latest fitness-app -- --template react-ts
cd fitness-app
npm install idb recharts @dnd-kit/core @dnd-kit/sortable jszip lucide-react react-router-dom
npm install -D tailwindcss autoprefixer postcss vite-plugin-pwa
npx tailwindcss init -p

# Dev
npm run dev

# Build
npm run build

# Deploy to Vercel (free)
npx vercel --prod
# OR
# Push to GitHub → connect to Vercel → auto-deploys on every push
```

---

## Claude Code Session Instructions

When starting this project in Claude Code:

1. **Read this entire brief first**
2. **Build in this order:**
   - Project scaffold (Vite + React + TS + Tailwind + PWA)
   - IndexedDB setup (`/src/db/`)
   - Profile system + ProfileSelector screen
   - Bottom navigation + routing
   - Workout hub (program display → editor → active workout → history)
   - Nutrition hub (manual entry → USDA search → AI vision)
   - Progress hub (measurements → photos → timelapse)
   - Dashboard (charts + summary)
   - Settings (API keys + export/import)
   - PWA manifest + icons
   - Final polish pass

3. **At each step:** Make it fully functional before moving to the next section. Don't scaffold everything then fill in — build real working features.

4. **Test as you go:** Check mobile layout in browser devtools at every step.

5. **The workout program data** — the full exercise list for all 3 templates is in this brief. Hardcode it into the JSON files exactly as specified.

---

## Key Constraints & Notes

- **Zero server** — everything client-side. No API routes, no database, no auth.
- **No signup flow** — app opens to Profile Selector, that's it.
- **API keys are optional** — app must be fully useful without any API keys. USDA and Claude keys unlock extra features but nothing breaks without them.
- **iOS Safari compatibility** — IndexedDB works but storage can be evicted. Add an "Export your data" reminder banner if last export was > 7 days ago.
- **Photos are large** — compress images to max 800px wide / 80% JPEG quality before storing in IndexedDB. This keeps storage manageable.
- **The USDA API key is free** — make this obvious in the UI. Don't make it feel like a paid feature.
- **The Claude vision API key costs money** — be upfront about this (~$0.003/photo). Frame it as "less than a penny per photo."

---

*Built for Ari Rosenberg — NARBE Foundation*  
*Brief generated via Claude — June 2025*
