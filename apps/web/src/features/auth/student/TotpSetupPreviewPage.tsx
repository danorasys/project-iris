import { useState } from "react";
import { TotpSetupScreen } from "./TotpSetupScreen";
import styles from "./GuardianRegistrationWizard.module.css";

/** Dev-only route (see AppRouter — only mounted when import.meta.env.DEV) to
 * exercise the real 2FA setup screen without redoing the whole registration
 * wizard first. Fully functional, not a mock: it renders the same
 * TotpSetupScreen used in the real flow, which calls the real setup/verify
 * endpoints — the QR it shows can actually be scanned, and a real code
 * actually gets verified. That's also why the route requires an existing
 * guardian session (see RequireRol on the route in AppRouter): those calls
 * need a real guardian access token, the same as any other authenticated
 * request from this app. */
export default function TotpSetupPreviewPage() {
  const [replayKey, setReplayKey] = useState(0);
  const [verified, setVerified] = useState(false);

  if (verified) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>2FA verificado correctamente</h1>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setVerified(false);
              setReplayKey((key) => key + 1);
            }}
          >
            Probar de nuevo
          </button>
        </div>
      </main>
    );
  }

  return <TotpSetupScreen key={replayKey} onVerified={() => setVerified(true)} />;
}
