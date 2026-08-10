# Privacy Policy — Aesthetic Physique Enthusiast Application (APE)

**Last updated:** August 10, 2026  
**Developer:** NARBE LLC

## Overview

Aesthetic Physique Enthusiast Application (APE) is a fitness tracking application that runs entirely in your browser. NARBE LLC does not operate backend servers for this application. All user data is stored locally on your device or in your personal Google Drive account. NARBE LLC does not collect, store, access, or transmit any user data to its own servers.

## Data Storage

**Local storage:** Workout logs, nutrition entries, measurements, progress photos, profile information, and application settings are stored in your browser's local storage (IndexedDB and localStorage). This data never leaves your device unless you choose to sign in with Google, or you choose to use an optional AI feature (see "AI Features and Your Data" below).

**Google Drive storage:** If you sign in with Google, the app stores a backup of your data in your personal Google Drive account — specifically in a hidden app-specific data folder and an "APE App" folder visible in your Drive. This data is stored in your Drive, not on any NARBE LLC server. Only you (and anyone you explicitly share access with, such as a coach) can access this data.

## Google API Usage & Scopes

APE uses Google Sign-In for authentication and the Google Drive API for data synchronization. The app requests the following permissions:

- **openid, email, profile** — To identify your Google account and display your name and profile picture within the app.
- **drive.appdata** — To read and write app-specific sync data in a hidden folder in your Google Drive that is not visible to you or other apps.
- **drive.file** — To create and manage files the app creates in your Google Drive, such as the "APE App" folder, progress photos, and coach sharing files. The app can only access files it has created — it cannot read, modify, or delete any other files in your Drive.

APE's use of Google API data adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements:

- The app does **not** transfer Google user data to third parties.
- The app does **not** use Google user data for serving advertisements.
- The app does **not** use Google user data to train machine learning or artificial intelligence models.
- The app accesses only the minimum data necessary to provide its features.
- The app does **not** allow humans to read user data, except where the user has given explicit consent (e.g., coach sharing), or where required by law.

## Coach Sharing

If you choose to share your data with a coach, the app creates a file in your Google Drive containing your profile, workout, nutrition, measurement, and check-in data. This file is shared with your coach's specific Google account using Google Drive's built-in sharing permissions. You control this sharing and can revoke access at any time from within the app, which deletes the shared file from your Drive.

Progress photos shared with a coach are stored as individual files in your Google Drive's "APE App/Progress Photos" folder. The coach can only access these photos through authenticated Google Drive API calls using their own Google account.

Coaches may back up client data to their own Google Drive for safekeeping. This backup is stored in the coach's personal Drive, not on any NARBE LLC server.

## Third-Party API Keys

The app optionally supports USDA FoodData Central and third-party AI provider integrations (such as Anthropic, OpenAI, OpenRouter, and Google). If you choose to enter API keys for these services, those keys are stored only in your browser's local storage on your device. They are never synced to Google Drive, transmitted to NARBE LLC, or shared with any third party. API calls using these keys are made directly from your browser to the respective service providers.

## AI Features and Your Data

APE's AI features are optional. They require you to supply your own API key, do nothing until you start them, and are unavailable entirely if you never add a key. When you use one, the app sends the data that feature needs directly from your browser to the AI provider your API key belongs to. NARBE LLC never receives or stores that data.

- **AI Coach** sends a summary of your recent training, nutrition, weight, and check-in numbers.
- **AI Food Scanner** sends the food photo you capture.
- **AI Progress Photo Review** sends the two progress photos you select, along with your goal, calorie and protein targets, weight change, and measurement changes over the period between them. The two photos you pick are the only images sent; your other progress photos are never uploaded. Optionally, and only if you tick the box for it, the app also sends the *dates* of your other photos so the review can comment on how consistently you take them — never those images. Nothing is sent until you tap Analyze, and only after you have accepted an in-app consent prompt explaining this.

Data sent to an AI provider is handled under that provider's terms of service, privacy policy, and data-retention practices, which you should review before enabling these features. AI-generated feedback in APE is informational only and is not medical, dietary, or professional advice. You can turn any AI feature off, or remove your API key entirely, in Settings.

## Data Collection

NARBE LLC does not collect any personal data, usage analytics, telemetry, crash reports, or behavioral data from APE users. The app runs entirely in your browser. There are no tracking pixels, analytics scripts, or third-party data collection tools embedded in the application.

## Data Deletion

You can delete all your data at any time from within the app (Settings > Data Management > Clear All Data). This removes all locally stored data and, if signed in with Google, also deletes the "APE App" folder and all app-specific data from your Google Drive. After deletion, no data remains on your device or in your Google Drive from this application.

## Children's Privacy

APE is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. Since no data is transmitted to NARBE LLC, no children's data is collected or stored by us.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the "Last updated" date at the top of this page. Continued use of the app after changes constitutes acceptance of the updated policy.

## Contact

If you have questions about this Privacy Policy, contact NARBE LLC at narbehousellc@gmail.com.
