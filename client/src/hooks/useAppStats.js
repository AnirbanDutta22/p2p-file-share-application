import { useEffect, useState } from "react";
import socketService from "../services/socketService.js";

export function useAppStats() {
  const [stats, setStats] = useState({ totalUsersEver: null, onlineNow: null });

  useEffect(() => {
    socketService.connect();

    const handler = (payload) => {
      setStats({
        totalUsersEver: payload.totalUsersEver ?? null,
        onlineNow: payload.onlineNow ?? null,
      });
    };

    socketService.onAppStats(handler);
    socketService.whenConnected().then(() => socketService.requestAppStats());

    return () => socketService.offAppStats(handler);
  }, []);

  return stats;
}
