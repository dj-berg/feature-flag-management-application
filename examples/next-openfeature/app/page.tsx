import { FeatureFlagAppProvider } from "./feature-flags-provider";
import { FlagView } from "./flag-view";

export default function Page() {
  return (
    <FeatureFlagAppProvider>
      <FlagView />
    </FeatureFlagAppProvider>
  );
}
