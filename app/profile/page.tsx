import { cookies } from "next/headers";
import { ProfilePageClient } from "./profile-page-client";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const hasPendingSteamLink = Boolean(cookieStore.get("steam_pending_data")?.value);

  return <ProfilePageClient hasPendingSteamLink={hasPendingSteamLink} />;
}
