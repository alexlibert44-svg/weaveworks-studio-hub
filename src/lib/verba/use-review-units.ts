import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { listReviewUnits } from "./reviews";
import { useLearner } from "@/components/verba/AppGate";

/** Shared review data for Home, Review and Word Set pages, plus a ticking clock. */
export function useReviewUnits(deviceId: string) {
  const { learner } = useLearner();
  const targetLanguage = learner.learning_language;
  const query = useQuery({
    queryKey: ["review-units", deviceId, targetLanguage],
    queryFn: () => listReviewUnits(deviceId, targetLanguage),
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return { units: query.data, now, isPending: query.isPending };
}
