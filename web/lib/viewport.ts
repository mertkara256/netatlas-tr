/** Keep the map's sheet positioning in sync with RegionPanel.module.css. */
export function hasPhoneSheet(): boolean {
  return window.matchMedia("(max-width: 640px)").matches;
}
