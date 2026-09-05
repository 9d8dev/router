export function formsNavigationEnabled(): boolean {
  return process.env.FORMS_NAV_ENABLED === "true";
}

export function publicFormsEnabled(): boolean {
  return process.env.FORMS_PUBLIC_ENABLED !== "false";
}
