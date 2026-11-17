import { register as registerAccount } from "./authApi.js";

export function register(email, name, password) {
  return registerAccount({ email, name, password });
}
