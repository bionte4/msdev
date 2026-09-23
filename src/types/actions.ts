export type ActionResult<T = undefined> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { success: false, error };
}
