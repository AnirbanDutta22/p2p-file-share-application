import { redis } from "../config/redis.js";

const USER_SET_KEY = "knownVisitors";

export class StatsService {
  constructor() {}

  /**
   * Returns true if this is a brand-new browser.
   */
  async registerUser(userId) {
    if (!userId || typeof userId !== "string") {
      return false;
    }

    const added = await redis.sadd(USER_SET_KEY, userId);

    return added === 1;
  }

  async getSnapshot(onlineNow) {
    const totalUsersEver = await redis.scard(USER_SET_KEY);

    return {
      totalUsersEver,
      onlineNow,
    };
  }
}
