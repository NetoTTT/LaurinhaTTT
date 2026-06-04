let active = false;

export function isDevModeActive(): boolean {
  return active;
}

export function setDevMode(on: boolean): void {
  active = on;
  console.log(`[dev-mode] ${on ? 'ativado' : 'desativado'}`);
}
