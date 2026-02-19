"use client";

import { useEffect, useRef, useState } from "react";

import { workoutSessionLocal } from "@/shared/lib/workout-session/workout-session.local";
import { useSession } from "@/features/auth/lib/auth-client";

import { syncWorkoutSessionAction } from "../actions/sync-workout-sessions.action";

interface SyncState {
  isSyncing: boolean;
  error: Error | null;
  lastSyncAt: Date | null;
}

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useSyncWorkoutSessions() {
  const { data: session, isPending: isSessionLoading } = useSession();
  const syncInProgressRef = useRef(false);

  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    error: null,
    lastSyncAt: null,
  });

  const syncSessions = async () => {
    if (!session?.user) return;
    if (syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    setSyncState((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      const localSessions = workoutSessionLocal
        .getAll()
        .filter((localSession) => localSession.status === "completed" || localSession.status === "active");

      for (const localSession of localSessions) {
        try {
          console.log("SYNC localSession raw:", localSession);

          const isCompletedSession = localSession.status === "completed";
          const payload = {
            session: {
              ...localSession,
              userId: localSession.userId === "local" ? session.user.id : localSession.userId,
              status: isCompletedSession ? "synced" : "active",
            },
          };

          console.log("SYNC payload final:", JSON.stringify(payload, null, 2));

          const result = await syncWorkoutSessionAction(payload);

          if (result && result.serverError) {
            console.log("result:", result);
            throw new Error(result.serverError);
          }

          if (result && result.data) {
            const { data } = result.data;

            if (data && isCompletedSession) {
              workoutSessionLocal.markSynced(localSession.id, data.id);
            }
          }
        } catch (error) {
          console.error(`Failed to sync session ${localSession.id}:`, error);
        }
      }

      workoutSessionLocal.purgeSynced();

      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date(),
      }));
    } catch (error) {
      console.log("error:", error);
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        error: error as Error,
      }));
    } finally {
      syncInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!isSessionLoading && session?.user) {
      syncSessions();
    }
  }, [session, isSessionLoading]);

  useEffect(() => {
    if (!session?.user) return;

    const interval = setInterval(syncSessions, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [session]);

  return {
    syncSessions,
    ...syncState,
  };
}
