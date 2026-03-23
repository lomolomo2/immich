import { UUID_REGEX } from '$lib/constants';
import type { ParamMatcher } from '@sveltejs/kit';

// Matches UUID format, lomo-style asset names (e.g. "19439.jpg", "1.mp4"),
// or plain numeric IDs (e.g. "8" for album IDs)
const LOMO_ID_REGEX = /^(\d+\.\w+|\d+)$/;

export const match: ParamMatcher = (param: string) => {
  return UUID_REGEX.test(param) || LOMO_ID_REGEX.test(param);
};
