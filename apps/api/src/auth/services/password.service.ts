import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

/**
 * argon2id password hashing (SECURITY.md §2).
 * OWASP-recommended parameters; overridable via env for slower CI hardware.
 */
@Injectable()
export class PasswordService {
  private readonly memoryCost = Number(process.env.ARGON2_MEMORY_KB ?? 19456);
  private readonly timeCost = Number(process.env.ARGON2_TIME_COST ?? 2);
  private readonly parallelism = 1;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}