import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function Privacy() {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate();
  } catch {
    // Rendered outside a router (no-profile view) — back button uses history API
  }

  const handleBack = () => {
    if (navigate) {
      navigate(-1);
    } else {
      window.history.back();
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text-primary max-w-2xl mx-auto">
      <div className="sticky top-0 bg-bg border-b border-border px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={handleBack} className="p-1.5 -ml-1.5 rounded-xl hover:bg-surface transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold">Privacy Policy</h1>
      </div>
      <div className="px-6 py-6 space-y-6">
      <p className="text-xs text-text-muted">Last updated: June 22, 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          Aesthetic Physique Enthusiast Application (APE) is a fitness tracking application developed by NARBE LLC. This policy describes how the app collects, uses, and protects your information. APE does not operate backend servers. All user data is stored locally on your device or in your personal Google Drive account. NARBE LLC does not collect, store, access, or transmit any user data to its own servers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Health &amp; Fitness Disclaimer</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          APE is a personal fitness and nutrition tracking tool only. The information recorded in this app — including macros, workout logs, measurements, and coach recommendations — does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare or medical professional before starting any diet, exercise, or supplementation program. NARBE LLC is not responsible for any health outcomes resulting from use of the app.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data Storage</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          <strong>Local storage:</strong> Workout logs, nutrition entries, measurements, progress photos, profile information, saved meals, food history, and application settings are stored in your browser's local storage (IndexedDB and localStorage). This data never leaves your device unless you choose to sign in with Google.
        </p>
        <p className="text-sm text-text-secondary leading-relaxed">
          <strong>Google Drive storage:</strong> If you sign in with Google, the app stores a backup of your data in your personal Google Drive account — specifically in a hidden app-specific data folder and an "APE App" folder visible in your Drive. This data is stored in your Drive, not on any NARBE LLC server. Only you (and anyone you explicitly share access with, such as a coach) can access this data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Google API Usage &amp; Scopes</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          APE uses Google Sign-In for authentication and the Google Drive API for data synchronization. The app may request the following permissions depending on how you use it:
        </p>
        <ul className="text-sm text-text-secondary space-y-2 list-disc pl-5">
          <li>
            <strong>openid, email, profile</strong> — To identify your Google account and display your name and profile picture within the app. Your profile picture may be included in coach-to-client push notifications so clients can see which coach sent changes.
          </li>
          <li>
            <strong>drive.appdata</strong> — To read and write app-specific sync data in a hidden folder in your Google Drive that is not visible to you or other apps.
          </li>
          <li>
            <strong>drive.file</strong> — To create and manage files the app creates in your Google Drive, such as the "APE App" folder, progress photos, and coach sharing files. Under this scope, the app can only access files it has created.
          </li>
          <li>
            <strong>drive (full Google Drive access)</strong> — Requested only when you use the app in coach mode to view or push changes to a client's shared file. This broader scope is required because the client's shared file was created under their own Google account. This permission is used solely to read and write the specific client-shared files you have been granted access to. APE does not scan, read, index, or access any other files in your Google Drive under this scope.
          </li>
        </ul>
        <p className="text-sm text-text-secondary leading-relaxed">
          APE's use of Google API data adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent-blue underline" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. The app does not transfer Google user data to third parties, does not use Google user data for advertising, and does not use Google user data to train machine learning or AI models.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Coach Sharing</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          If you choose to share your data with a coach, the app creates a file in your Google Drive containing your profile, workout, nutrition, measurement, and check-in data. This file is shared with your coach's specific Google account using Google Drive's built-in sharing permissions. You control this sharing and can revoke access at any time from within the app, which deletes the shared file from your Drive.
        </p>
        <p className="text-sm text-text-secondary leading-relaxed">
          When a coach pushes changes or notifications to you, the coach's Google profile name and profile picture URL may be included in those changes and stored temporarily in your browser's local storage. This is used only to display the coach's identity in the notification card within the app and is not transmitted anywhere else.
        </p>
        <p className="text-sm text-text-secondary leading-relaxed">
          Progress photos shared with a coach are stored as individual files in your Google Drive's "APE App/Progress Photos" folder. The coach can only access these photos through authenticated Google Drive API calls using their own Google account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Third-Party API Keys</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          The app optionally supports USDA FoodData Central and Anthropic Claude API integrations. If you choose to enter API keys for these services, those keys are stored only in your browser's local storage on your device. They are never synced to Google Drive, transmitted to NARBE LLC, or shared with any third party. API calls using these keys are made directly from your browser to the respective service providers (USDA and Anthropic). Your use of those services is subject to their respective terms and privacy policies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data Collection</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          NARBE LLC does not collect any personal data, usage analytics, telemetry, crash reports, or behavioral data from APE users. The app runs entirely in your browser. There are no tracking pixels, analytics scripts, or third-party data collection tools embedded in the application.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data Deletion</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          You can delete all your data at any time from within the app (Settings → Data Management → Clear All Data). This removes all locally stored data and, if signed in with Google, also deletes the "APE App" folder and all app-specific data from your Google Drive. After deletion, no data remains on your device or in your Google Drive from this application.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Children's Privacy</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          APE is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. Since no data is transmitted to NARBE LLC, no children's data is collected or stored by us.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Limitation of Liability</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          To the maximum extent permitted by applicable law, NARBE LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, loss of fitness progress, personal injury, or any health outcome arising from the use or inability to use APE. Your use of this application is at your own risk.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Changes to This Policy</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          We may update this Privacy Policy from time to time. Changes will be reflected in the "Last updated" date at the top of this page. Continued use of the app after changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          If you have questions about this Privacy Policy, contact NARBE LLC at{' '}
          <a href="mailto:narbehousellc@gmail.com" className="text-accent-blue underline">narbehousellc@gmail.com</a>.
        </p>
      </section>

      <div className="pt-4 border-t border-border">
        <p className="text-[10px] text-text-muted text-center">
          APE — Aesthetic Physique Enthusiast · NARBE LLC · &copy; 2024–2026
        </p>
      </div>
      </div>
    </div>
  );
}
