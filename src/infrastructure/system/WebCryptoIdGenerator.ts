import type { IdGenerator } from "../../application/ports/IdGenerator";

export class WebCryptoIdGenerator implements IdGenerator {
  generate(): string {
    return crypto.randomUUID();
  }
}
