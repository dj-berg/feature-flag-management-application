"use client";

import { useBooleanFlagValue } from "@openfeature/react-sdk";

export function FlagView() {
  const enabled = useBooleanFlagValue("some-flag", false);

  return (
    <main>
      <h1>OpenFeature Acceptance</h1>
      <p>Flag key: some-flag</p>
      <p>Value: {String(enabled)}</p>
    </main>
  );
}
