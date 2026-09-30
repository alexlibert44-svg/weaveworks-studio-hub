import { useEffect, useState } from "react";

import { readDeviceId } from "@/lib/verba/device";

/** Device identity is browser-only, so it resolves after hydration. */
export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    setDeviceId(readDeviceId());
  }, []);
  return deviceId;
}
