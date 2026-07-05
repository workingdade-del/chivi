const MENU_IMAGES_BUCKET = "menu-images";

/**
 * Photos réelles déjà présentes dans le brand kit — servies en statique,
 * pas depuis Supabase Storage. Tout autre image_path pointe vers le
 * bucket "menu-images" (à uploader).
 */
const BRAND_KIT_PHOTOS = new Set(["dish-haricot.jpg", "shrimp-fork.jpg"]);

export function getMenuImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (BRAND_KIT_PHOTOS.has(imagePath)) {
    return `/brand_kit/assets/photos/${imagePath}`;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${MENU_IMAGES_BUCKET}/${imagePath}`;
}
