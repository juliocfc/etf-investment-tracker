import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Truncates a number to a fixed number of decimal places without rounding up.
 * Handles floating-point precision issues (e.g., 1070 * 30.56) by normalizing
 * the value first.
 */
export function truncateNumber(value: number, decimals: number = 2): number {
  // 1. Fix floating point noise (e.g. 32699.199999999997 -> 32699.2)
  // We use 10 decimal places as a safe "high precision" intermediate
  const normalized = Math.round(value * 1e10) / 1e10;
  
  // 2. Truncate towards zero
  const factor = Math.pow(10, decimals);
  return normalized < 0 
    ? Math.ceil(normalized * factor) / factor 
    : Math.floor(normalized * factor) / factor;
}

/**
 * Formats a number as a currency string with comma separators
 */
export function formatCurrency(value: number | string | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return "$0.00";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
}

/**
 * Formats a number with comma separators but without the currency symbol
 */
export function formatNumber(value: number | string | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return "0";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "0";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
}

/**
 * Formats a date to YYYY-MM-DD using local time
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date to YYYY-MM-DD using UTC time
 * Crucial for displaying transaction dates from ISO strings correctly
 */
export function formatUTCDate(date: Date | string | number): string {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
