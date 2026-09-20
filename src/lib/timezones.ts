/** IANA timezones for pickers. Computed on the server and passed down, so server and browser can't disagree. */
export function listTimezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  const zones = supported ? supported("timeZone") : [];
  // Some runtimes omit UTC from the list; make sure it is always selectable.
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}
