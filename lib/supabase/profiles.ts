import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  nickname: string;
  created_at: string;
  is_admin: boolean;
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
    .select("id, nickname, created_at, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Profile | null;
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
    .select("id, nickname, created_at, is_admin")
    .order("created_at", { ascending: true });

  if (profilesError) {
    throw profilesError;
  }

  const profileRows = (profiles ?? []) as Profile[];

  if (profileRows.length === 0) {
    return [] as AdminProfileListItem[];
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("team_members")
    .select("team_id, user_id, is_captain, created_at");

  if (membershipsError) {
    throw membershipsError;
  }

  const membershipRows = (memberships ?? []) as Array<{
    team_id: string;
    user_id: string;
  }>;

  const teamIds = Array.from(new Set(membershipRows.map((membership) => membership.team_id)));
  let teamNameById = new Map<string, string>();

  if (teamIds.length > 0) {
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds);

    if (teamsError) {
      throw teamsError;
    }

    teamNameById = new Map(
      ((teams ?? []) as Array<{ id: string; name: string }>).map((team) => [
        team.id,
        team.name,
      ])
    );
  }

  const membershipByUserId = new Map(
    membershipRows.map((membership) => [membership.user_id, membership.team_id])
  );

  return profileRows.map((profile) => {
    const currentTeamId = membershipByUserId.get(profile.id) ?? null;

    return {
      id: profile.id,
      nickname: profile.nickname,
      isAdmin: profile.is_admin,
      currentTeamId,
      currentTeamName: currentTeamId ? teamNameById.get(currentTeamId) ?? null : null,
    };
  }) as AdminProfileListItem[];
}
