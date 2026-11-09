// Дни плана храним как «YYYY-MM-DD» (в базе — DATE без времени). Здесь вся арифметика дней.
import { PLAN_TIME_ZONE } from "@/config/content";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** «ГГГГ-ММ-ДД» и такой день существует (31 февраля — нет). */
export function isDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const date = dayToDate(value);
  return !Number.isNaN(date.getTime()) && dateToDay(date) === value;
}

/** «Сегодня» в часовом поясе плана */
export function todayDay(now = new Date(), timeZone = PLAN_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Начало дня в часовом поясе плана (например, 00:00 по Алматы = 19:00 UTC накануне). Для полей со временем. */
export function dayStartInZone(day: string, timeZone = PLAN_TIME_ZONE): Date {
  const utcMidnight = dayToDate(day);
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(utcMidnight).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMs = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  return new Date(utcMidnight.getTime() - offsetMs);
}

export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return dateToDay(new Date(dayToDate(day).getTime() + days * DAY_MS));
}

/** 0 — понедельник … 6 — воскресенье */
export function weekdayIndex(day: string): number {
  return (dayToDate(day).getUTCDay() + 6) % 7;
}

export function weekStart(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, months: number): string {
  const date = dayToDate(monthStart(day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return dateToDay(date);
}

/** Последний день месяца */
export function monthEnd(day: string): string {
  return addDays(addMonths(day, 1), -1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayToDate(to).getTime() - dayToDate(from).getTime()) / DAY_MS);
}

export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const WEEKDAY_NAMES = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTH_GENITIVE = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function monthTitle(day: string): string {
  const name = MONTH_NAMES[Number(day.slice(5, 7)) - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${day.slice(0, 4)}`;
}

export function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTH_GENITIVE[Number(day.slice(5, 7)) - 1]}`;
}
