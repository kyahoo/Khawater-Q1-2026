import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";

const TEAM_NAME = "Test Team Alpha";
const DEFAULT_PASSWORD = "KhawaterE2E!234";
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

const env = loadLocalEnv();
const baseURL = getEnv("PLAYWRIGHT_BASE_URL") ?? getEnv("BASE_URL") ?? DEFAULT_BASE_URL;

test.use({ baseURL });

type TestUserCredentials = {
  email: string;
  password: string;
  nickname: string;
};

test.describe("Team management", () => {
  test.afterEach(async ({ browserName }, testInfo) => {
    testInfo.setTimeout(60_000);
    const credentials = getTestUserCredentials(browserName);
    const adminClient = createAdminClient();
    const testUser = await ensureTestUser(adminClient, credentials);

    await resetTeamState(adminClient, testUser.id);
  });

  test("logs in, creates a team, verifies it, and cleans it up", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    const credentials = getTestUserCredentials(browserName);
    const adminClient = createAdminClient();
    const testUser = await ensureTestUser(adminClient, credentials);

    await resetTeamState(adminClient, testUser.id);
    await loginViaUi(page, credentials);

    await page.goto("/my-team");
    await expect(page).toHaveURL(/\/my-team$/);
    await expect(
      page.getByRole("heading", { name: "Моя команда" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("You are not part of a team yet.")).toBeVisible();

    await page.getByRole("link", { name: "Create Team" }).click();
    await expect(page).toHaveURL(/\/create-team$/);

    await page.getByPlaceholder("Enter team name").fill(TEAM_NAME);

    await Promise.all([
      page.waitForURL(/\/my-team$/),
      page.getByRole("button", { name: "Create Team" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: TEAM_NAME })).toBeVisible({
      timeout: 15_000,
    });

    await cleanupTeamViaUi(page);

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText("No team yet").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Team" })).toBeVisible();
  });
});

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return new Map<string, string>();
  }

  const parsed = new Map<string, string>();
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed.set(key, value);
  }

  return parsed;
}

function getEnv(name: string) {
  return process.env[name] ?? env.get(name);
}

function requireEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getTestUserCredentials(browserName: string): TestUserCredentials {
  const configuredEmail = getEnv("E2E_TEAM_MANAGEMENT_EMAIL");
  const email = configuredEmail
    ? configuredEmail.replace("{browser}", browserName)
    : `e2e-team-management+${browserName}@khawater.test`;

  return {
    email,
    password: getEnv("E2E_TEAM_MANAGEMENT_PASSWORD") ?? DEFAULT_PASSWORD,
    nickname: getEnv("E2E_TEAM_MANAGEMENT_NICKNAME") ?? `E2E ${browserName}`,
  };
}

function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function ensureTestUser(
  adminClient: SupabaseClient<Database>,
  credentials: TestUserCredentials
): Promise<User> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
    user_metadata: {
      nickname: credentials.nickname,
    },
  });

  if (!error && data.user) {
    await ensureProfile(adminClient, data.user.id, credentials.nickname);
    return data.user;
  }

  if (!isDuplicateUserError(error)) {
    throw error ?? new Error("Could not create the E2E test user.");
  }

  const existingUser = await findUserByEmail(adminClient, credentials.email);

  if (!existingUser) {
    throw new Error("The E2E user already exists, but it could not be fetched.");
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    existingUser.id,
    {
      password: credentials.password,
      email_confirm: true,
      user_metadata: {
        nickname: credentials.nickname,
      },
    }
  );

  if (updateError) {
    throw updateError;
  }

  await ensureProfile(adminClient, existingUser.id, credentials.nickname);
  return existingUser;
}

async function findUserByEmail(
  adminClient: SupabaseClient<Database>,
  email: string
): Promise<User | null> {
  const normalizedEmail = email.toLowerCase();
  let pageNumber = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page: pageNumber,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const matchingUser =
      data.users.find(
        (candidate) => candidate.email?.toLowerCase() === normalizedEmail
      ) ?? null;

    if (matchingUser) {
      return matchingUser;
    }

    const fetchedUserCount = data.users.length;
    const fetchedPageCount = data.perPage ?? fetchedUserCount;

    if (fetchedUserCount < fetchedPageCount) {
      return null;
    }

    pageNumber += 1;
  }
}

function isDuplicateUserError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /already exists|already registered|already been registered/i.test(
    error.message
  );
}

async function ensureProfile(
  adminClient: SupabaseClient<Database>,
  userId: string,
  nickname: string
) {
  const { error } = await adminClient.from("profiles").upsert({
    id: userId,
    nickname,
  });

  if (error) {
    throw error;
  }
}

async function resetTeamState(
  adminClient: SupabaseClient<Database>,
  userId: string
) {
  const { data: ownedTeams, error: ownedTeamsError } = await adminClient
    .from("teams")
    .select("id")
    .eq("created_by", userId);

  if (ownedTeamsError) {
    throw ownedTeamsError;
  }

  const ownedTeamIds = (ownedTeams ?? []).map((team) => team.id);

  if (ownedTeamIds.length > 0) {
    const { error: teamEntryDeleteError } = await adminClient
      .from("tournament_team_entries")
      .delete()
      .in("team_id", ownedTeamIds);

    if (teamEntryDeleteError) {
      throw teamEntryDeleteError;
    }

    const { error: teamDeleteError } = await adminClient
      .from("teams")
      .delete()
      .in("id", ownedTeamIds);

    if (teamDeleteError) {
      throw teamDeleteError;
    }
  }

  const { error: membershipDeleteError } = await adminClient
    .from("team_members")
    .delete()
    .eq("user_id", userId);

  if (membershipDeleteError) {
    throw membershipDeleteError;
  }

  const { error: confirmationDeleteError } = await adminClient
    .from("tournament_confirmations")
    .delete()
    .eq("user_id", userId);

  if (confirmationDeleteError) {
    throw confirmationDeleteError;
  }
}

async function loginViaUi(page: Page, credentials: TestUserCredentials) {
  await page.goto("/auth");

  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);

  await Promise.all([
    page.waitForURL(/\/profile$/),
    page.getByRole("button", { name: "Login" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForLoadState("networkidle");
}

async function cleanupTeamViaUi(page: Page) {
  const deleteTeamButton = page.getByRole("button", { name: "Delete Team" });
  const leaveTeamButton = page.getByRole("button", { name: "Leave Team" });

  if (await deleteTeamButton.isVisible()) {
    await Promise.all([page.waitForURL(/\/profile$/), deleteTeamButton.click()]);
    return;
  }

  if (await leaveTeamButton.isVisible()) {
    await Promise.all([page.waitForURL(/\/profile$/), leaveTeamButton.click()]);
    return;
  }

  throw new Error("Could not find a Leave Team or Delete Team button for cleanup.");
}
