const AVATAR_BUCKET = "avatars";

export function profileAvatarPublicUrl(
  avatarPath: string | null | undefined,
) {
  if (!avatarPath) {
    return null;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    return null;
  }

  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${avatarPath}`;
}

export { AVATAR_BUCKET };
