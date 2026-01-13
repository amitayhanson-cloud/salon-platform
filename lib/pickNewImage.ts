/**
 * Picks a new image from a pool, ensuring it's different from the current one if possible.
 * @param pool - Array of image paths
 * @param current - Current image path (optional)
 * @returns A new image path from the pool
 */
export function pickNewImage(pool: string[], current?: string): string {
  if (pool.length === 0) {
    throw new Error("Image pool is empty");
  }

  // If pool has only one image, return it
  if (pool.length === 1) {
    return pool[0];
  }

  // If no current image, pick random
  if (!current) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Try to pick a different image (max 10 tries)
  let attempts = 0;
  let picked: string;
  
  do {
    picked = pool[Math.floor(Math.random() * pool.length)];
    attempts++;
    
    // If we found a different one, return it
    if (picked !== current) {
      return picked;
    }
    
    // If we've tried 10 times and still got the same, just return it
    // (This handles edge cases where pool might have duplicates)
    if (attempts >= 10) {
      return picked;
    }
  } while (picked === current);

  // Fallback (shouldn't reach here)
  return pool[0];
}
