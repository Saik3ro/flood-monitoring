import { getCameraFeeds } from "../db.server";

export async function getCameraFeedsApi() {
  return await getCameraFeeds();
}
