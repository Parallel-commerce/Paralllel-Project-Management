const PROJECT_LOGO_BUCKET = "project-logos";

export function projectLogoPublicUrl(logoPath: string | null | undefined) {
  if (!logoPath) {
    return null;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    return null;
  }

  return `${base}/storage/v1/object/public/${PROJECT_LOGO_BUCKET}/${logoPath}`;
}

export { PROJECT_LOGO_BUCKET };
