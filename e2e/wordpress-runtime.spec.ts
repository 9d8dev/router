import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { FormDefinitionV1 } from "../lib/forms/definition";

const wordpressBaseUrl = process.env.WORDPRESS_BASE_URL;
const runtimeSource = readFileSync("public/embed/v1.js", "utf8");
const publicId = "browser-form";
const definition: FormDefinitionV1 = {
  version: 1,
  title: "Browser matrix form",
  description: "Rendered by the real WordPress integration.",
  fields: [
    {
      id: "fld_name",
      key: "name",
      kind: "text",
      label: "Name",
      required: true,
    },
  ],
  submitLabel: "Send response",
  completion: { type: "message", message: "WordPress submission accepted." },
};

type WordPressWindow = Window & {
  wp?: {
    apiFetch: (input: { path: string }) => Promise<unknown>;
    data: {
      select: (store: string) => { getBlocks: () => Array<{ clientId: string }> };
      dispatch: (store: string) => {
        selectBlock?: (clientId: string) => void;
        openGeneralSidebar?: (name: string) => void;
      };
    };
  };
};

async function installRouterMocks(page: Page) {
  const placements: string[] = [];
  await page.route("https://forms.router.so/embed/v1.js*", (route) =>
    route.fulfill({ contentType: "application/javascript", body: runtimeSource })
  );
  await page.route("https://forms.router.so/api/public/forms/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
      return;
    }

    const headers = { "access-control-allow-origin": "*" };
    if (route.request().url().endsWith("/render-session")) {
      placements.push(
        (route.request().postDataJSON() as { placement: string }).placement
      );
      await route.fulfill({
        contentType: "application/json",
        headers,
        body: JSON.stringify({ submitToken: "wordpress-token", expiresIn: 3600 }),
      });
      return;
    }
    if (route.request().url().endsWith("/leads")) {
      await route.fulfill({
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          leadId: "lead-wordpress",
          completion: definition.completion,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        publicId,
        revision: 1,
        definition,
        attribution: { visible: false },
      }),
    });
  });
  return placements;
}

async function login(page: Page) {
  await page.goto(`${wordpressBaseUrl}/wp-login.php`);
  await page.locator("#user_login").fill("admin");
  await page.locator("#user_pass").fill("password");
  await Promise.all([
    page.waitForURL(/\/wp-admin\//),
    page.locator("#wp-submit").click(),
  ]);
}

async function saveSiteToken(page: Page, token: string) {
  await page.goto(
    `${wordpressBaseUrl}/wp-admin/options-general.php?page=router-forms`
  );
  await page.locator("#router-forms-token").fill(token);
  await Promise.all([
    page.waitForURL(/settings-updated=true/),
    page.locator("#submit").click(),
  ]);
  await expect(page.getByText("Settings saved.")).toBeVisible();
}

async function blockPageId(page: Page): Promise<number> {
  const response = await page.request.get(
    `${wordpressBaseUrl}/wp-json/wp/v2/pages?slug=router-forms-block`
  );
  expect(response.ok()).toBe(true);
  const pages = (await response.json()) as Array<{ id: number }>;
  expect(pages).toHaveLength(1);
  return pages[0].id;
}

async function expectEditorPreview(page: Page) {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const heading = frame.getByRole("heading", { name: definition.title });
          if ((await heading.count()) && (await heading.first().isVisible())) {
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000 }
    )
    .toBe(true);
}

test.describe("Router Forms in WordPress", () => {
  test.skip(!wordpressBaseUrl, "WORDPRESS_BASE_URL is set by the wp-env matrix.");
  test.describe.configure({ mode: "serial" });

  test("connects through the local proxy and renders the Gutenberg picker and preview", async ({
    page,
  }) => {
    await installRouterMocks(page);
    await login(page);
    await saveSiteToken(page, "secret-test-token");

    const postId = await blockPageId(page);
    await page.goto(`${wordpressBaseUrl}/wp-admin/post.php?post=${postId}&action=edit`);
    await page.waitForFunction(
      () => Boolean((window as WordPressWindow).wp?.apiFetch)
    );

    const response = await page.evaluate(() =>
      (window as WordPressWindow).wp!.apiFetch({ path: "/router-forms/v1/forms" })
    );
    expect(response).toEqual({
      forms: [
        {
          publicId,
          name: "Browser Matrix",
          title: definition.title,
          revision: 1,
        },
      ],
    });
    await expectEditorPreview(page);

    await page.evaluate(() => {
      const wordpress = (window as WordPressWindow).wp!;
      const firstBlock = wordpress.data.select("core/block-editor").getBlocks()[0];
      wordpress.data.dispatch("core/block-editor").selectBlock?.(firstBlock.clientId);
      wordpress.data
        .dispatch("core/edit-post")
        .openGeneralSidebar?.("edit-post/block");
    });
    await expect(page.getByLabel("Published form")).toHaveValue(publicId);

    await saveSiteToken(page, "revoked-test-token");
    await page.goto(`${wordpressBaseUrl}/wp-admin/post.php?post=${postId}&action=edit`);
    await page.waitForFunction(
      () => Boolean((window as WordPressWindow).wp?.apiFetch)
    );
    const revokedMessage = await page.evaluate(async () => {
      try {
        await (window as WordPressWindow).wp!.apiFetch({
          path: "/router-forms/v1/forms",
        });
        return null;
      } catch (error) {
        if (error instanceof Error) return error.message;
        if (error && typeof error === "object" && "message" in error) {
          return String(error.message);
        }
        return JSON.stringify(error);
      }
    });
    expect(revokedMessage).toContain("invalid or revoked");

    await saveSiteToken(page, "secret-test-token");
  });

  for (const slug of ["router-forms-shortcode", "router-forms-block"]) {
    test(`${slug} renders and submits through the production runtime`, async ({
      page,
    }) => {
      const placements = await installRouterMocks(page);
      await page.goto(`${wordpressBaseUrl}/${slug}/`);
      await expect(page.getByRole("heading", { name: definition.title })).toBeVisible();
      expect(placements).toContain("wordpress");

      const themeInheritance = await page
        .locator(".router-form-v1")
        .evaluate((root) => {
          const rootStyle = getComputedStyle(root);
          const bodyStyle = getComputedStyle(document.body);
          return {
            rootFont: rootStyle.fontFamily,
            bodyFont: bodyStyle.fontFamily,
            rootColor: rootStyle.color,
            bodyColor: bodyStyle.color,
          };
        });
      expect(themeInheritance.rootFont).toBe(themeInheritance.bodyFont);
      expect(themeInheritance.rootColor).toBe(themeInheritance.bodyColor);

      await page.getByLabel("Name").fill("Ada Lovelace");
      await page.getByRole("button", { name: definition.submitLabel }).click();
      await expect(page.getByText("WordPress submission accepted.")).toBeVisible();
      expect(await page.content()).not.toContain("secret-test-token");
    });
  }

  test("initializes multiple WordPress forms on one page", async ({ page }) => {
    const placements = await installRouterMocks(page);
    await page.goto(`${wordpressBaseUrl}/router-forms-multiple/`);
    await expect(page.getByRole("heading", { name: definition.title })).toHaveCount(2);
    expect(placements.filter((placement) => placement === "wordpress")).toHaveLength(
      2
    );
  });
});
