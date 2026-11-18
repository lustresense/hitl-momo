/**
 * Is the app's shared camera stream live? GlobalCamera owns the stream and it can stop at any
 * time (unplugged, permission revoked), so the stage listens and also re-checks on a slow poll
 * for a track that ends without the stream being replaced.
 */
import { useEffect, useState } from "react";
import { getSharedStream, subscribeSharedStream } from "@/src/camera/shared-stream";

const LIVE_POLL_MS = 1000;

export function useSharedStreamLive(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const check = () =>
      setLive(Boolean(getSharedStream()?.getVideoTracks().some((track) => track.readyState === "live")));
    const unsubscribe = subscribeSharedStream(check);
    const id = window.setInterval(check, LIVE_POLL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, []);
  return live;
}
