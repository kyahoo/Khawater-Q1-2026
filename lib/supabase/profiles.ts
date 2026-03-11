import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function normalizeJoinedRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === "object") {
    return [value as T];
  }

  return [];
}

export type Profile = {
  id: string;
  nickname: string;
  username: string | null;
  avatarUrl: string | null;
  steamId: string | null;
  created_at: string;
  is_admin: boolean;
  behaviorScore: number;
};

export type AdminProfileListItem = {
  id: string;
  nickname: string;
  isAdmin: boolean;
  currentTeamId: string | null;
  currentTeamName: string | null;
};

export async function getProfileByUserId(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, nickname, username, avatar_url, steam_id, created_at, is_admin, behavior_score"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    nickname: data.nickname,
    username: data.username ?? null,
    avatarUrl: data.avatar_url ?? null,
    steamId: data.steam_id ?? null,
    created_at: data.created_at,
    is_admin: data.is_admin,
    behaviorScore: data.behavior_score,
  } as Profile;
}

export async function upsertProfile(params: {
  id: string;
  nickname: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("profiles").upsert({
    id: params.id,
    nickname: params.nickname,
  });

  if (error) {
    throw error;
  }
}

export async function listProfilesWithTeamMeta() {
  const supabase = getSupabaseBrowserClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nickname, created_at, is_admin, team_members(team_id, created_at, teams(id, name))")
    .order("created_at", { ascending: true });

  if (profilesError) {
    throw profilesError;
  }

  const profileRows = (profiles ?? []) as unknown as Array<{
    id: string;
    nickname: string;
    is_admin: boolean;
    team_members:
      | Array<{
          team_id: string;
          created_at: string;
          teams:
            | {
                id: string;
                name: string;
              }
            | Array<{
                id: string;
                name: string;
              }>
            | null;
        }>
      | null;
  }>;

  if (profileRows.length === 0) {
    return [] as AdminProfileListItem[];
  }

  return profileRows.map((profile) => {
    const latestMembership = normalizeJoinedRows<{
      team_id: string;
      created_at: string;
      teams:
        | {
            id: string;
            name: string;
          }
        | Array<{
            id: string;
            name: string;
          }>
        | null;
    }>(profile.team_members)
      .slice()
      .sort(
      (membershipA, membershipB) =>
        new Date(membershipB.created_at).getTime() -
        new Date(membershipA.created_at).getTime()
      )[0];
    const currentTeam = latestMembership
      ? Array.isArray(latestMembership.teams)
        ? latestMembership.teams[0]
        : latestMembership.teams
      : null;
    const currentTeamId = latestMembership?.team_id ?? null;

    return {
      id: profile.id,
      nickname: profile.nickname,
      isAdmin: profile.is_admin,
      currentTeamId,
      currentTeamName: currentTeam?.name ?? null,
    };
  }) as AdminProfileListItem[];
}
