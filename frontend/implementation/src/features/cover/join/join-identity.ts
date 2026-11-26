import type { StudentSession } from "@/src/api/classroom-client";
import { normalizeName } from "../name/normalize-name";

/** Dilempar oleh strategi `nameOnly` sampai kontrak backend tanpa nomor tersedia (§5.5 / O-3). */
export class NotSupportedError extends Error {
  constructor(message = "Strategi join tanpa nomor belum didukung kontrak backend.") {
    super(message);
    this.name = "NotSupportedError";
  }
}

export interface JoinIdentityContext {
  readonly joinToken: string | null | undefined;
  readonly joinClass?: (studentNumber: number, studentName: string) => Promise<StudentSession>;
}

export interface JoinIdentityStrategy {
  readonly kind: "ruler-plus-name" | "name-only";
  needsNumber(ctx: Pick<JoinIdentityContext, "joinToken">): boolean;
  join(ctx: JoinIdentityContext, name: string, number?: number): Promise<StudentSession>;
}

function hasValidToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.trim().length > 0;
}

/**
 * Strategi aktif (O-3 default):
 * - Tanpa joinToken -> cukup nama, tidak perlu penggaris nomor.
 * - Dengan joinToken -> butuh nomor dari penggaris, lalu panggil `joinClass(number, name)`.
 */
export const rulerPlusName: JoinIdentityStrategy = {
  kind: "ruler-plus-name",
  needsNumber(ctx) {
    return hasValidToken(ctx.joinToken);
  },
  async join(ctx, name, number) {
    if (!hasValidToken(ctx.joinToken) || !ctx.joinClass) {
      throw new Error("Token kelas dan joinClass wajib tersedia untuk bergabung.");
    }
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
      throw new Error("Nomor absen wajib bilangan bulat positif.");
    }
    const cleanName = normalizeName(name);
    if (!cleanName) {
      throw new Error("Nama siswa wajib diisi sebelum bergabung ke kelas.");
    }
    return ctx.joinClass(number, cleanName);
  },
};

/**
 * Strategi nonaktif (§5.5 / O-3): tetap melempar `NotSupportedError` walau flag
 * `NEXT_PUBLIC_JOIN_NAME_ONLY` menyala, karena backend masih mewajibkan `number`.
 */
export const nameOnly: JoinIdentityStrategy = {
  kind: "name-only",
  needsNumber() {
    return false;
  },
  async join() {
    throw new NotSupportedError();
  },
};

/** Selalu mengembalikan `rulerPlusName` sampai kontrak join baru dari Dias tersedia. */
export function getActiveJoinStrategy(): JoinIdentityStrategy {
  return rulerPlusName;
}
