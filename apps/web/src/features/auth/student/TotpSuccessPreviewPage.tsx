import { useState } from "react";
import { TotpSuccessScreen } from "./TotpSuccessScreen";

/** Dev-only route (see AppRouter — only mounted when import.meta.env.DEV) to
 * iterate on TotpSuccessScreen's animation without setting up 2FA on a real
 * account first. Purely presentational, no API calls, so no guardian
 * session is required. "Continuar" replays it instead of navigating
 * anywhere, there's nothing real to hand off to in a preview. */
export default function TotpSuccessPreviewPage() {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <TotpSuccessScreen
      key={replayKey}
      guardianFirstName="Ana"
      onContinue={() => setReplayKey((key) => key + 1)}
    />
  );
}
