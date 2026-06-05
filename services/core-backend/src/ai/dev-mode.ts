import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config';

const STATE_FILE = join(dirname(config.memoryPath), 'dev-mode.json');

let active = false;

// Carrega estado persistido (sobrevive a restarts do processo)
try {
  if (existsSync(STATE_FILE)) {
    active = JSON.parse(readFileSync(STATE_FILE, 'utf-8')).active === true;
    console.log(`[dev-mode] estado carregado: ${active ? 'LIGADO' : 'DESLIGADO'}`);
  }
} catch { /* ignora */ }

export function isDevModeActive(): boolean {
  return active;
}

export function setDevMode(on: boolean): void {
  active = on;
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ active }), 'utf-8');
  } catch { /* ignora */ }
  console.log(`[dev-mode] ${on ? 'ativado' : 'desativado'} (persistido)`);
}
