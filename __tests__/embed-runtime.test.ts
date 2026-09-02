import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FormDefinitionV1 } from "../lib/forms/definition";
import { FORM_STARTERS } from "../lib/forms/starters";

const runtimeSource = readFileSync(resolve("public/embed/v1.js"), "utf8");

const definition: FormDefinitionV1 = {
  version: 1,
  title: "All fields",
  description: "Runtime coverage",
  submitLabel: "Send",
  completion: { type: "message", message: "Thanks" },
  fields: [
    { id: "text", key: "text", kind: "text", label: "Text", required: true },
    { id: "email", key: "email", kind: "email", label: "Email", required: true },
    { id: "phone", key: "phone", kind: "phone", label: "Phone", required: false },
    { id: "url", key: "url", kind: "url", label: "URL", required: false },
    { id: "date", key: "date", kind: "date", label: "Date", required: false },
    { id: "number", key: "number", kind: "number", label: "Number", required: false },
    { id: "textarea", key: "textarea", kind: "textarea", label: "Long text", required: false },
    { id: "select", key: "select", kind: "select", label: "Select", required: false, options: [{ id: "select_a", label: "A", value: "a" }] },
    { id: "radio", key: "radio", kind: "radio", label: "Radio", required: false, options: [{ id: "radio_a", label: "A", value: "a" }] },
    { id: "checkbox", key: "checkbox", kind: "checkbox", label: "Checkbox", required: false },
    { id: "group", key: "group", kind: "checkbox-group", label: "Group", required: false, options: [{ id: "group_a", label: "A", value: "a" }] },
    { id: "yesno", key: "yesno", kind: "yes-no", label: "Yes or no", required: false },
    { id: "switch", key: "switch", kind: "switch", label: "Switch", required: false },
    { id: "slider", key: "slider", kind: "slider", label: "Slider", required: false, validation: { min: 1, max: 10, step: 1 } },
  ],
};

describe("embed v1 runtime", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete (window as unknown as { RouterFormsV1?: unknown }).RouterFormsV1;
    window.eval(runtimeSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders all field kinds with native labels and no framework wrapper", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const runtime = (window as unknown as {
      RouterFormsV1: { mount: (target: Element, options: object) => Promise<void> };
    }).RouterFormsV1;

    await runtime.mount(target, { definition, publicId: "preview", preview: true });

    expect(target.querySelector("h2")?.textContent).toBe("All fields");
    expect(target.querySelectorAll("[data-router-field]")).toHaveLength(14);
    expect(target.querySelector('input[type="email"]')).not.toBeNull();
    expect(target.querySelector('input[type="range"]')).not.toBeNull();
    expect(target.querySelectorAll("[required]").length).toBeGreaterThan(0);
    expect(target.querySelectorAll("fieldset > legend")).toHaveLength(3);
    expect(target.querySelector("[data-reactroot]")).toBeNull();
  });

  it("mounts multiple previews independently and installs scoped styles once", async () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const runtime = (window as unknown as {
      RouterFormsV1: { mount: (target: Element, options: object) => Promise<void> };
    }).RouterFormsV1;

    await Promise.all([
      runtime.mount(first, { definition, publicId: "one", preview: true }),
      runtime.mount(second, { definition, publicId: "two", preview: true }),
    ]);

    expect(first.querySelector("form")).not.toBeNull();
    expect(second.querySelector("form")).not.toBeNull();
    expect(document.querySelectorAll("#router-forms-v1-styles")).toHaveLength(1);
  });

  it("refreshes a cached definition that does not match the render session", async () => {
    const target = document.createElement("div");
    const currentDefinition = { ...definition, title: "Current revision" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            publicId: "stale-form",
            revision: 1,
            definition: { ...definition, title: "Cached revision" },
            attribution: { visible: false },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            submitToken: "revision-two-token",
            revision: 2,
            expiresIn: 3600,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            publicId: "stale-form",
            revision: 2,
            definition: currentDefinition,
            attribution: { visible: false },
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    target.setAttribute("data-router-form", "stale-form");
    const runtime = (window as unknown as {
      RouterFormsV1: { mount: (target: Element) => Promise<void> };
    }).RouterFormsV1;

    await runtime.mount(target);

    expect(target.querySelector("h2")?.textContent).toBe("Current revision");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain("?revision=2");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ cache: "no-store" });
  });

  it("installs runtime styles in an iframe preview document", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDocument = iframe.contentDocument!;
    const target = iframeDocument.createElement("div");
    iframeDocument.body.appendChild(target);
    const runtime = (window as unknown as {
      RouterFormsV1: { mount: (target: Element, options: object) => Promise<void> };
    }).RouterFormsV1;

    await runtime.mount(target, {
      definition,
      publicId: "iframe-preview",
      preview: true,
    });

    expect(target.querySelector("form")).not.toBeNull();
    expect(iframeDocument.querySelectorAll("#router-forms-v1-styles")).toHaveLength(
      1
    );
  });

  it("allows any option to satisfy a required checkbox group", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const runtime = (window as unknown as {
      RouterFormsV1: { mount: (target: Element, options: object) => Promise<void> };
    }).RouterFormsV1;
    const groupDefinition: FormDefinitionV1 = {
      ...definition,
      fields: [
        {
          id: "group",
          key: "group",
          kind: "checkbox-group",
          label: "Group",
          required: true,
          options: [
            { id: "group_a", label: "A", value: "a" },
            { id: "group_b", label: "B", value: "b" },
          ],
        },
      ],
    };

    await runtime.mount(target, {
      definition: groupDefinition,
      publicId: "required-group",
      preview: true,
    });

    const form = target.querySelector("form")!;
    const checkboxes = target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes[1].click();
    expect(form.checkValidity()).toBe(true);
  });

  it.each(["radio", "checkbox-group"] as const)(
    "does not select an %s option when its value is the string undefined",
    async (kind) => {
      const target = document.createElement("div");
      document.body.appendChild(target);
      const runtime = (window as unknown as {
        RouterFormsV1: {
          mount: (target: Element, options: object) => Promise<void>;
        };
      }).RouterFormsV1;
      const choiceDefinition: FormDefinitionV1 = {
        ...definition,
        fields: [
          {
            id: "choice",
            key: "choice",
            kind,
            label: "Choice",
            required: true,
            options: [
              {
                id: "undefined_option",
                label: "No default",
                value: "undefined",
              },
            ],
          },
        ],
      };

      await runtime.mount(target, {
        definition: choiceDefinition,
        publicId: `undefined-${kind}`,
        preview: true,
      });

      const input = target.querySelector<HTMLInputElement>("input")!;
      expect(input.checked).toBe(false);
      expect(target.querySelector("form")!.checkValidity()).toBe(false);
    }
  );

  it("uses unique control IDs when the same form is mounted twice", async () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const runtime = (window as unknown as {
      RouterFormsV1: { mount: (target: Element, options: object) => Promise<void> };
    }).RouterFormsV1;

    await Promise.all([
      runtime.mount(first, { definition, publicId: "duplicate", preview: true }),
      runtime.mount(second, { definition, publicId: "duplicate", preview: true }),
    ]);

    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]"))
      .map((element) => element.id)
      .filter((id) => id !== "router-forms-v1-styles");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(Object.entries(FORM_STARTERS))(
    "renders the %s starter through the production runtime",
    async (_starterId, starter) => {
      const target = document.createElement("div");
      document.body.appendChild(target);
      const runtime = (window as unknown as {
        RouterFormsV1: {
          mount: (target: Element, options: object) => Promise<void>;
        };
      }).RouterFormsV1;

      await runtime.mount(target, {
        definition: starter,
        publicId: `starter-${_starterId}`,
        preview: true,
      });

      expect(target.querySelector("form")).not.toBeNull();
      expect(target.querySelectorAll("[data-router-field]")).toHaveLength(
        starter.fields.length
      );
    }
  );
});
