// Pi-side bits: the Touch Display 2 backlight, CPU temperature, uptime, weather.
import fs from 'node:fs';
import os from 'node:os';
import { fetchJson } from './util.js';

const BL_ROOT = '/sys/class/backlight';

function backlightDir() {
  try {
    const [first] = fs.readdirSync(BL_ROOT);
    return first ? `${BL_ROOT}/${first}` : null;
  } catch { return null; }
}

export const hasBacklight = () => backlightDir() !== null;

/** Set the panel's real backlight. Returns false off-Pi (the UI dims itself instead). */
export function setBrightness(percent) {
  const dir = backlightDir();
  if (!dir) return false;
  try {
    const max = Number(fs.readFileSync(`${dir}/max_brightness`, 'utf8'));
    const value = Math.round((max * Math.max(0, Math.min(100, percent))) / 100);
    fs.writeFileSync(`${dir}/brightness`, String(value));
    // bl_power 4 = backlight fully off, 0 = on. Only meaningful at 0%.
    try { fs.writeFileSync(`${dir}/bl_power`, percent <= 0 ? '4' : '0'); } catch {}
    return true;
  } catch (err) {
    console.error('[backlight]', err.message, '- did the install script add the udev rule?');
    return false;
  }
}

export function systemStats() {
  let tempC = null;
  try { tempC = Number(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')) / 1000; } catch {}
  return {
    tempC,
    load: os.loadavg()[0],
    memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    uptimeH: Math.round(os.uptime() / 3600),
    host: os.hostname(),
  };
}

const LAT = process.env.WEATHER_LAT || '33.7756';
const LON = process.env.WEATHER_LON || '-84.3963';
const UNITS = process.env.WEATHER_UNITS === 'celsius' ? 'celsius' : 'fahrenheit';

export async function loadWeather() {
  const q = new URLSearchParams({
    latitude: LAT, longitude: LON, timezone: 'auto', forecast_days: '2',
    temperature_unit: UNITS, wind_speed_unit: UNITS === 'celsius' ? 'kmh' : 'mph',
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset',
    hourly: 'precipitation_probability',
  });
  const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  // Next 12h rain chance, so the hub can say "rain around 3pm".
  const nowIdx = w.hourly.time.findIndex((t) => t >= w.current.time.slice(0, 13));
  const nextRain = w.hourly.time.slice(nowIdx, nowIdx + 12)
    .map((t, i) => ({ t, p: w.hourly.precipitation_probability[nowIdx + i] }))
    .find((h) => h.p >= 50);
  return {
    unit: UNITS === 'celsius' ? 'C' : 'F',
    temp: Math.round(w.current.temperature_2m),
    feels: Math.round(w.current.apparent_temperature),
    code: w.current.weather_code,
    isDay: w.current.is_day === 1,
    hi: Math.round(w.daily.temperature_2m_max[0]),
    lo: Math.round(w.daily.temperature_2m_min[0]),
    rainChance: w.daily.precipitation_probability_max[0],
    nextRain: nextRain ? { time: nextRain.t, chance: nextRain.p } : null,
    tomorrow: { hi: Math.round(w.daily.temperature_2m_max[1]), lo: Math.round(w.daily.temperature_2m_min[1]), code: w.daily.weather_code[1] },
    sunset: w.daily.sunset[0],
  };
}
