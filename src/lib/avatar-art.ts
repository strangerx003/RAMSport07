/**
 * Deterministic default avatars.
 *
 * Accounts without a photo get one of the line-art people illustrations in
 * `public/avatars` ? the same Notion-style line drawings used for profile
 * pictures in modern collaboration tools, instead of initials or a gradient.
 *
 * The artwork is bundled with the app (DiceBear "notionists" collection, CC0 ?
 * see the README), so nothing is fetched at runtime. The account name picks the
 * picture, so the same person always gets the same face and no file has to be
 * stored for it.
 */

/** Bundled line-art avatars ? one is picked from the account-name hash. */
const AVATARS = [
  "/avatars/notionists-1.svg",
  "/avatars/notionists-2.svg",
  "/avatars/notionists-3.svg",
  "/avatars/notionists-4.svg",
  "/avatars/notionists-5.svg",
  "/avatars/notionists-6.svg",
  "/avatars/notionists-7.svg",
  "/avatars/notionists-8.svg",
];

export type StockAvatar = { id: string; label: string; src: string };

/**
 * The illustrations are also offered as a chooseable profile picture, so an
 * account can keep a stock avatar instead of uploading a photo.
 */
export const STOCK_AVATARS: StockAvatar[] = AVATARS.map((src, index) => ({
  id: `notionists-${index + 1}`,
  label: `Illustration ${index + 1}`,
  src,
}));

/** Resolves a stored stock-avatar id to its bundled file, or null when unknown. */
export function stockAvatarPath(id: string | null | undefined): string | null {
  if (!id) return null;
  return STOCK_AVATARS.find(avatar => avatar.id === id)?.src ?? null;
}

/**
 * True when a picture is one of the bundled illustrations. Uploaded photos are
 * never mirrored; only the bundled line-art is drawn facing the other way.
 */
export function isStockAvatarSrc(src: string | null | undefined): boolean {
  return typeof src === "string" && AVATARS.includes(src);
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}

/** Returns the bundled illustration used as the default picture for a name. */
export function avatarArt(name: string): string {
  const seed = name.trim() || "RAMSport";
  return AVATARS[hash(seed) % AVATARS.length];
}
