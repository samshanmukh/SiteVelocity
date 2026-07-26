import { expect, test } from "@playwright/test";

test("primary navigation, search, and evidence-backed events work as one product", async ({ page }) => {
  await page.goto("/command-center");
  await expect(page.getByRole("heading", { name: "What needs my attention?" })).toBeVisible();

  await page.getByRole("button", { name: "▤ Sites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sites", exact: true })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search sites" });
  await search.fill("CINNABAR");
  await expect(page.getByRole("cell", { name: /CINNABAR ST/i })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await page.getByRole("button", { name: "◉ Development Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Development Events", exact: true })).toBeVisible();
  await expect(page.getByText("Rezoning approved", { exact: true })).toHaveCount(2);
  await expect(page.getByText("EVIDENCE LINKED", { exact: true })).toHaveCount(2);
});

test("sponsor provider readiness is visible without exposing credentials", async ({ page }) => {
  await page.goto("/command-center");
  await page.getByRole("button", { name: "⊞ Data Sources", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Data Sources" })).toBeVisible();
  for (const provider of ["Nexla", "Respan", "Mem0", "ElevenLabs", "Mapbox"]) {
    await expect(page.getByText(provider, { exact: true })).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText(/sk-[A-Za-z0-9_-]{8,}/);
});

test("a watchlist can be created and assigned a real candidate", async ({ page }) => {
  await page.goto("/command-center");
  await page.getByRole("button", { name: "☆ Watchlists", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Watchlists", exact: true })).toBeVisible();

  const watchlistName = "Playwright monitoring";
  if (await page.getByText(watchlistName, { exact: true }).count() === 0) {
    await page.getByRole("textbox", { name: "Watchlist name" }).fill(watchlistName);
    await page.getByRole("button", { name: "CREATE", exact: true }).click();
    await expect(page.getByText(watchlistName, { exact: true })).toBeVisible();
  }

  const select = page.getByRole("combobox", { name: `Add site to ${watchlistName}` });
  if (await select.locator("option").count() > 1) await select.selectOption({ index: 1 });
  await expect(page.getByText(/monitored site/).first()).toBeVisible();
});
