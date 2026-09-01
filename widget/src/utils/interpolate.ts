/**
 * Replace `{name}` placeholders in a translation string. Unknown placeholders
 * are left untouched so a partially localized string still renders.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
