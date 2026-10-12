import { expect, test, type Page } from "@playwright/test";

const adminPassword = process.env.BLINK_PASSWORD ?? "changeme";
const apiKey = process.env.BLINK_API_KEY ?? "changeme-api-key";

async function signIn(page: Page) {
  await page.goto("/admin/");
  await expect(page.getByText("Short links. Instant redirects.")).toBeVisible();
  await page.getByLabel("Admin password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

test.describe("Blink admin E2E", () => {
  test("login, create, redirect, quarantine, expiry", async ({ page, request }) => {
    await signIn(page);

    const createSlug = uniqueSlug("e2e");
    await page.getByPlaceholder("https://example.com/very/long/path").fill(
      "https://example.com/e2e-create",
    );
    await page.getByPlaceholder("my-link").fill(createSlug);
    await page.getByRole("button", { name: "Shorten" }).click();
    await expect(page.locator(".success-box code")).toContainText(createSlug);

    const redirect = await request.get(`/${createSlug}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers().location).toBe("https://example.com/e2e-create");

    const article = page.locator("article").filter({ hasText: createSlug });
    await expect(article).toBeVisible();
    await article.getByRole("button", { name: "Quarantine" }).click();
    await expect(article.getByText("status:")).toContainText("quarantined");

    const quarantined = await request.get(`/${createSlug}`, { maxRedirects: 0 });
    expect(quarantined.status()).toBe(410);
    expect(await quarantined.text()).toContain("Link unavailable");

    const expireSlug = uniqueSlug("e2e-exp");
    const past = new Date(Date.now() - 60_000).toISOString();
    const created = await request.post("/api/links", {
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      data: {
        destination: "https://example.com/e2e-expired",
        slug: expireSlug,
        expiresAt: past,
      },
    });
    expect(created.status()).toBe(201);

    const expired = await request.get(`/${expireSlug}`, { maxRedirects: 0 });
    expect(expired.status()).toBe(410);
    expect(await expired.text()).toContain("Link expired");

    await page.goto(`/${expireSlug}`);
    await expect(page.getByRole("heading", { name: "Link expired" })).toBeVisible();
  });
});
