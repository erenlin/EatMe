// Sign-up form checks, kept out of SignupPage so they can be unit tested.
import type { Gender } from "../services/client";

export const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt on the backend rejects anything longer

export type SignupFields = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirm: string;
  dateOfBirth: string; // "YYYY-MM-DD" from the date input, or ""
  gender: Gender | "";
};

// Today as "YYYY-MM-DD" in the user's own time zone, for the date picker's max.
export function todayISO(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Returns the first problem with the form, or "" if it's ready to send.
export function checkSignup(f: SignupFields, today = todayISO()): string {
  if (!f.firstName.trim() || !f.lastName.trim()) return "Enter your first and last name.";
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "Enter a valid email address.";
  if (f.password.length < MIN_PASSWORD) {
    return `Your password needs at least ${MIN_PASSWORD} characters.`;
  }
  if (new TextEncoder().encode(f.password).length > MAX_PASSWORD_BYTES) {
    return "Your password is too long. Use 72 characters or fewer.";
  }
  if (f.password !== f.confirm) return "The two passwords don't match.";
  if (!f.dateOfBirth) return "Enter your date of birth.";
  if (f.dateOfBirth > today) return "Your date of birth can't be in the future.";
  if (!f.gender) return "Choose a gender.";
  return "";
}
