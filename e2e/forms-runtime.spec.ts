import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { FORM_STARTERS } from "../lib/forms/starters";
import type { FormDefinitionV1 } from "../lib/forms/definition";

const runtimeSource = readFileSync("public/embed/v1.js", "utf8");
const publicId = "browser-form";
const allFieldsDefinition: FormDefinitionV1 = {
  version: 1,
  title: "Browser matrix form",
  description: "Every supported field type.",
  fields: [
    { id: "name", key: "name", kind: "text", label: "Name", required: true },
    { id: "email", key: "email", kind: "email", label: "Email", required: true },
    { id: "phone", key: "phone", kind: "phone", label: "Phone", required: true },
    { id: "url", key: "url", kind: "url", label: "Website", required: true },
    { id: "date", key: "date", kind: "date", label: "Date", required: true },
    { id: "count", key: "count", kind: "number", label: "Count", required: true },
    { id: "notes", key: "notes", kind: "textarea", label: "Notes", required: true },
    {
      id: "select",
      key: "select",
      kind: "select",
      label: "Select topic",
      required: true,
      options: [{ id: "sales", label: "Sales", value: "sales" }],
    },
    {
      id: "radio",
      key: "radio",
      kind: "radio",
      label: "Radio topic",
      required: true,
      options: [{ id: "alpha", label: "Alpha", value: "alpha" }],
    },
    { id: "consent", key: "consent", kind: "checkbox", label: "Consent", required: true },
    {
      id: "groups",
      key: "groups",
      kind: "checkbox-group",
      label: "Groups",
      required: true,
      options: [{ id: "one", label: "Group one", value: "one" }],
    },
    { id: "decision", key: "decision", kind: "yes-no", label: "Decision", required: true },
    { id: "updates", key: "updates", kind: "switch", label: "Updates", required: false },
    {
      id: "score",
      key: "score",
      kind: "slider",
      label: "Score",
      required: true,
      validation: { min: 0, max: 10, step: 1 },
    },
  ],
  submitLabel: "Send response",
  completion: { type: "message", message: "Browser submission accepted." },
};

async function installRuntimeMocks(
  page: Page,
  input: {
    siteUrl: string;
    responseStatus?: number;
    responseBody?: Record<string, unknown>;
    definition?: FormDefinitionV1;
    definitionStatus?: number;
    sessionRevision?: number;
    staleDefinition?: FormDefinitionV1;
  }
) {
  const definition = input.definition ?? allFieldsDefinition;
  const sessionRevision = input.sessionRevision ?? 1;
  let submitted: Record<string, unknown> | null = null;
  let requestedPlacement: string | null = null;
  await page.route("https://forms.router.so/embed/v1.js", (route) =>
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
      requestedPlacement = (route.request().postDataJSON() as { placement: string }).placement;
      await route.fulfill({
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          submitToken: "browser-token",
          revision: sessionRevision,
          expiresIn: 3600,
        }),
      });
      return;
    }
    if (route.request().url().endsWith("/leads")) {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      const status = input.responseStatus ?? 200;
      await route.fulfill({
        status,
        contentType: "application/json",
        headers,
        body: JSON.stringify(
          input.responseBody ?? (status === 429
            ? { error: "monthly_capacity_reached" }
            : { leadId: "lead-browser", completion: definition.completion })
        ),
      });
      return;
    }
    const requestedDefinition =
      input.staleDefinition && new URL(route.request().url()).searchParams.has("revision")
        ? definition
        : input.staleDefinition ?? definition;
    await route.fulfill({
      status: input.definitionStatus ?? 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify({
        publicId,
        revision: requestedDefinition === definition ? sessionRevision : 1,
        definition: requestedDefinition,
        attribution: { visible: false },
      }),
    });
  });
  return {
    submitted: () => submitted,
    requestedPlacement: () => requestedPlacement,
  };
}

async function openPlacement(
  page: Page,
  input: {
    siteUrl: string;
    placement: "hosted" | "embed" | "wordpress";
    definition?: FormDefinitionV1;
  }
) {
  const definition = input.definition ?? allFieldsDefinition;
  await page.route(input.siteUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <div data-router-form="${publicId}" data-router-placement="${input.placement}"></div>
        <script async src="https://forms.router.so/embed/v1.js"></script>
      </body></html>`,
    })
  );
  await page.goto(input.siteUrl);
  await expect(page.getByRole("heading", { name: definition.title })).toBeVisible();
}

async function completeEveryField(page: Page) {
  const mount = page.locator(`[data-router-form="${publicId}"]`);
  await mount.getByLabel("Name").fill("Ada Lovelace");
  await mount.getByLabel("Email").fill("ada@example.com");
  await mount.getByLabel("Phone").fill("+12025550123");
  await mount.getByLabel("Website").fill("https://example.com");
  await mount.getByLabel(/^Date/).fill("2026-09-01");
  await mount.getByLabel("Count").fill("4");
  await mount.getByLabel("Notes").fill("A browser-tested response.");
  await mount.getByLabel("Select topic").selectOption("sales");
  await mount.getByRole("radio", { name: "Alpha" }).check();
  await mount.getByRole("checkbox", { name: /Consent/ }).check();
  await mount.getByRole("checkbox", { name: "Group one" }).check();
  await mount.getByRole("radio", { name: "Yes" }).check();
  await mount.getByRole("checkbox", { name: "Updates" }).check();
  await mount.getByLabel("Score").fill("7");
  await mount.getByRole("button", { name: "Send response" }).click();
}

const placements = [
  { name: "hosted", placement: "hosted" as const, siteUrl: "https://forms.router.so/browser-form" },
  { name: "generic embed", placement: "embed" as const, siteUrl: "https://site.example/form" },
];

for (const scenario of placements) {
  test(`${scenario.name} renders and submits every field type`, async ({ page }) => {
    const observed = await installRuntimeMocks(page, { siteUrl: scenario.siteUrl });
    await openPlacement(page, scenario);
    await completeEveryField(page);

    await expect(page.getByText("Browser submission accepted.")).toBeVisible();
    expect(observed.requestedPlacement()).toBe(scenario.placement);
    expect(observed.submitted()).toMatchObject({
      values: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        consent: true,
        groups: ["one"],
        decision: true,
        score: 7,
      },
      submitToken: "browser-token",
    });
  });
}

for (const scenario of placements) {
  for (const [starterId, starterDefinition] of Object.entries(FORM_STARTERS)) {
    test(`${starterId} starter renders in ${scenario.name}`, async ({ page }) => {
      const siteUrl = `${scenario.siteUrl}/starters/${starterId}`;
      await installRuntimeMocks(page, { siteUrl, definition: starterDefinition });
      await openPlacement(page, {
        siteUrl,
        placement: scenario.placement,
        definition: starterDefinition,
      });

      await expect(
        page.getByRole("button", { name: starterDefinition.submitLabel })
      ).toBeVisible();
    });
  }
}

test("shows quota-paused and Router-unavailable states", async ({ page }) => {
  await installRuntimeMocks(page, {
    siteUrl: "https://site.example/quota",
    responseStatus: 429,
  });
  await openPlacement(page, {
    siteUrl: "https://site.example/quota",
    placement: "embed",
  });
  await completeEveryField(page);
  await expect(page.getByText("This form is temporarily paused.")).toBeVisible();

  const unavailable = await page.context().newPage();
  await unavailable.route("https://forms.router.so/embed/v1.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: runtimeSource })
  );
  await unavailable.route("https://forms.router.so/api/public/forms/**", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
  );
  await unavailable.route("https://site.example/unavailable", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div data-router-form="${publicId}"></div><script src="https://forms.router.so/embed/v1.js"></script>`,
    })
  );
  await unavailable.goto("https://site.example/unavailable");
  await expect(unavailable.getByText("This form is unavailable.")).toBeVisible();
});

test("shows server field errors accessibly and focuses the invalid control", async ({
  page,
}) => {
  await installRuntimeMocks(page, {
    siteUrl: "https://site.example/validation",
    responseStatus: 400,
    responseBody: {
      error: "validation_failed",
      fields: { email: ["This email is already registered."] },
    },
  });
  await openPlacement(page, {
    siteUrl: "https://site.example/validation",
    placement: "embed",
  });
  await completeEveryField(page);

  const email = page.getByLabel("Email");
  await expect(page.getByRole("alert")).toHaveText(
    "This email is already registered."
  );
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
});

test("follows a validated completion redirect", async ({ page }) => {
  const redirectDefinition: FormDefinitionV1 = {
    ...allFieldsDefinition,
    completion: { type: "redirect", url: "https://site.example/thanks" },
  };
  await page.route("https://site.example/thanks", (route) =>
    route.fulfill({ contentType: "text/html", body: "Redirect complete" })
  );
  await installRuntimeMocks(page, {
    siteUrl: "https://site.example/redirect",
    definition: redirectDefinition,
  });
  await openPlacement(page, {
    siteUrl: "https://site.example/redirect",
    placement: "embed",
    definition: redirectDefinition,
  });
  await completeEveryField(page);

  await expect(page).toHaveURL("https://site.example/thanks");
  await expect(page.getByText("Redirect complete")).toBeVisible();
});

test("refreshes a stale cached definition before rendering", async ({ page }) => {
  const currentDefinition: FormDefinitionV1 = {
    ...allFieldsDefinition,
    title: "Current form revision",
  };
  await installRuntimeMocks(page, {
    siteUrl: "https://site.example/stale",
    definition: currentDefinition,
    staleDefinition: { ...allFieldsDefinition, title: "Stale cached revision" },
    sessionRevision: 2,
  });
  await openPlacement(page, {
    siteUrl: "https://site.example/stale",
    placement: "embed",
    definition: currentDefinition,
  });

  await expect(page.getByText("Stale cached revision")).toHaveCount(0);
});

test("shows an unavailable state for a disabled or unpublished form", async ({
  page,
}) => {
  const siteUrl = "https://site.example/disabled";
  await installRuntimeMocks(page, { siteUrl, definitionStatus: 404 });
  await page.route(siteUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div data-router-form="${publicId}"></div><script src="https://forms.router.so/embed/v1.js"></script>`,
    })
  );
  await page.goto(siteUrl);

  await expect(page.getByText("This form is unavailable.")).toBeVisible();
});

test("exposes a loading state until the definition and render session arrive", async ({
  page,
}) => {
  let releaseResponses!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponses = resolve;
  });
  await page.route("https://forms.router.so/embed/v1.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: runtimeSource })
  );
  await page.route("https://forms.router.so/api/public/forms/**", async (route) => {
    await responseGate;
    if (route.request().url().endsWith("/render-session")) {
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          submitToken: "loading-token",
          revision: 1,
          expiresIn: 3600,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        publicId,
        revision: 1,
        definition: allFieldsDefinition,
        attribution: { visible: false },
      }),
    });
  });
  const siteUrl = "https://site.example/loading";
  await page.route(siteUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div data-router-form="${publicId}"></div><script src="https://forms.router.so/embed/v1.js"></script>`,
    })
  );

  await page.goto(siteUrl);
  const mount = page.locator(`[data-router-form="${publicId}"]`);
  await expect(mount).toHaveAttribute("aria-busy", "true");
  releaseResponses();
  await expect(
    mount.getByRole("heading", { name: allFieldsDefinition.title })
  ).toBeVisible();
  await expect(mount).not.toHaveAttribute("aria-busy", "true");
});

test("preserves the entered form and reports a revision race", async ({ page }) => {
  await installRuntimeMocks(page, {
    siteUrl: "https://site.example/revision-race",
    responseStatus: 409,
    responseBody: { error: "stale_form_revision", revision: 2 },
  });
  await openPlacement(page, {
    siteUrl: "https://site.example/revision-race",
    placement: "embed",
  });
  await completeEveryField(page);

  await expect(
    page.getByRole("alert").filter({
      hasText: "This form changed while you were filling it out.",
    })
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
});
